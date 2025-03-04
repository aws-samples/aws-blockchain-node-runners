#!/bin/bash

# Enable error handling and debugging
set -eo pipefail

exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1
###################
# Constants
###################
readonly RIPPLED_CONFIG_DIR="/opt/ripple/etc"
readonly YUM_REPO_DIR="/etc/yum.repos.d"
readonly ENV_FILE="/etc/environment"
readonly RIPPLED_USER="rippled"
readonly RIPPLED_GROUP="rippled"
readonly RIPPLED_UID=1111
readonly RIPPLED_GID=1111
readonly MOUNT_POINT="/var/lib/rippled"
readonly MAX_RETRIES=3
readonly RETRY_DELAY=5
readonly DATA_VOLUME_NAME="/dev/sdf"
readonly ASSETS_DIR="/root/assets"
readonly ASSETS_ZIP="/root/assets.zip"

###################
# Logging Functions
###################
log() {
    local level="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] ${message}" | tee -a /var/log/rippled-setup.log
}

log_info() {
    log "INFO" "$1"
}

log_error() {
    log "ERROR" "$1" >&2
}

log_warning() {
    log "WARNING" "$1"
}

###################
# Error Handling
###################
handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Failed at line ${line_number} with exit code ${exit_code}"

    exit "${exit_code}"
}

trap 'handle_error ${LINENO}' ERR

###################
# Environment Setup
###################
setup_environment() {
    log_info "Setting up environment variables"

    # Backup existing environment file
    if [[ -f "${ENV_FILE}" ]]; then
        cp "${ENV_FILE}" "${ENV_FILE}.$(date +%Y%m%d_%H%M%S).backup"
    fi

    declare -A env_vars=(
        ["AWS_REGION"]="_AWS_REGION_"
        ["ASSETS_S3_PATH"]="_ASSETS_S3_PATH_"
        ["STACK_NAME"]="_STACK_NAME_"
        ["STACK_ID"]="_STACK_ID_"
        ["RESOURCE_ID"]="_NODE_CF_LOGICAL_ID_"
        # ["HUB_NETWORK_IP"]="_HUB_NETWORK_IP_"
        ["XRP_NETWORK"]="_HUB_NETWORK_ID_"
        # ["VALIDATOR_LIST_SITES"]="_VALIDATOR_LIST_SITES_"
        # ["VALIDATOR_LIST_KEYS"]="_VALIDATOR_LIST_KEYS_"
        # ["ONLINE_DELETE"]="_ONLINE_DELETE_"
        # ["ADVISORY_DELETE"]="_ADVISORY_DELETE_"
        ["DATA_VOLUME_TYPE"]="_DATA_VOLUME_TYPE_"
        ["DATA_VOLUME_SIZE"]="_DATA_VOLUME_SIZE_"
        ["LIFECYCLE_HOOK_NAME"]="_LIFECYCLE_HOOK_NAME_"
        ["ASG_NAME"]="_ASG_NAME_"
    )

    # Clear and recreate environment file
    : >"${ENV_FILE}"

    for key in "${!env_vars[@]}"; do
        local value="${env_vars[${key}]}"
        if [[ "${value}" =~ [[:space:]] || "${value}" =~ [^a-zA-Z0-9_./-] ]]; then
            echo "export ${key}=\"${value}\"" >>"${ENV_FILE}"
        else
            echo "export ${key}=${value}" >>"${ENV_FILE}"
        fi
    done

    # Source the environment file
    # shellcheck source=/dev/null
    source "${ENV_FILE}"
}
install_rippled() {
    log_info "Installing/updating rippled on Amazon Linux 2..."
    setup_environment

    # Setup repository if not exists
    if [[ ! -f "$YUM_REPO_DIR/ripple.repo" ]]; then
        log_info "Setting up ripple repository..."
        sudo cp ${ASSETS_DIR}/rippled/ripple.repo "$YUM_REPO_DIR/ripple.repo"
    fi

    sudo yum -y update

    # Install/update rippled if needed
    if ! rpm -q rippled &>/dev/null; then
        log_info "Installing rippled package..."
        sudo yum install -y rippled
    else
        log_info "rippled package already installed, checking for updates..."
        sudo yum update -y rippled
    fi

    log_info "build out and write rippled.cfg and validaotrs.txt"
    python3 ${ASSETS_DIR}/rippled/configBuilder.py ${ASSETS_DIR}

}

# Function to start and verify rippled service
start_rippled() {
    echo "Starting rippled service..."
    sudo systemctl enable --now rippled
    sudo systemctl start rippled

    # Verify service status
    if ! sudo systemctl status rippled; then
        echo "Failed to start rippled service"
        return 1
    fi
    echo "rippled service started successfully"
}

###################
# System Setup
###################
install_dependencies() {
    log_info "Installing system dependencies"

    local packages=(
        "cmake"
        "git"
        "gcc-c++"
        "snappy-devel"
        "libicu-devel"
        "zlib-devel"
        "jq"
        "unzip"
        "amazon-cloudwatch-agent"
        "openssl-devel"
        "libffi-devel"
        "bzip2-devel"
        "wget"
    )

    # Check for packages that need to be installed
    local packages_to_install=()
    for package in "${packages[@]}"; do
        if ! rpm -q "$package" &>/dev/null; then
            log_info "Package $package needs to be installed"
            packages_to_install+=("$package")
        else
            log_info "Package $package is already installed"
        fi
    done

    # If no packages need installation, we're done
    if [ ${#packages_to_install[@]} -eq 0 ]; then
        log_info "All required packages are already installed"
        return 0
    fi

    local retry_count=0
    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if sudo yum update -y &&
            sudo yum groupinstall -y "Development Tools" &&
            sudo yum install -y "${packages[@]}"; then
            return 0
        fi

        retry_count=$((retry_count + 1))
        log_warning "Retry ${retry_count}/${MAX_RETRIES} for package installation"
        sleep "${RETRY_DELAY}"
    done
    log_error "Failed to install dependencies after ${MAX_RETRIES} attempts"
    return 1
}

###################
# User Management
###################
setup_user_and_group() {
    log_info "Setting up rippled user and group"

    # Create group if it doesn't exist
    if ! getent group "${RIPPLED_GROUP}" >/dev/null; then
        sudo groupadd -g "${RIPPLED_GID}" "${RIPPLED_GROUP}"
    fi

    # Create user if it doesn't exist
    if ! getent passwd "${RIPPLED_USER}" >/dev/null; then
        sudo useradd -u "${RIPPLED_UID}" -g "${RIPPLED_GID}" -m -s /bin/bash "${RIPPLED_USER}"
    fi

    # Ensure home directory permissions are correct
    sudo chown -R "${RIPPLED_USER}:${RIPPLED_GROUP}" "/home/${RIPPLED_USER}"
}

###################
# Asset Management
###################
setup_assets() {
    log_info "Downloading and extracting assets"

    # Clean up any existing assets
    rm -rf "${ASSETS_DIR}" "${ASSETS_ZIP}"

    # Download and extract assets with retry logic
    local retry_count=0
    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if aws s3 cp "${ASSETS_S3_PATH}" "${ASSETS_ZIP}" --region "${AWS_REGION}" &&
            unzip -q "${ASSETS_ZIP}" -d "${ASSETS_DIR}"; then
            return 0
        fi

        retry_count=$((retry_count + 1))
        log_warning "Retry ${retry_count}/${MAX_RETRIES} for asset download"
        sleep "${RETRY_DELAY}"
    done

    log_error "Failed to setup assets after ${MAX_RETRIES} attempts"
    return 1
}

###################
# Volume Management
###################
get_data_volume_id() {
    local volume_size="${1}"
    lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== ${volume_size}) {print $1}}'
}

setup_data_volume() {
    log_info "Setting up data volume"

    local volume_id
    volume_id="$DATA_VOLUME_NAME"

    log_info "Data volume ID: ${volume_id}"

    # Verify volume exists
    if [[ -z "${volume_id}" ]]; then
        log_error "Data volume not found"
        return 1
    fi

    # Check if device exists
    local device="${volume_id}"
    if [[ ! -b "${device}" ]]; then
        log_error "Device ${device} not found"
        return 1
    fi

    # Check if already mounted
    if is_volume_mounted "${MOUNT_POINT}"; then
        log_info "Data volume already mounted at ${MOUNT_POINT}"
        # Verify correct permissions even if already mounted
        sudo chown "${RIPPLED_USER}:${RIPPLED_GROUP}" "${MOUNT_POINT}"
        return 0
    fi

    # Ensure mount point exists
    if [[ ! -d "${MOUNT_POINT}" ]]; then
        log_info "Creating mount point directory ${MOUNT_POINT}"
        sudo mkdir -p "${MOUNT_POINT}"
    fi

    # Format and mount
    if ! format_and_mount_volume "${volume_id}"; then
        log_error "Failed to format and mount volume ${volume_id}"
        return 1
    fi

    log_info "Data volume setup completed successfully"
    return 0
}

is_volume_mounted() {
    local mount_point="${1}"
    mountpoint -q "${mount_point}"
}

format_and_mount_volume() {
    local volume_id="${1}"
    local device="${volume_id}"
    local fstype="xfs"

    # Check if filesystem already exists
    if ! blkid "${device}" | grep -q "${fstype}"; then
        log_info "Formatting volume ${device} with ${fstype}"
        if ! sudo mkfs.${fstype} "${device}"; then
            log_error "Failed to format volume ${device}"
            return 1
        fi
        # Wait for filesystem to be ready
        sleep 5
    else
        log_info "Volume ${device} already formatted with ${fstype}"
    fi

    # Get UUID
    local volume_uuid
    volume_uuid=$(lsblk -fn -o UUID "${volume_id}")

    if [[ -z "${volume_uuid}" ]]; then
        log_error "Failed to get UUID for volume ${volume_id}"
        return 1
    fi

    local fstab_entry="UUID=${volume_uuid} ${MOUNT_POINT} xfs defaults 0 2"

    # Update fstab
    update_fstab "${fstab_entry}"

    # Create mount point and mount
    sudo mkdir -p "${MOUNT_POINT}/db"
    sudo chown -R "${RIPPLED_USER}:${RIPPLED_GROUP}" "${MOUNT_POINT}"
    sudo mount -a

    # Set permissions
    sudo chown -R "${RIPPLED_USER}:${RIPPLED_GROUP}" "${MOUNT_POINT}"
}

update_fstab() {
    local fstab_entry="${1}"

    # Backup fstab
    sudo cp /etc/fstab "/etc/fstab.$(date +%Y%m%d_%H%M%S).backup"

    if grep -q "${MOUNT_POINT}" /etc/fstab; then
        local line_num
        line_num=$(grep -n "${MOUNT_POINT}" /etc/fstab | cut -d: -f1)
        sudo sed -i "${line_num}s#.*#${fstab_entry}#" /etc/fstab
    else
        echo "${fstab_entry}" | sudo tee -a /etc/fstab
    fi
}

check_volume() {
    local volume="$1"
    local max_attempts=10
    local attempt=1
    local sleep_time=5

    while ! blockdev --getro "$volume" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            log_error "Volume $volume not ready after $max_attempts attempts"
            return 1
        fi
        log_info "Waiting for volume $volume (attempt $attempt/$max_attempts)"
        sleep $((sleep_time * attempt)) # Exponential backoff
        ((attempt++))
    done
    return 0
}

setup_cloud_watch() {
    sudo cp ${ASSETS_DIR}/cw-agent.json "/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json"
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
    systemctl restart amazon-cloudwatch-agent

    systemctl daemon-reload
}

setup_seq_check() {

    echo "Configuring xrp ledger synch script"

    sudo cp ${ASSETS_DIR}/user-data/check_xrp_sequence.sh "/opt/check_xrp_sequence.sh"
    sudo chmod +x /opt/check_xrp_sequence.sh
    sudo chown rippled:rippled /opt/check_xrp_sequence.sh

    sudo cp "$ASSETS_DIR/user-data/synch-check.service" /etc/systemd/system/synch-check.service
    sudo cp "$ASSETS_DIR/user-data/synch-check.timer" /etc/systemd/system/synch-check.timer

    sudo systemctl start synch-check.timer
    sudo systemctl enable synch-check.timer

}

###################
# Main Function
###################
main() {
    log_info "Starting rippled node installation"
    setup_environment
    if [[ "$RESOURCE_ID" != "none" ]]; then
        cfn-signal --stack "${STACK_NAME}" --resource "${RESOURCE_ID}" --region "${AWS_REGION}"
    fi

    #Check volume availability
    if ! check_volume "${DATA_VOLUME_NAME}"; then
        log_error "Volume check failed"
        return 1
    fi

    local steps=(
        install_dependencies
        setup_user_and_group
        setup_assets
        setup_data_volume
        setup_cloud_watch
        install_rippled
        start_rippled
        setup_seq_check
    )

    for step in "${steps[@]}"; do
        log_info "Executing step: ${step}"
        if ! ${step}; then
            log_error "Step ${step} failed"
            return 1
        fi
    done
    if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
        setup_environment
        echo "Signaling ASG lifecycle hook to complete"
        TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
        INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
        aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id "${INSTANCE_ID}" --lifecycle-hook-name "${LIFECYCLE_HOOK_NAME}" --auto-scaling-group-name "${ASG_NAME}" --region "${AWS_REGION}"
    fi

    log_info "rippled installation completed successfully"
}

# Execute main function
main
