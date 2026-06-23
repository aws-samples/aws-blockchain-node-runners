// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';

/**
 * Tests for blueprint validation in ConfigurationLoader (Task 30).
 *
 * Uses mock node_modules fixtures with malformed blueprints to verify that
 * loadProtocolConfig collects and reports all validation errors together.
 */
describe('Blueprint validation in ConfigurationLoader', () => {
  let mockDir: string;
  let mockConfigLoader: ConfigurationLoader;

  beforeEach(() => {
    mockDir = path.join(__dirname, '__mock_nm_validation__');
    fs.mkdirSync(mockDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(mockDir, { recursive: true, force: true });
  });

  /**
   * Helper: write root package.json, per-package package.json files,
   * and optionally create directories/files inside each package.
   */
  function setupMockBlueprint(
    rootPkg: any,
    packages: Record<string, { json: any; files?: string[] }>,
  ) {
    const rootPkgPath = path.join(mockDir, 'package.json');
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg));

    const nodeModulesDir = path.join(mockDir, 'node_modules');
    for (const [pkgName, pkg] of Object.entries(packages)) {
      const pkgDir = path.join(nodeModulesDir, pkgName);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg.json));

      if (pkg.files) {
        for (const filePath of pkg.files) {
          const fullPath = path.join(pkgDir, filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, '#!/bin/bash\necho "mock"');
        }
      }
    }

    mockConfigLoader = new ConfigurationLoader();
    (mockConfigLoader as any).rootPackageJsonPath = rootPkgPath;
    (mockConfigLoader as any).nodeModulesPath = nodeModulesDir;
  }

  /** Minimal valid "aws-blockchain-node-runner" field */
  function validBnrField(): any {
    return {
      BLOCKCHAIN_PROTOCOL: 'test-chain',
      supportedDeploymentModes: ['single-node'],
      defaultConfiguration: 'test-1.0.0-rpc.sh',
      availableConfigurations: [{ name: 'test-1.0.0-rpc.sh', version: 'v1.0.0' }],
      BC_NETWORKS: ['testnet'],
      defaultInstanceTypes: { x86_64: 't3.medium' },
      requiredPorts: [{ port: 8545, protocol: 'tcp', description: 'RPC', public: false }],
      monitoring: { healthCheckPath: '/', metricsPort: 8545 },
      storage: { defaultDataVolumes: [{ name: 'data', sizeGiB: 100, type: 'gp3', mountPath: '/data' }] },
      customEnvVarsNamePrefix: 'TEST',
    };
  }

  /** Files needed for a valid blueprint on disk */
  function validFiles(): string[] {
    return ['user-data/node.sh', 'configurations/test-1.0.0-rpc.sh'];
  }

  // ─── Happy path ───────────────────────────────────────────────────────

  it('should load a valid blueprint without errors', () => {
    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-valid': 'file:bp' } },
      { 'bp-valid': { json: { name: 'bp-valid', version: '1.0.0', 'aws-blockchain-node-runner': validBnrField() }, files: validFiles() } },
    );

    const config = mockConfigLoader.loadProtocolConfig('test-chain');
    expect(config.BLOCKCHAIN_PROTOCOL).toBe('test-chain');
  });

  // ─── Missing required fields ──────────────────────────────────────────

  it('should report all missing required fields together', () => {
    const bnr = { BLOCKCHAIN_PROTOCOL: 'bad-chain' }; // missing everything else

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-bad': 'file:bp' } },
      { 'bp-bad': { json: { name: 'bp-bad', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: ['user-data/node.sh'] } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('bad-chain')).toThrow(/Blueprint validation failed/);

    try {
      mockConfigLoader.loadProtocolConfig('bad-chain');
    } catch (e: any) {
      // Should contain multiple missing-field errors in a single message
      expect(e.message).toContain("Missing required field 'supportedDeploymentModes'");
      expect(e.message).toContain("Missing required field 'requiredPorts'");
      expect(e.message).toContain("Missing required field 'monitoring'");
      expect(e.message).toContain("Missing required field 'storage'");
      expect(e.message).toContain("Missing required field 'customEnvVarsNamePrefix'");
    }
  });

  // ─── Type validation ──────────────────────────────────────────────────

  it('should report error when supportedDeploymentModes is not an array', () => {
    const bnr = { ...validBnrField(), supportedDeploymentModes: 'single-node' };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-type': 'file:bp' } },
      { 'bp-type': { json: { name: 'bp-type', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /supportedDeploymentModes must be an array/,
    );
  });

  it('should report error when requiredPorts is not an array', () => {
    const bnr = { ...validBnrField(), requiredPorts: 'not-an-array' };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-ports': 'file:bp' } },
      { 'bp-ports': { json: { name: 'bp-ports', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /requiredPorts must be an array/,
    );
  });

  it('should report error when monitoring is missing healthCheckPath or metricsPort', () => {
    const bnr = { ...validBnrField(), monitoring: { healthCheckPath: '/' } }; // missing metricsPort

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-mon': 'file:bp' } },
      { 'bp-mon': { json: { name: 'bp-mon', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /monitoring configuration must include healthCheckPath and metricsPort/,
    );
  });

  it('should report error when storage.defaultDataVolumes is not an array', () => {
    const bnr = { ...validBnrField(), storage: { defaultDataVolumes: 'not-array' } };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-stor': 'file:bp' } },
      { 'bp-stor': { json: { name: 'bp-stor', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /storage configuration must include defaultDataVolumes array/,
    );
  });

  // ─── defaultConfiguration not in availableConfigurations ──────────────

  it('should report error when defaultConfiguration does not exist in availableConfigurations', () => {
    const bnr = {
      ...validBnrField(),
      defaultConfiguration: 'nonexistent-config.sh',
    };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-defcfg': 'file:bp' } },
      { 'bp-defcfg': { json: { name: 'bp-defcfg', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /defaultConfiguration 'nonexistent-config\.sh' does not exist in availableConfigurations/,
    );
  });

  it('should pass when defaultConfiguration matches an entry in availableConfigurations', () => {
    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-ok': 'file:bp' } },
      { 'bp-ok': { json: { name: 'bp-ok', version: '1.0.0', 'aws-blockchain-node-runner': validBnrField() }, files: validFiles() } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).not.toThrow();
  });

  // ─── user-data/node.sh missing ────────────────────────────────────────

  it('should report error when user-data/node.sh is missing', () => {
    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-nosh': 'file:bp' } },
      {
        'bp-nosh': {
          json: { name: 'bp-nosh', version: '1.0.0', 'aws-blockchain-node-runner': validBnrField() },
          files: ['configurations/test-1.0.0-rpc.sh'], // node.sh intentionally missing
        },
      },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /Required user-data script 'user-data\/node\.sh' not found/,
    );
  });

  it('should pass when user-data/node.sh exists even without syncchecker.sh', () => {
    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-nosync': 'file:bp' } },
      {
        'bp-nosync': {
          json: { name: 'bp-nosync', version: '1.0.0', 'aws-blockchain-node-runner': validBnrField() },
          files: ['user-data/node.sh', 'configurations/test-1.0.0-rpc.sh'], // no syncchecker.sh
        },
      },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).not.toThrow();
  });

  // ─── Collect all errors together ──────────────────────────────────────

  it('should collect multiple errors from both structure and file validation in one message', () => {
    const bnr = {
      BLOCKCHAIN_PROTOCOL: 'multi-err',
      // missing: supportedDeploymentModes, BC_NETWORKS, defaultInstanceTypes,
      //          requiredPorts, monitoring, storage, customEnvVarsNamePrefix
      defaultConfiguration: 'ghost.sh',
      availableConfigurations: [{ name: 'ghost.sh', version: 'v1' }],
    };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-multi': 'file:bp' } },
      {
        'bp-multi': {
          json: { name: 'bp-multi', version: '1.0.0', 'aws-blockchain-node-runner': bnr },
          files: [], // no files at all
        },
      },
    );

    try {
      mockConfigLoader.loadProtocolConfig('multi-err');
      fail('Expected an error to be thrown');
    } catch (e: any) {
      // Structure errors
      expect(e.message).toContain("Missing required field 'supportedDeploymentModes'");
      expect(e.message).toContain("Missing required field 'requiredPorts'");
      expect(e.message).toContain("Missing required field 'monitoring'");
      expect(e.message).toContain("Missing required field 'storage'");
      expect(e.message).toContain("Missing required field 'customEnvVarsNamePrefix'");
      // File errors
      expect(e.message).toContain("user-data/node.sh");
      expect(e.message).toContain("ghost.sh");
      // All in one throw
      expect(e.message).toContain('Blueprint validation failed');
    }
  });

  it('should report availableConfigurations entry missing name field', () => {
    const bnr = {
      ...validBnrField(),
      availableConfigurations: [{ version: 'v1.0.0' }], // missing 'name'
      defaultConfiguration: 'test-1.0.0-rpc.sh', // won't match anything
    };

    setupMockBlueprint(
      { name: 'app', version: '1.0.0', dependencies: { 'bp-noname': 'file:bp' } },
      { 'bp-noname': { json: { name: 'bp-noname', version: '1.0.0', 'aws-blockchain-node-runner': bnr }, files: ['user-data/node.sh'] } },
    );

    expect(() => mockConfigLoader.loadProtocolConfig('test-chain')).toThrow(
      /availableConfigurations entry is missing 'name' field/,
    );
  });

  // ─── Real blueprints pass validation ──────────────────────────────────

  describe('Real installed blueprints pass validation', () => {
    let realConfigLoader: ConfigurationLoader;

    beforeEach(() => {
      realConfigLoader = new ConfigurationLoader();
    });

    it('should load dummy blueprint without validation errors', () => {
      expect(() => realConfigLoader.loadProtocolConfig('dummy')).not.toThrow();
    });

    it('should load ethereum blueprint without validation errors', () => {
      expect(() => realConfigLoader.loadProtocolConfig('ethereum')).not.toThrow();
    });

    it('should load solana blueprint without validation errors', () => {
      expect(() => realConfigLoader.loadProtocolConfig('solana')).not.toThrow();
    });
  });
});
