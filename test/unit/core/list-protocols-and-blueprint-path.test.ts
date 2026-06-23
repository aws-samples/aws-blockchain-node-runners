// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { BlueprintInfo } from '../../../lib/interfaces';

/**
 * Tests for listAvailableProtocols() and getBlueprintFilePath() (Task 31).
 *
 * Uses both real installed blueprints and mock node_modules fixtures.
 */
describe('ConfigurationLoader - listAvailableProtocols and getBlueprintFilePath', () => {

  // ─── listAvailableProtocols with real blueprints ──────────────────────

  describe('listAvailableProtocols (real blueprints)', () => {
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
      configLoader = new ConfigurationLoader();
    });

    it('should return BlueprintInfo array containing dummy, ethereum, and solana', () => {
      const protocols = configLoader.listAvailableProtocols();

      expect(Array.isArray(protocols)).toBe(true);
      const names = protocols.map(p => p.BLOCKCHAIN_PROTOCOL);
      expect(names).toContain('dummy');
      expect(names).toContain('ethereum');
      expect(names).toContain('solana');
    });

    it('should return correct fields for each blueprint', () => {
      const protocols = configLoader.listAvailableProtocols();

      for (const bp of protocols) {
        expect(bp.BLOCKCHAIN_PROTOCOL).toBeTruthy();
        expect(bp.packageName).toBeTruthy();
        expect(typeof bp.version).toBe('string');
        expect(typeof bp.description).toBe('string');
        expect(typeof bp.isBuiltIn).toBe('boolean');
      }
    });

    it('should mark all built-in blueprints as isBuiltIn=true', () => {
      const protocols = configLoader.listAvailableProtocols();

      const dummy = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'dummy');
      const ethereum = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'ethereum');
      const solana = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'solana');

      expect(dummy!.isBuiltIn).toBe(true);
      expect(ethereum!.isBuiltIn).toBe(true);
      expect(solana!.isBuiltIn).toBe(true);
    });

    it('should return correct package names for built-in blueprints', () => {
      const protocols = configLoader.listAvailableProtocols();

      const dummy = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'dummy');
      const ethereum = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'ethereum');
      const solana = protocols.find(p => p.BLOCKCHAIN_PROTOCOL === 'solana');

      expect(dummy!.packageName).toBe('aws-bnr-blueprint-dummy');
      expect(ethereum!.packageName).toBe('aws-bnr-blueprint-ethereum');
      expect(solana!.packageName).toBe('aws-bnr-blueprint-solana');
    });

    it('should return non-empty version and description for each blueprint', () => {
      const protocols = configLoader.listAvailableProtocols();

      for (const bp of protocols) {
        expect(bp.version).not.toBe('');
        expect(bp.description).not.toBe('');
      }
    });
  });

  // ─── listAvailableProtocols with mock node_modules ────────────────────

  describe('listAvailableProtocols (mock node_modules)', () => {
    let mockDir: string;
    let mockConfigLoader: ConfigurationLoader;

    beforeEach(() => {
      mockDir = path.join(__dirname, '__mock_nm_list__');
      fs.mkdirSync(mockDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    function setupMock(
      rootPkg: any,
      packages: Record<string, any>,
    ) {
      fs.writeFileSync(path.join(mockDir, 'package.json'), JSON.stringify(rootPkg));
      const nmDir = path.join(mockDir, 'node_modules');
      for (const [name, json] of Object.entries(packages)) {
        const pkgDir = path.join(nmDir, name);
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(json));
      }
      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = path.join(mockDir, 'package.json');
      (mockConfigLoader as any).nodeModulesPath = nmDir;
    }

    it('should distinguish file: dependencies as built-in and registry deps as external', () => {
      setupMock(
        {
          name: 'app', version: '1.0.0',
          dependencies: {
            'local-bp': 'file:blueprints/local',
            'registry-bp': '^2.0.0',
            'github-bp': 'github:owner/repo#v1.0.0',
          },
        },
        {
          'local-bp': {
            name: 'local-bp', version: '1.0.0', description: 'Local blueprint',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'local-chain' },
          },
          'registry-bp': {
            name: 'registry-bp', version: '2.0.0', description: 'Registry blueprint',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'registry-chain' },
          },
          'github-bp': {
            name: 'github-bp', version: '1.0.0', description: 'GitHub blueprint',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'github-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();

      const local = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'local-chain')!;
      const registry = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'registry-chain')!;
      const github = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'github-chain')!;

      expect(local.isBuiltIn).toBe(true);
      expect(registry.isBuiltIn).toBe(false);
      expect(github.isBuiltIn).toBe(false);
    });

    it('should return empty array when root package.json does not exist', () => {
      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = '/nonexistent/package.json';

      expect(mockConfigLoader.listAvailableProtocols()).toEqual([]);
    });

    it('should return empty array when root package.json is malformed', () => {
      fs.writeFileSync(path.join(mockDir, 'package.json'), 'not-json');
      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = path.join(mockDir, 'package.json');

      expect(mockConfigLoader.listAvailableProtocols()).toEqual([]);
    });

    it('should skip packages without aws-blockchain-node-runner field', () => {
      setupMock(
        {
          name: 'app', version: '1.0.0',
          dependencies: { 'regular-pkg': '^1.0.0', 'bp-pkg': 'file:bp' },
        },
        {
          'regular-pkg': { name: 'regular-pkg', version: '1.0.0' },
          'bp-pkg': {
            name: 'bp-pkg', version: '1.0.0', description: 'A blueprint',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'my-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();
      expect(blueprints).toHaveLength(1);
      expect(blueprints[0].BLOCKCHAIN_PROTOCOL).toBe('my-chain');
    });

    it('should skip packages missing from node_modules', () => {
      const rootPkgPath = path.join(mockDir, 'package.json');
      fs.writeFileSync(rootPkgPath, JSON.stringify({
        name: 'app', version: '1.0.0',
        dependencies: { 'missing-bp': '^1.0.0' },
      }));
      const nmDir = path.join(mockDir, 'node_modules');
      fs.mkdirSync(nmDir, { recursive: true });

      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = rootPkgPath;
      (mockConfigLoader as any).nodeModulesPath = nmDir;

      expect(mockConfigLoader.listAvailableProtocols()).toEqual([]);
    });

    it('should use "unknown" for version when package.json has no version field', () => {
      setupMock(
        { name: 'app', version: '1.0.0', dependencies: { 'no-ver': 'file:bp' } },
        {
          'no-ver': {
            name: 'no-ver', description: 'No version',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'no-ver-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();
      expect(blueprints[0].version).toBe('unknown');
    });

    it('should use empty string for description when package.json has no description', () => {
      setupMock(
        { name: 'app', version: '1.0.0', dependencies: { 'no-desc': 'file:bp' } },
        {
          'no-desc': {
            name: 'no-desc', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'no-desc-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();
      expect(blueprints[0].description).toBe('');
    });

    it('should include blueprints from both dependencies and devDependencies', () => {
      setupMock(
        {
          name: 'app', version: '1.0.0',
          dependencies: { 'dep-bp': 'file:dep' },
          devDependencies: { 'dev-bp': 'file:dev' },
        },
        {
          'dep-bp': {
            name: 'dep-bp', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'dep-chain' },
          },
          'dev-bp': {
            name: 'dev-bp', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'dev-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();
      const names = blueprints.map(b => b.BLOCKCHAIN_PROTOCOL);
      expect(names).toContain('dep-chain');
      expect(names).toContain('dev-chain');
    });

    it('should throw when two packages declare the same BLOCKCHAIN_PROTOCOL', () => {
      setupMock(
        {
          name: 'app', version: '1.0.0',
          dependencies: { 'bp-a': 'file:a', 'bp-b': 'file:b' },
        },
        {
          'bp-a': {
            name: 'bp-a', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'dup-chain' },
          },
          'bp-b': {
            name: 'bp-b', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'dup-chain' },
          },
        },
      );

      expect(() => mockConfigLoader.listAvailableProtocols()).toThrow(
        /Conflict: two installed packages declare the same BLOCKCHAIN_PROTOCOL 'dup-chain'/,
      );
    });
  });


  // ─── getBlueprintFilePath with real blueprints ────────────────────────

  describe('getBlueprintFilePath (real blueprints)', () => {
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
      configLoader = new ConfigurationLoader();
    });

    it('should resolve absolute path to user-data/node.sh for dummy protocol', () => {
      const filePath = configLoader.getBlueprintFilePath('dummy', 'user-data/node.sh');

      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath).toContain('node_modules');
      expect(filePath).toContain('aws-bnr-blueprint-dummy');
      expect(filePath.endsWith(path.join('user-data', 'node.sh'))).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should resolve absolute path to package.json for ethereum protocol', () => {
      const filePath = configLoader.getBlueprintFilePath('ethereum', 'package.json');

      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath).toContain('aws-bnr-blueprint-ethereum');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should resolve absolute path to user-data/syncchecker.sh for solana protocol', () => {
      const filePath = configLoader.getBlueprintFilePath('solana', 'user-data/syncchecker.sh');

      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath).toContain('aws-bnr-blueprint-solana');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should return path even if file does not exist (no existence check)', () => {
      const filePath = configLoader.getBlueprintFilePath('dummy', 'nonexistent/file.txt');

      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath).toContain('aws-bnr-blueprint-dummy');
      expect(filePath.endsWith(path.join('nonexistent', 'file.txt'))).toBe(true);
      // The method resolves the path but does not check existence
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should throw descriptive error for unknown protocol', () => {
      expect(() => {
        configLoader.getBlueprintFilePath('nonexistent-protocol', 'user-data/node.sh');
      }).toThrow(/no installed package declares BLOCKCHAIN_PROTOCOL 'nonexistent-protocol'/);
    });

    it('should throw error listing available protocols when protocol not found', () => {
      expect(() => {
        configLoader.getBlueprintFilePath('nonexistent-protocol', 'user-data/node.sh');
      }).toThrow(/Available protocols:/);
    });
  });

  // ─── getBlueprintFilePath with mock node_modules ──────────────────────

  describe('getBlueprintFilePath (mock node_modules)', () => {
    let mockDir: string;
    let mockConfigLoader: ConfigurationLoader;

    beforeEach(() => {
      mockDir = path.join(__dirname, '__mock_nm_filepath__');
      fs.mkdirSync(mockDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    function setupMock(
      rootPkg: any,
      packages: Record<string, { json: any; files?: string[] }>,
    ) {
      fs.writeFileSync(path.join(mockDir, 'package.json'), JSON.stringify(rootPkg));
      const nmDir = path.join(mockDir, 'node_modules');
      for (const [name, pkg] of Object.entries(packages)) {
        const pkgDir = path.join(nmDir, name);
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
      (mockConfigLoader as any).rootPackageJsonPath = path.join(mockDir, 'package.json');
      (mockConfigLoader as any).nodeModulesPath = nmDir;
    }

    it('should resolve path through node_modules using protocol-to-package mapping', () => {
      setupMock(
        { name: 'app', version: '1.0.0', dependencies: { 'my-bp': 'file:bp' } },
        {
          'my-bp': {
            json: {
              name: 'my-bp', version: '1.0.0',
              'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'my-chain' },
            },
            files: ['user-data/node.sh'],
          },
        },
      );

      const filePath = mockConfigLoader.getBlueprintFilePath('my-chain', 'user-data/node.sh');
      const nmDir = path.join(mockDir, 'node_modules');

      expect(filePath).toBe(path.join(nmDir, 'my-bp', 'user-data', 'node.sh'));
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should resolve nested relative paths correctly', () => {
      setupMock(
        { name: 'app', version: '1.0.0', dependencies: { 'nested-bp': '^1.0.0' } },
        {
          'nested-bp': {
            json: {
              name: 'nested-bp', version: '1.0.0',
              'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'nested-chain' },
            },
            files: ['user-data/common/helper.sh'],
          },
        },
      );

      const filePath = mockConfigLoader.getBlueprintFilePath('nested-chain', 'user-data/common/helper.sh');
      const nmDir = path.join(mockDir, 'node_modules');

      expect(filePath).toBe(path.join(nmDir, 'nested-bp', 'user-data', 'common', 'helper.sh'));
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });
});
