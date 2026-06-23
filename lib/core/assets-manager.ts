// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { IAssetsManager } from '../interfaces/assets-manager';
import { ConfigurationLoader } from './configuration-loader';

/**
 * Required files that must exist in the common assets directory.
 */
const REQUIRED_COMMON_ASSETS = [
    'setup-storage.sh',
    'cfn-hup-setup.sh',
    'cw-agent.json'
];

/**
 * AssetsManager handles packaging and uploading of assets to S3 for blockchain node deployments.
 * 
 * This class is responsible for:
 * - Validating that required asset files exist
 * - Packaging common assets (universal scripts and configurations)
 * - Packaging protocol-specific assets
 * - Uploading assets to S3 using CDK's Asset construct
 * 
 * Assets are uploaded to S3 during CDK synthesis and are downloaded by EC2 instances
 * during initialization via the user data script.
 */
export class AssetsManager implements IAssetsManager {
    private readonly bootstrapAssetsPath: string;
    private readonly blueprintsPath: string;
    private readonly nodeModulesPath: string;
    private readonly scope: Construct;
    private bootstrapAssets: Asset;
    private protocolAssets: Asset;
    private readonly configLoader: ConfigurationLoader;

    /**
     * Creates a new AssetsManager instance.
     * 
     * @param scope - CDK construct scope for creating Asset resources
     * @param assetsPath - Optional path to the assets directory. 
     *          Defaults to 'assets/' relative to the project root.
     * @param blueprintsPath - Optional path to the blueprints directory (kept for backward compat).
     *                       Defaults to 'blueprints' relative to the project root.
     */
    constructor(scope: Construct, assetsPath?: string, blueprintsPath?: string) {
        this.scope = scope;
        this.bootstrapAssetsPath = assetsPath || path.join(process.cwd(), 'assets');
        this.blueprintsPath = blueprintsPath || path.join(process.cwd(), 'blueprints');
        this.nodeModulesPath = path.join(process.cwd(), 'node_modules');
        this.configLoader = new ConfigurationLoader();
    }

    /**
     * Upload common assets (universal scripts and configurations) to S3.
     * 
     * Uses CDK's Asset construct to package the common assets directory and upload
     * it to S3. The asset is cached, so subsequent calls return the same S3 path.
     * 
     * @returns S3 URI to the uploaded common assets (s3://bucket/key)
     * @throws Error if common assets directory doesn't exist or validation fails
     */
    uploadAssets(): string {
        if (!this.validateAssets()) {
            throw new Error(`Common assets validation failed. Ensure all required files exist in: ${this.bootstrapAssetsPath}`);
        }

        // Return cached asset if already uploaded
        if (this.bootstrapAssets) {
            return this.bootstrapAssets.s3ObjectUrl;
        }

        this.bootstrapAssets = new Asset(this.scope, 'assets', {
            path: this.bootstrapAssetsPath,
        });

        return this.bootstrapAssets.s3ObjectUrl;
    }

    /**
     * Upload protocol-specific assets to S3.
     * 
     * Uses CDK's Asset construct to package the protocol assets directory and upload
     * it to S3. Assets are cached per protocol, so subsequent calls for the same
     * protocol return the same S3 path.
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns S3 URI to the uploaded protocol assets (s3://bucket/key)
     * @throws Error if protocol assets directory doesn't exist or validation fails
     */
    uploadProtocolAssets(protocolName: string): string {
        if (!this.validateProtocolAssets(protocolName)) {
            throw new Error(`Protocol assets validation failed for '${protocolName}'. Ensure required files exist in: ${this.getProtocolAssetssPath(protocolName)}`);
        }

        const protocolAssetsPath = this.getProtocolAssetssPath(protocolName);
        const assets = new Asset(this.scope, `ProtocolAssets-${protocolName}`, {
            path: protocolAssetsPath,
        });

        this.protocolAssets = assets;
        return assets.s3ObjectUrl;
    }

    /**
     * Validate that common assets directory exists and contains required files.
     * 
     * @returns true if common assets are valid, false otherwise
     */
    validateAssets(): boolean {
        // Check if directory exists
        if (!fs.existsSync(this.bootstrapAssetsPath)) {
            return false;
        }

        // Check if directory is actually a directory
        const stats = fs.statSync(this.bootstrapAssetsPath);
        if (!stats.isDirectory()) {
            return false;
        }

        // Check for required files in "common" folder
        for (const requiredFile of REQUIRED_COMMON_ASSETS) {
            const filePath = path.join(this.bootstrapAssetsPath,'common',requiredFile);
            if (!fs.existsSync(filePath)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate that protocol-specific assets directory exists and contains required files.
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns true if protocol assets are valid, false otherwise
     */
    validateProtocolAssets(protocolName: string): boolean {
        const protocolPath = this.getProtocolAssetssPath(protocolName);

        // Check if protocol directory exists
        if (!fs.existsSync(protocolPath)) {
            return false;
        }

        // Check if directory is actually a directory
        const stats = fs.statSync(protocolPath);
        if (!stats.isDirectory()) {
            return false;
        }

        // Check for required user-data/node.sh file
        const nodeScriptPath = path.join(protocolPath, 'user-data', 'node.sh');
        if (!fs.existsSync(nodeScriptPath)) {
            return false;
        }

        return true;
    }

    /**
     * Get the expected path for common assets directory.
     * 
     * @returns The expected directory path for common assets
     */
    getAssetsPath(): string {
        return this.bootstrapAssetsPath;
    }

    /**
     * Get the expected path for protocol-specific assets directory.
     * Resolves the blueprint package root from node_modules/ via ConfigurationLoader.
     * 
     * @param protocolName - Name of the blockchain protocol
     * @returns The expected directory path for protocol assets
     */
    getProtocolAssetssPath(protocolName: string): string {
        try {
            return this.configLoader.getBlueprintFilePath(protocolName, '');
        } catch {
            // Fallback to blueprintsPath for backward compatibility (e.g. in tests with custom paths)
            return path.join(this.blueprintsPath, protocolName);
        }
    }

    /**
     * Get the CDK Asset for common assets (if uploaded).
     * 
     * @returns The CDK Asset for common assets, or undefined if not yet uploaded
     */
    getAsset(): Asset | undefined {
        return this.bootstrapAssets;
    }

    /**
     * Get the CDK Asset for a specific protocol (if uploaded).
     * 
     * @returns The CDK Asset for the protocol, or undefined if not yet uploaded
     */
    getProtocolAssets(): Asset | undefined {
        return this.protocolAssets;
    }

    /**
     * Load user-data script from specified directory
     * 
     * @param userDataScriptPath - Path to user data scripts
     * @returns The user data script as text file
     */
    loadUserDataScript(userDataScriptPath: string): string {
        try {
          const userDataScript = fs.readFileSync(userDataScriptPath, 'utf8');
          return userDataScript;
        } catch (error) {
          throw new Error(`Error retrieving user-data script for path '${userDataScriptPath}': ${error}`);
        }
    }
}
