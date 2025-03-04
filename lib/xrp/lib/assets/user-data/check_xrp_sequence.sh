#!/bin/bash
###############################################################################
# check_xrp_sequence.sh
#
# This script retrieves the current validated ledger sequence number from a local
# XRP node and sends it to AWS CloudWatch as a metric. Includes retry logic,
# proper error handling, and ensures only one instance runs at a time.
#
# Requirements:
#   - AWS CLI
#   - jq
#   - curl
#   - Local rippled node running on port 5005
#
# The script is idempotent and includes the following features:
#   - Lockfile to prevent multiple concurrent executions
#   - Retry mechanism for all external calls
#   - Proper signal handling and cleanup
#   - Consistent logging
#   - Comprehensive error handling
###############################################################################

set -euo pipefail

# Configuration
MAX_RETRIES=3
RETRY_DELAY=5
NAMESPACE="CWAgent"
CURRENT_METRIC_NAME="XRP_Current_Sequence"
DELTA_METRIC_NAME="XRP_Delta_Sequence"
LOCKFILE="/tmp/check_xrp_sequence.lock"
LOCK_FD=200

# Logging functions
log() {
    local level=$1
    local message=$2
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${level}] ${message}"
}

log_info() {
    log "INFO" "$1"
}

log_error() {
    log "ERROR" "$1"
}

log_warning() {
    log "WARN" "$1"
}

# Error handling
handle_error() {
    local exit_code=$1
    local error_msg=$2
    log_error "${error_msg}"
    exit "${exit_code}"
}

# Function to clean up lock file
cleanup() {
    local exit_code=$?
    log_info "Cleaning up..."
    # Release lock file
    flock -u ${LOCK_FD}
    rm -f "${LOCKFILE}"
    exit ${exit_code}
}

# Handle signals
trap cleanup EXIT
trap 'exit 1' INT TERM
# Get instance metadata with retries
get_metadata() {
    local endpoint=$1
    local retry_count=0
    local result

    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if result=$(curl -s -f -H "X-aws-ec2-metadata-token: $(curl -s -f -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')" "http://169.254.169.254/latest/meta-data/${endpoint}"); then
            echo "${result}"
            return 0
        fi
        log_warning "Failed to get metadata from ${endpoint}, attempt $((retry_count + 1))/${MAX_RETRIES}"
        retry_count=$((retry_count + 1))
        sleep ${RETRY_DELAY}
    done

    log_error "Failed to retrieve metadata from ${endpoint} after ${MAX_RETRIES} attempts"
    return 1
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    local missing_deps=()

    for cmd in aws jq curl; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            missing_deps+=("${cmd}")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        return 1
    fi

    log_info "All dependencies satisfied"
    return 0
}

# Function to get current sequence from rippled with retries
get_current_sequence() {
    local retry_count=0
    local seq

    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if seq=$(curl -s -f -H 'Content-Type: application/json' \
            -d '{"method":"ledger_current","params":[{}]}' \
            http://localhost:5005/ | \
            jq -e '.result.ledger_current_index // 0'); then
            if [[ "${seq}" != "0" ]]; then
                echo "${seq}"
                return 0
            fi
        fi
        log_warning "Failed to get sequence, attempt $((retry_count + 1))/${MAX_RETRIES}"
        retry_count=$((retry_count + 1))
        sleep ${RETRY_DELAY}
    done

    log_error "Failed to get current sequence after ${MAX_RETRIES} attempts"
    return 1
}

get_validated_sequence() {
    local retry_count=0
    local seq

    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if seq=$(curl -s -f -H 'Content-Type: application/json' \
            -d '{"method":"server_info","params":[{}]}' \
            http://localhost:5005/ | \
            jq -e '.result.info.validated_ledger.seq // 0'); then
            if [[ "${seq}" != "0" ]]; then
                echo "${seq}"
                return 0
            fi
        fi
        log_warning "Failed to get sequence, attempt $((retry_count + 1))/${MAX_RETRIES}"
        retry_count=$((retry_count + 1))
        sleep ${RETRY_DELAY}
    done

    log_error "Failed to get current sequence after ${MAX_RETRIES} attempts"
    return 1
}

# Function to send metric to CloudWatch with retries
send_to_cloudwatch() {
    local sequence=$1
    local metric_name=$2
    local retry_count=0

    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        if aws cloudwatch put-metric-data \
            --namespace "${NAMESPACE}" \
            --metric-name "${metric_name}" \
            --value "${sequence}" \
            --region "${REGION}" \
            --dimensions "InstanceId=${INSTANCE_ID}" \
            --timestamp "${TIMESTAMP}"; then
            log_info "Successfully sent sequence ${sequence} to CloudWatch"
            return 0
        fi
        log_warning "Failed to send metrics to CloudWatch, attempt $((retry_count + 1))/${MAX_RETRIES}"
        retry_count=$((retry_count + 1))
        sleep ${RETRY_DELAY}
    done

    log_error "Failed to send metrics to CloudWatch after ${MAX_RETRIES} attempts"
    return 1
}

# Initialize environment variables
init_environment() {
    log_info "Initializing environment variables"
    REGION=$(get_metadata "placement/region") || return 1
    INSTANCE_ID=$(get_metadata "instance-id") || return 1
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    return 0
}

# Main function
main() {
    local sequence

    log_info "Starting XRP sequence check"

    # Ensure only one instance is running
    exec {LOCK_FD}>"${LOCKFILE}"
    if ! flock -n "${LOCK_FD}"; then
        log_error "Another instance is already running"
        return 1
    fi

    # Check dependencies first
    if ! check_dependencies; then
        return 1
    fi

    # Initialize environment variables
    if ! init_environment; then
        return 1
    fi

    # Get current sequence
    if ! current_sequence=$(get_current_sequence); then
        return 1
    fi

        # Get current sequence
    if ! validated_sequence=$(get_validated_sequence); then
        return 1
    fi

    log_info "Retrieved current sequence: ${current_sequence}"
    log_info "Retrieved validated sequence: ${validated_sequence}"

    # Send to CloudWatch
    if ! send_to_cloudwatch "${current_sequence}" "${CURRENT_METRIC_NAME}"; then
        return 1
    fi

    # Send to CloudWatch
    delta_sequence=$((current_sequence - validated_sequence))
    if ! send_to_cloudwatch "${delta_sequence}" "${DELTA_METRIC_NAME}"; then
        return 1
    fi

    log_info "XRP sequence check completed successfully"
    return 0
}

# Execute main function
if ! main; then
    handle_error 1 "Failed to complete XRP sequence check"
fi

exit 0
