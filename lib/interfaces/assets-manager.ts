// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for managing asset uploads to S3 for blockchain node deployments.
 * 
 * The AssetsManager is responsible for packaging and uploading both common assets
 * (universal scripts and configurations) and protocol-specific assets to S3.
 * These assets are then downloaded by EC2 instances during initialization.
 */
export interface IAssetsManager {
    /**
     * Upload common assets (universal scripts and configurations) to S3.
     * 
     * Common assets include:
     * - user-data-ubuntu.sh: Universal user data script template
     * - setup-storage.sh: Universal storage setup script
     * - parse-custom-variables.sh: Script for parsing protocol-specific variables
     * - cfn-hup-setup.sh: CloudFormation helper setup script
     * - cw-agent.json: CloudWatch agent configuration
     * 
     * @returns S3 path to the uploaded common assets
     * @throws Error if upload fails or assets directory doesn't exist
     */
    uploadAssets(): string;

    /**
     * Upload protocol-specific assets to S3.
     * 
     * Protocol assets include:
     * - user-data/node.sh: Protocol-specific node initialization script
     * - user-data/common/: Protocol-specific helper scripts
     * - configurations/: Node configuration templates
     * - monitoring/: Dashboard templates
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns S3 path to the uploaded protocol assets
     * @throws Error if upload fails or protocol assets directory doesn't exist
     */
    uploadProtocolAssets(protocolName: string): string;

    /**
     * Validate that common assets directory exists and contains required files.
     * 
     * Required files:
     * - user-data-ubuntu.sh
     * - setup-storage.sh
     * - parse-custom-variables.sh
     * - cfn-hup-setup.sh
     * - cw-agent.json
     * 
     * @returns true if common assets are valid, false otherwise
     */
    validateAssets(): boolean;

    /**
     * Validate that protocol-specific assets directory exists and contains required files.
     * 
     * Required structure:
     * - blueprints/{protocolName}/user-data/node.sh
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns true if protocol assets are valid, false otherwise
     */
    validateProtocolAssets(protocolName: string): boolean;

    /**
     * Get the expected path for common assets directory.
     * 
     * @returns The expected directory path for common assets
     */
    getAssetsPath(): string;

    /**
     * Get the expected path for protocol-specific assets directory.
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns The expected directory path for protocol assets
     */
    getProtocolAssetssPath(protocolName: string): string;

    /**
     * Load user-data script from specified directory
     * 
     * @param userDataScriptPath - Path to user data scripts
     * @returns The user data script as text file
     */
    loadUserDataScript(userDataScriptPath: string): string;
}
