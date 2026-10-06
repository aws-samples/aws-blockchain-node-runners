// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AssetsManager, PROTOCOL_ASSET_EXCLUDE } from '../../../lib/core/assets-manager';

/**
 * The protocol assets zip hash is embedded in the instance user data, so any
 * file in it that changes reboots single-node stacks and re-runs node setup
 * on redeploy (issue #340). Documentation and samples must not be part of it.
 */
describe('protocol assets exclusions', () => {
    const blueprintsPath = path.join(__dirname, '../../../blueprints');
    let tmp: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-assets-'));
        fs.cpSync(path.join(blueprintsPath, 'dummy'), tmp, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    const hash = () => cdk.FileSystem.fingerprint(tmp, { exclude: PROTOCOL_ASSET_EXCLUDE });

    it('does not change when the README or a sample .env changes', () => {
        const before = hash();
        fs.appendFileSync(path.join(tmp, 'README.md'), '\nTypo fix.\n');
        fs.appendFileSync(path.join(tmp, 'samples/.env-mainnet-single-node'), '\n# comment\n');
        fs.writeFileSync(path.join(tmp, '.env-local'), 'AWS_ACCOUNT_ID="123456789012"\n');
        fs.mkdirSync(path.join(tmp, 'docs'));
        fs.writeFileSync(path.join(tmp, 'docs/diagram.md'), 'x');
        expect(hash()).toBe(before);
    });

    it.each([
        'user-data/node.sh',
        'user-data/syncchecker.sh',
        'configurations/dummy-1.0.0-rpc-base.sh',
        'package.json',
    ])('changes when %s changes', (file) => {
        const before = hash();
        fs.appendFileSync(path.join(tmp, file), '\n');
        expect(hash()).not.toBe(before);
    });

    it('is applied to the uploaded protocol asset', () => {
        const stack = new cdk.Stack(new cdk.App(), 'AssetStack');
        const manager = new AssetsManager(stack, path.join(__dirname, '../../../assets'), blueprintsPath);
        manager.uploadProtocolAssets('dummy');
        const assetHash = manager.getProtocolAssets()!.assetHash;
        const expected = cdk.FileSystem.fingerprint(manager.getProtocolAssetssPath('dummy'), { exclude: PROTOCOL_ASSET_EXCLUDE });
        expect(assetHash).toBe(expected);
    });
});
