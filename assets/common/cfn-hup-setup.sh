#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# cfn-hup/setup.sh - CloudFormation helper installation and configuration script
# This script installs and configures CloudFormation helper scripts for stack signaling

set -euo pipefail

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/cfn-hup-setup.log
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Function to detect OS and architecture
detect_system() {
    local os_type
    local arch_type
    
    # Detect OS
    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        case "$ID" in
            ubuntu|debian)
                os_type="ubuntu"
                ;;
            amzn)
                os_type="amazon-linux"
                ;;
            centos|rhel|fedora)
                os_type="centos"
                ;;
            *)
                os_type="unknown"
                ;;
        esac
    else
        os_type="unknown"
    fi
    
    # Detect architecture
    arch_type=$(uname -m)
    case "$arch_type" in
        x86_64)
            arch_type="x86_64"
            ;;
        aarch64|arm64)
            arch_type="aarch64"
            ;;
        *)
            error_exit "Unsupported architecture: $arch_type"
            ;;
    esac
    
    echo "$os_type:$arch_type"
}

# Function to install CloudFormation helper scripts on Ubuntu/Debian
install_cfn_ubuntu() {
    log "Installing CloudFormation helper scripts on Ubuntu/Debian..."
    
    # Update package list
    apt-get update -y
    
    # Install required packages
    apt-get install -y python3-pip python3-setuptools
    
    # Install CloudFormation helper scripts
    pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
    
    # Create symlinks for compatibility
    ln -sf /usr/local/bin/cfn-signal /usr/bin/cfn-signal 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-init /usr/bin/cfn-init 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-hup /usr/bin/cfn-hup 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-get-metadata /usr/bin/cfn-get-metadata 2>/dev/null || true
    
    log "CloudFormation helper scripts installed successfully on Ubuntu/Debian"
}

# Function to install CloudFormation helper scripts on Amazon Linux
install_cfn_amazon_linux() {
    log "Installing CloudFormation helper scripts on Amazon Linux..."
    
    # CloudFormation helper scripts are pre-installed on Amazon Linux 2
    # Just ensure they're available
    if command -v cfn-signal &> /dev/null; then
        log "CloudFormation helper scripts already available on Amazon Linux"
        return 0
    fi
    
    # Install if not available
    yum update -y
    yum install -y aws-cfn-bootstrap
    
    log "CloudFormation helper scripts installed successfully on Amazon Linux"
}

# Function to install CloudFormation helper scripts on CentOS/RHEL
install_cfn_centos() {
    log "Installing CloudFormation helper scripts on CentOS/RHEL..."
    
    # Update package list
    yum update -y
    
    # Install required packages
    yum install -y python3-pip python3-setuptools
    
    # Install CloudFormation helper scripts
    pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
    
    # Create symlinks for compatibility
    ln -sf /usr/local/bin/cfn-signal /usr/bin/cfn-signal 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-init /usr/bin/cfn-init 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-hup /usr/bin/cfn-hup 2>/dev/null || true
    ln -sf /usr/local/bin/cfn-get-metadata /usr/bin/cfn-get-metadata 2>/dev/null || true
    
    log "CloudFormation helper scripts installed successfully on CentOS/RHEL"
}

# Function to configure cfn-hup service
configure_cfn_hup() {
    local stack_name="$1"
    local region="$2"
    
    log "Configuring cfn-hup service for stack: $stack_name in region: $region"
    
    # Create cfn-hup configuration directory
    mkdir -p /etc/cfn/hooks.d
    
    # Create cfn-hup configuration file
    cat > /etc/cfn/cfn-hup.conf << EOF
[main]
stack=$stack_name
region=$region
interval=1
verbose=true
EOF
    
    # Create cfn-auto-reloader hook
    cat > /etc/cfn/hooks.d/cfn-auto-reloader.conf << EOF
[cfn-auto-reloader-hook]
triggers=post.update
path=Resources.LaunchTemplate.Metadata.AWS::CloudFormation::Init
action=/opt/aws/bin/cfn-init -v --stack $stack_name --resource LaunchTemplate --region $region
runas=root
EOF
    
    # Create systemd service file for cfn-hup
    cat > /etc/systemd/system/cfn-hup.service << EOF
[Unit]
Description=CloudFormation Helper Daemon
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cfn-hup --config /etc/cfn --verbose
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable cfn-hup service
    systemctl daemon-reload
    systemctl enable cfn-hup.service
    
    log "cfn-hup service configured successfully"
}

# Function to start cfn-hup service
start_cfn_hup() {
    log "Starting cfn-hup service..."
    
    systemctl start cfn-hup.service
    
    # Check service status
    if systemctl is-active --quiet cfn-hup.service; then
        log "cfn-hup service started successfully"
    else
        log "WARNING: cfn-hup service failed to start"
        systemctl status cfn-hup.service || true
    fi
}

# Function to verify installation
verify_installation() {
    log "Verifying CloudFormation helper scripts installation..."
    
    local tools=("cfn-signal" "cfn-init" "cfn-hup" "cfn-get-metadata")
    local all_found=true
    
    for tool in "${tools[@]}"; do
        if command -v "$tool" &> /dev/null; then
            local version
            version=$("$tool" --version 2>&1 | head -n1 || echo "unknown")
            log "✓ $tool found: $version"
        else
            log "✗ $tool not found"
            all_found=false
        fi
    done
    
    if [[ "$all_found" == "true" ]]; then
        log "All CloudFormation helper scripts are available"
        return 0
    else
        error_exit "Some CloudFormation helper scripts are missing"
    fi
}

# Main execution
main() {
    local stack_name="${1:-}"
    local region="${2:-}"
    
    log "Starting CloudFormation helper scripts setup..."
    
    # Detect system type
    local system_info
    system_info=$(detect_system)
    local os_type="${system_info%:*}"
    local arch_type="${system_info#*:}"
    
    log "Detected system: $os_type ($arch_type)"
    
    # Install CloudFormation helper scripts based on OS
    case "$os_type" in
        ubuntu)
            install_cfn_ubuntu
            ;;
        amazon-linux)
            install_cfn_amazon_linux
            ;;
        centos)
            install_cfn_centos
            ;;
        *)
            error_exit "Unsupported operating system: $os_type"
            ;;
    esac
    
    # Verify installation
    verify_installation
    
    # Configure cfn-hup if stack information provided
    if [[ -n "$stack_name" && -n "$region" ]]; then
        configure_cfn_hup "$stack_name" "$region"
        start_cfn_hup
    else
        log "Stack name and region not provided, skipping cfn-hup configuration"
    fi
    
    log "CloudFormation helper scripts setup completed successfully"
}

# Run main function
main "$@"
