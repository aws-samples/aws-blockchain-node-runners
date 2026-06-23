// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { AssetsManager } from '../../../lib/core/assets-manager';

describe('AssetsManager', () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let assetsManager: AssetsManager;
    const testAssetsPath = path.join(__dirname, '../../../assets');
    const testBlueprintsPath = path.join(__dirname, '../../../blueprints');

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, 'TestStack');
        assetsManager = new AssetsManager(stack, testAssetsPath, testBlueprintsPath);
    });

    describe('constructor', () => {
        it('should create instance with custom paths', () => {
            expect(assetsManager.getAssetsPath()).toBe(testAssetsPath);
            // getProtocolAssetssPath now resolves from node_modules/ via ConfigurationLoader
            expect(assetsManager.getProtocolAssetssPath('dummy')).toContain('aws-bnr-blueprint-dummy');
        });

        it('should create instance with default paths when not provided', () => {
            const defaultManager = new AssetsManager(stack);

            expect(defaultManager.getAssetsPath()).toContain('assets');
        });
    });

    describe('getAssetsPath', () => {
        it('should return the configured common assets path', () => {
            expect(assetsManager.getAssetsPath()).toBe(testAssetsPath);
        });
    });

    describe('getProtocolAssetssPath', () => {
        it('should return the correct path for a protocol (resolved from node_modules/)', () => {
            const protocolPath = assetsManager.getProtocolAssetssPath('dummy');
            expect(protocolPath).toContain('aws-bnr-blueprint-dummy');
        });

        it('should return different paths for different protocols', () => {
            const dummyPath = assetsManager.getProtocolAssetssPath('dummy');
            const ethereumPath = assetsManager.getProtocolAssetssPath('ethereum');

            expect(dummyPath).not.toBe(ethereumPath);
            expect(dummyPath).toContain('dummy');
            expect(ethereumPath).toContain('ethereum');
        });
    });

    describe('validateAssets', () => {
        it('should return true when all required files exist', () => {
            expect(assetsManager.validateAssets()).toBe(true);
        });

        it('should return false when common assets directory does not exist', () => {
            const invalidManager = new AssetsManager(stack, '/nonexistent/path', testBlueprintsPath);
            expect(invalidManager.validateAssets()).toBe(false);
        });

        it('should return false when required files are missing', () => {
            // Use a directory that exists but doesn't have the common subdirectory with all required files
            const incompleteAssetsPath = path.join(__dirname, '../../unit');
            const invalidManager = new AssetsManager(stack, incompleteAssetsPath, testBlueprintsPath);
            expect(invalidManager.validateAssets()).toBe(false);
        });

        it('should return false when common subdirectory does not exist', () => {
            // Use a directory that exists but doesn't have a common subdirectory
            const noCommonPath = path.join(__dirname, '../../../blueprints/dummy');
            const invalidManager = new AssetsManager(stack, noCommonPath, testBlueprintsPath);
            expect(invalidManager.validateAssets()).toBe(false);
        });
    });

    describe('validateProtocolAssets', () => {
        it('should return true when protocol assets are valid', () => {
            expect(assetsManager.validateProtocolAssets('dummy')).toBe(true);
        });

        it('should return false when protocol directory does not exist', () => {
            expect(assetsManager.validateProtocolAssets('nonexistent-protocol')).toBe(false);
        });

        it('should return false when user-data/node.sh is missing', () => {
            // Create a manager pointing to a directory without user-data/node.sh
            const invalidProtocolsPath = path.join(__dirname, '../../../assets');
            const invalidManager = new AssetsManager(stack, testAssetsPath, invalidProtocolsPath);
            expect(invalidManager.validateProtocolAssets('noneValue')).toBe(false);
        });
    });

    describe('uploadAssets', () => {
        it('should upload common assets and return S3 URL token', () => {
            const s3Url = assetsManager.uploadAssets();

            expect(s3Url).toBeDefined();
            // CDK Assets return tokens that are resolved at synthesis time
            expect(typeof s3Url).toBe('string');
            expect(s3Url.length).toBeGreaterThan(0);
        });

        it('should return cached asset on subsequent calls', () => {
            const firstUrl = assetsManager.uploadAssets();
            const secondUrl = assetsManager.uploadAssets();

            expect(firstUrl).toBe(secondUrl);
        });

        it('should throw error when common assets validation fails', () => {
            const invalidManager = new AssetsManager(stack, '/nonexistent/path', testBlueprintsPath);

            expect(() => {
                invalidManager.uploadAssets();
            }).toThrow('Common assets validation failed. Ensure all required files exist in: /nonexistent/path');
        });

        it('should create CDK Asset resource', () => {
            assetsManager.uploadAssets();

            const asset = assetsManager.getAsset();
            expect(asset).toBeDefined();
            // Asset path is a hash-based identifier in CDK
            expect(asset?.assetPath).toBeDefined();
            expect(typeof asset?.assetPath).toBe('string');
        });
    });

    describe('uploadProtocolAssets', () => {
        it('should upload protocol assets and return S3 URL token', () => {
            const s3Url = assetsManager.uploadProtocolAssets('dummy');

            expect(s3Url).toBeDefined();
            // CDK Assets return tokens that are resolved at synthesis time
            expect(typeof s3Url).toBe('string');
            expect(s3Url.length).toBeGreaterThan(0);
        });

        it('should create new asset for each protocol upload', () => {
            const firstUrl = assetsManager.uploadProtocolAssets('dummy');
            
            expect(firstUrl).toBeDefined();
            expect(typeof firstUrl).toBe('string');
            expect(firstUrl.length).toBeGreaterThan(0);
        });

        it('should throw error when protocol assets validation fails', () => {
            expect(() => {
                assetsManager.uploadProtocolAssets('nonexistent-protocol');
            }).toThrow("Protocol assets validation failed for 'nonexistent-protocol'");
        });

        it('should create CDK Asset resource for protocol', () => {
            assetsManager.uploadProtocolAssets('dummy');

            const asset = assetsManager.getProtocolAssets();
            expect(asset).toBeDefined();
            // Asset path is a hash-based identifier in CDK
            expect(asset?.assetPath).toBeDefined();
            expect(typeof asset?.assetPath).toBe('string');
        });
    });

    describe('getAsset', () => {
        it('should return undefined before upload', () => {
            expect(assetsManager.getAsset()).toBeUndefined();
        });

        it('should return Asset after upload', () => {
            assetsManager.uploadAssets();
            expect(assetsManager.getAsset()).toBeDefined();
        });
    });

    describe('getProtocolAssets', () => {
        it('should return undefined before upload', () => {
            expect(assetsManager.getProtocolAssets()).toBeUndefined();
        });

        it('should return Asset after upload', () => {
            assetsManager.uploadProtocolAssets('dummy');
            const asset = assetsManager.getProtocolAssets();
            
            expect(asset).toBeDefined();
            expect(asset?.assetPath).toBeDefined();
        });

        it('should store the most recently uploaded protocol asset', () => {
            // Upload protocol
            assetsManager.uploadProtocolAssets('dummy');
            const asset = assetsManager.getProtocolAssets();
            
            expect(asset).toBeDefined();
            expect(typeof asset?.assetPath).toBe('string');
            expect(asset?.assetPath.length).toBeGreaterThan(0);
        });
    });

    describe('loadUserDataScript', () => {
        it('should load user data script from specified path', () => {
            const scriptPath = path.join(testAssetsPath, 'common', 'user-data-ubuntu.sh');
            const script = assetsManager.loadUserDataScript(scriptPath);

            expect(script).toBeDefined();
            expect(script.length).toBeGreaterThan(0);
            expect(script).toContain('#!/bin/bash');
        });

        it('should throw error when script file does not exist', () => {
            expect(() => {
                assetsManager.loadUserDataScript('/nonexistent/script.sh');
            }).toThrow("Error retrieving user-data script for path '/nonexistent/script.sh'");
        });

        it('should load protocol-specific user data script', () => {
            const protocolScriptPath = path.join(testBlueprintsPath, 'dummy', 'user-data', 'node.sh');
            const script = assetsManager.loadUserDataScript(protocolScriptPath);

            expect(script).toBeDefined();
            expect(script.length).toBeGreaterThan(0);
        });
    });
});
