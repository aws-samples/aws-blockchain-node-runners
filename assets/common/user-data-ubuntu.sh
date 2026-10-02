#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Node bootstrap. CDK wraps this script in a MIME part of type
# text/x-shellscript-per-boot, so cloud-init runs it on EVERY boot (it re-reads
# user data from IMDS on each boot, so a stack update that changes UserData is
# picked up on the stop/start CloudFormation performs).
#
# Each boot it rewrites /etc/cdk_environment, then a gate decides:
#   skip   - config fingerprint matches the last successful setup and all data
#            volumes are mounted (plain reboot, INSTANCE_TYPE resize)
#   apply  - first boot, interrupted setup, changed config/assets, or missing
#            data mounts: refresh assets, then run assets/common/node-setup.sh
#            (storage setup is non-destructive; node.service is stopped and
#            the blueprint's node.sh re-run against the existing data)
#
# NOTE: this file is a CloudFormation Fn::Sub template. Do not write a dollar
# sign followed by an opening brace for shell variables; use plain $VAR, or
# the Fn::Sub escape (dollar, brace, exclamation mark) for a literal.

set +e

SCRIPT_NAME="[user-data-ubuntu]"
CDK_ENV_FILE="/etc/cdk_environment"
STATE_DIR="/var/lib/node-runner"
PER_BOOT_DIR="/var/lib/cloud/scripts/per-boot"
PER_BOOT_MARKER="text/x-shellscript-per-boot"
BOOTSTRAP_ASSETS_PATH="/opt/assets"
PROTOCOL_ASSETS_PATH="/opt/blueprints"
COMMON_ASSETS_PATH="$BOOTSTRAP_ASSETS_PATH/common"

# Write the CDK-injected variables to /etc/cdk_environment, replacing (never
# appending to) the previous file.
#
# Values are written as single-quoted assignments (KEY='value'). This is a
# security boundary: it prevents the shell from expanding or executing any
# value, both when this file is generated AND when it is later sourced - a
# malicious value like $(...) or one containing & ; | would otherwise run as
# root. CDK single-quote-escapes every value before injection (see
# UserDataManager.injectVariables).
#
# The heredoc delimiter is single-quoted ('CDK_ENVIRONMENT_EOF') so the shell
# performs NO expansion of the body at write time. CloudFormation has already
# substituted the placeholders into the body before the instance runs.
write_cdk_environment() {
    local tmp="$CDK_ENV_FILE.tmp"
    (umask 077; cat > "$tmp" <<'CDK_ENVIRONMENT_EOF'
#AWS Configuration
AWS_ACCOUNT_ID='${AWS_ACCOUNT_ID}'
AWS_REGION='${AWS_REGION}'

#Blockchain Configuration
BLOCKCHAIN_PROTOCOL='${BLOCKCHAIN_PROTOCOL}'
DEPLOYMENT_MODE='${DEPLOYMENT_MODE}'

#Instance Configuration
INSTANCE_TYPE='${INSTANCE_TYPE}'
CPU_TYPE='${CPU_TYPE}'

#Generic Protocol Configuration
BC_NETWORK='${BC_NETWORK}'
CLIENT_CONFIG='${CLIENT_CONFIG}'
CLIENT_VERSION='${CLIENT_VERSION}'

#Snapshot Configuration
SNAPSHOT_ENABLED='${SNAPSHOT_ENABLED}'
SNAPSHOT_DOWNLOAD_URL='${SNAPSHOT_DOWNLOAD_URL}'
SNAPSHOT_STAGING_VOL_SIZE='${SNAPSHOT_STAGING_VOL_SIZE}'
SNAPSHOT_STAGING_VOL_ID='${SNAPSHOT_STAGING_VOL_ID}'

#Traffic Shaping Configuration
TRAFFIC_SHAPING_ENABLED='${TRAFFIC_SHAPING_ENABLED}'
TRAFFIC_SHAPING_RATE_MBIT='${TRAFFIC_SHAPING_RATE_MBIT}'
TRAFFIC_SHAPING_CHECK_INTERVAL_SEC='${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC}'
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND='${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND}'

#Storage Configuration
DATA_VOLUMES_COUNT='${DATA_VOLUMES_COUNT}'

# Flattened Data Volumes Configuration (injected by CDK as KEY='value' lines)
##FLATTENED_DATA_VOLUMES##

# Flattened Custom Variables (injected by CDK as KEY='value' lines)
##FLATTENED_CUSTOM_VARIABLES##

#High Availability Configuration
HA_NUMBER_OF_NODES='${HA_NUMBER_OF_NODES}'
HA_ALB_HEALTHCHECK_PORT='${HA_ALB_HEALTHCHECK_PORT}'
HA_ALB_HEALTHCHECK_PATH='${HA_ALB_HEALTHCHECK_PATH}'
HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN='${HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN}'
HA_ALB_HEALTHCHECK_INTERVAL_SEC='${HA_ALB_HEALTHCHECK_INTERVAL_SEC}'
HA_ALB_HEALTHCHECK_TIMEOUT_SEC='${HA_ALB_HEALTHCHECK_TIMEOUT_SEC}'
HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD='${HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD}'
HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD='${HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD}'
HA_NODES_HEARTBEAT_DELAY_MIN='${HA_NODES_HEARTBEAT_DELAY_MIN}'
HA_ALB_DEREGISTRATION_DELAY_SEC='${HA_ALB_DEREGISTRATION_DELAY_SEC}'

#CFN and CDK Configuration
STACK_NAME='${STACK_NAME}'
LOGICAL_RESOURCE_ID='${LOGICAL_RESOURCE_ID}'
ASG_NAME='${ASG_NAME}'
LIFECYCLE_HOOK_NAME='${LIFECYCLE_HOOK_NAME}'
COMMON_ASSETS_S3_PATH='${COMMON_ASSETS_S3_PATH}'
PROTOCOL_ASSETS_S3_PATH='${PROTOCOL_ASSETS_S3_PATH}'
CDK_ENVIRONMENT_EOF
    )
    # HA snapshot staging appends the self-created staging volume ID; keep it
    # so a later cleanup can still find an orphaned volume.
    grep -E "^SNAPSHOT_STAGING_VOL_ID=vol-" "$CDK_ENV_FILE" 2>/dev/null >> "$tmp"
    mv -f "$tmp" "$CDK_ENV_FILE"
}

imds_token() {
    curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"
}

# Fetch the instance's current user data from IMDS into $1 (retries briefly).
fetch_imds_user_data() {
    local out=$1 token attempt
    for attempt in 1 2 3 4 5; do
        token=$(imds_token)
        if curl -sf -H "X-aws-ec2-metadata-token: $token" \
            http://169.254.169.254/latest/user-data -o "$out"; then
            return 0
        fi
        echo "$SCRIPT_NAME IMDS user data fetch failed (attempt $attempt/5)"
        sleep 3
    done
    return 1
}

# Print the per-boot script part of a MIME user data file (empty if absent).
extract_bootstrap_part() {
    awk -v marker="$PER_BOOT_MARKER" '
        state == 2 && /^--/ && index($0, boundary) == 3 { exit }
        state == 2 { print; next }
        state == 1 && $0 == "" { state = 2; next }
        /^Content-Type: multipart\/mixed; boundary=/ { boundary = $0; sub(/.*boundary="?/, "", boundary); sub(/".*/, "", boundary) }
        index($0, "Content-Type: " marker) == 1 { state = 1 }
    ' "$1"
}

# Fingerprint of a bootstrap script: everything except the INSTANCE_TYPE line,
# so a same-architecture resize does not re-run setup. (The script embeds the
# full environment and both asset S3 keys, which contain content hashes.)
fingerprint() {
    sed -e '$a\' "$1" | grep -v "^INSTANCE_TYPE='" | sha256sum | awk '{print $1}'
}

# Decide what this boot must do. Prints one of:
#   uninstall - IMDS user data no longer contains a per-boot bootstrap (the
#               stack was rolled back to an older framework version)
#   reexec    - cloud-init ran a stale copy; run the IMDS version instead
#   apply     - (re-)run setup
#   skip      - nothing changed since the last successful setup
# Args: <self script path> <IMDS user data file or empty if unavailable>
bootstrap_action() {
    local self=$1 imds=$2 fp i
    # A re-exec'd copy already is the current version; don't compare again.
    if [[ -n "$imds" && "$NODE_RUNNER_REEXEC" != "1" ]]; then
        if ! grep -q "^Content-Type: $PER_BOOT_MARKER" "$imds"; then
            echo uninstall; return
        fi
        extract_bootstrap_part "$imds" > "$STATE_DIR/current-bootstrap.sh"
        if ! cmp -s <(sed -e '$a\' "$STATE_DIR/current-bootstrap.sh") <(sed -e '$a\' "$self"); then
            echo reexec; return
        fi
    fi
    fp=$(fingerprint "$self")
    if [[ "$(cat "$STATE_DIR/applied-fingerprint" 2>/dev/null)" != "$fp" ]]; then
        echo apply; return
    fi
    for ((i = 1; i <= DATA_VOLUMES_COUNT; i++)); do
        local -n mount_path_ref="DATA_VOL_$i""_MOUNT_PATH"
        if [[ -n "$mount_path_ref" ]] && ! mountpoint -q "$mount_path_ref"; then
            echo "$SCRIPT_NAME Data volume $mount_path_ref is not mounted" >&2
            unset -n mount_path_ref
            echo apply; return
        fi
        unset -n mount_path_ref
    done
    echo skip
}

install_base_packages() {
    echo "$SCRIPT_NAME Installing basic packages"
    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
        sleep 5
    done
    apt-get -yqq update
    apt-get -yqq install jq unzip python3-pip python3-setuptools chrony wget

    if ! command -v cfn-signal >/dev/null 2>&1; then
        echo "$SCRIPT_NAME Install CloudFormation helper scripts (cfn-signal, cfn-init, etc.)"
        pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz --break-system-packages
        ln -sf /usr/local/bin/cfn-signal /usr/bin/cfn-signal 2>/dev/null || true
        ln -sf /usr/local/bin/cfn-init /usr/bin/cfn-init 2>/dev/null || true
    fi

    echo "$SCRIPT_NAME Installing AWS CLI"
    snap install aws-cli --classic
}

# Download and extract assets, replacing any previous copy so changed or
# removed blueprint files take effect.
refresh_assets() {
    echo "$SCRIPT_NAME Downloading and extracting assets if provided"
    if [[ "$COMMON_ASSETS_S3_PATH" != "none" ]]; then
        aws s3 cp "$COMMON_ASSETS_S3_PATH" /opt/assets.zip --region "$AWS_REGION" || return 1
        rm -rf "$BOOTSTRAP_ASSETS_PATH"
        unzip -q -o /opt/assets.zip -d "$BOOTSTRAP_ASSETS_PATH" || return 1
    fi
    if [[ "$PROTOCOL_ASSETS_S3_PATH" != "none" ]]; then
        aws s3 cp "$PROTOCOL_ASSETS_S3_PATH" /opt/blueprints.zip --region "$AWS_REGION" || return 1
        rm -rf "$PROTOCOL_ASSETS_PATH"
        unzip -q -o /opt/blueprints.zip -d "$PROTOCOL_ASSETS_PATH" || return 1
    fi
}

# $1 (tests only): path of this script; defaults to $0.
main() {
    local self=$0 imds_file="" action prev_fp="" rc
    [[ -n "$1" ]] && self=$1
    mkdir -p "$STATE_DIR"
    chmod 700 "$STATE_DIR"

    # Only one bootstrap at a time (a re-exec inherits the lock).
    if [[ "$NODE_RUNNER_REEXEC" != "1" ]]; then
        exec 9> "$STATE_DIR/bootstrap.lock"
        if ! flock -n 9; then
            echo "$SCRIPT_NAME Another bootstrap is running, exiting"
            return 0
        fi
    fi

    write_cdk_environment
    # shellcheck source=/dev/null
    source "$CDK_ENV_FILE"

    if fetch_imds_user_data "$STATE_DIR/imds-user-data"; then
        imds_file="$STATE_DIR/imds-user-data"
    else
        echo "WARNING: $SCRIPT_NAME could not read user data from IMDS, using the local copy"
    fi

    action=$(bootstrap_action "$self" "$imds_file")
    echo "$SCRIPT_NAME Boot action: $action"
    case "$action" in
        uninstall)
            # Rolled back to a framework version without per-boot bootstrap:
            # stop running every boot (pre-#340 behaviour).
            if [[ "$self" == "$PER_BOOT_DIR/"* ]]; then
                rm -f "$self"
            fi
            return 0
            ;;
        reexec)
            echo "$SCRIPT_NAME cloud-init ran a stale bootstrap; running the current one from IMDS"
            install -m 700 "$STATE_DIR/current-bootstrap.sh" "$STATE_DIR/run-bootstrap.sh"
            # Also fix the stale copy for the next boot (new inode via mv).
            if [[ "$self" == "$PER_BOOT_DIR/"* ]]; then
                install -m 700 "$STATE_DIR/current-bootstrap.sh" "$self.new" && mv -f "$self.new" "$self"
            fi
            NODE_RUNNER_REEXEC=1 exec "$STATE_DIR/run-bootstrap.sh"
            ;;
        skip)
            echo "$SCRIPT_NAME Configuration unchanged and setup completed; nothing to do"
            return 0
            ;;
    esac

    [[ -f "$STATE_DIR/applied-fingerprint" ]] && prev_fp="true"
    echo "$SCRIPT_NAME Applying node setup (re-apply: $prev_fp)"
    install_base_packages
    if refresh_assets && [[ -f "$COMMON_ASSETS_PATH/node-setup.sh" ]]; then
        chmod +x "$COMMON_ASSETS_PATH/node-setup.sh"
        STATE_DIR="$STATE_DIR" CDK_ENV_FILE="$CDK_ENV_FILE" "$COMMON_ASSETS_PATH/node-setup.sh" "$prev_fp"
        rc=$?
    else
        echo "$SCRIPT_NAME ERROR: failed to download or extract assets"
        rc=1
    fi
    if [[ $rc -eq 0 ]]; then
        fingerprint "$self" > "$STATE_DIR/applied-fingerprint.tmp" \
            && mv -f "$STATE_DIR/applied-fingerprint.tmp" "$STATE_DIR/applied-fingerprint"
        echo "$SCRIPT_NAME Node deployment completed successfully"
        return 0
    fi
    echo "$SCRIPT_NAME ERROR: Node deployment FAILED (exit code $rc) - check /var/log/cloud-init-output.log and journalctl; setup will be retried on next boot"
    # Best effort: bring back whatever node.service is installed.
    systemctl start node.service 2>/dev/null
    return 1
}

# NODE_RUNNER_SOURCE_ONLY=1 lets unit tests load the functions without running.
if [[ "$NODE_RUNNER_SOURCE_ONLY" != "1" ]]; then
    main "$@"
    exit $?
fi
