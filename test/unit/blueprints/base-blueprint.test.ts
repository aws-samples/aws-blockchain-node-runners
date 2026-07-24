// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * Security guard tests for the Base blueprint.
 *
 * The Base node is built from source by cloning github.com/base/node at boot
 * (as root). To avoid building a moving branch tip, node.sh clones the exact
 * ref declared by `base_node_tag` in the configuration file. These tests lock
 * in that the ref is pinned and that node.sh refuses a moving branch.
 */
describe('Base blueprint — pinned base/node ref', () => {
    const blueprintDir = path.join(__dirname, '../../../blueprints/base');
    const configPath = path.join(blueprintDir, 'configurations/base-reth-v1.2.0-full.yml');
    const nodeScriptPath = path.join(blueprintDir, 'user-data/node.sh');

    const readTag = (): string => {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/^base_node_tag:\s*"?([^"\n]+)"?/m);
        return match ? match[1].trim() : '';
    };

    it('pins base_node_tag to a release tag or commit SHA (not a moving branch)', () => {
        const tag = readTag();
        expect(tag).not.toBe('');
        expect(['main', 'master', 'HEAD']).not.toContain(tag);

        // Accept a semver-ish release tag (v1.1.1) or a 40-char commit SHA.
        const isReleaseTag = /^v\d+\.\d+\.\d+/.test(tag);
        const isCommitSha = /^[0-9a-f]{40}$/.test(tag);
        expect(isReleaseTag || isCommitSha).toBe(true);
    });

    it('declares the official base/node repository', () => {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/^base_node_repo:\s*"?([^"\n]+)"?/m);
        const repo = match ? match[1].trim() : '';
        expect(repo).toBe('https://github.com/base/node.git');
    });

    it('node.sh clones the pinned ref and refuses a moving branch', () => {
        const script = fs.readFileSync(nodeScriptPath, 'utf8');
        // Clones the resolved ref via --branch, not an unpinned default clone.
        expect(script).toMatch(/git clone --depth 1 --branch "\$BASE_NODE_REF"/);
        // Has an explicit guard against main/master/HEAD.
        expect(script).toMatch(/refusing to build from a moving branch/);
        // Does not contain the old unpinned clone of base/node.
        expect(script).not.toMatch(/git clone --depth 1 https:\/\/github\.com\/base\/node\.git/);
    });
});
