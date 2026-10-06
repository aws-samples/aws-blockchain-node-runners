// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import {
    UserDataManager,
    USER_DATA_MAX_BYTES,
    USER_DATA_WARN_BYTES,
    USER_DATA_BOOTSTRAP_FILENAME,
    USER_DATA_MIME_BOUNDARY,
} from '../../../lib/core/user-data-manager';
import {
    BLUEPRINTS_PATH,
    SAMPLE_CFN_CONFIG,
    USER_DATA_SCRIPT,
    extractBootstrapPart,
    loadDummyEnvironment,
    renderUserDataText,
} from '../assets/render-user-data';

/**
 * Tests for UserDataManager.renderUserData: the per-boot MIME wrapper used
 * for in-place re-apply on single-node stacks (issue #340) and the synth-time
 * 16 KB user data limit check.
 */
describe('UserDataManager.renderUserData', () => {
    const manager = new UserDataManager(USER_DATA_SCRIPT);

    describe('per-boot MIME wrapper', () => {
        const userData = renderUserDataText(loadDummyEnvironment());

        it('is a single-part MIME message cloud-init runs on every boot', () => {
            expect(userData.startsWith(`Content-Type: multipart/mixed; boundary="${USER_DATA_MIME_BOUNDARY}"\n`)).toBe(true);
            expect(userData.match(/^Content-Type: text\/x-shellscript-per-boot; charset="us-ascii"$/gm)).toHaveLength(1);
            expect(userData).toContain(`Content-Disposition: attachment; filename="${USER_DATA_BOOTSTRAP_FILENAME}"`);
            expect(userData.trimEnd().endsWith(`--${USER_DATA_MIME_BOUNDARY}--`)).toBe(true);
            // No other part (e.g. cloud_final_modules overrides) is needed.
            expect(userData.match(/^Content-Type:/gm)).toHaveLength(2);
        });

        it('is 7-bit ASCII, as declared in the part headers', () => {
            expect(/^[\x00-\x7F]*$/.test(userData)).toBe(true);
        });

        it('contains the bootstrap with the shebang first and no comment lines', () => {
            const part = extractBootstrapPart(userData);
            expect(part.startsWith('#!/bin/bash\n')).toBe(true);
            expect(part.split('\n').filter(l => /^\s*#(?!!)/.test(l))).toEqual([]);
        });

        it('keeps the single-quoted environment block (security boundary unchanged)', () => {
            const env = loadDummyEnvironment();
            const part = extractBootstrapPart(userData);
            expect(part).toContain(`CLIENT_CONFIG='${env.CLIENT_CONFIG}'`);
            expect(part).toContain("DATA_VOL_1_MOUNT_PATH='/data'");
            expect(part).toContain("cat > \"$tmp\" <<'CDK_ENVIRONMENT_EOF'");
        });

        it('only differs in the INSTANCE_TYPE line for a resize (gate fingerprint ignores it)', () => {
            const env = loadDummyEnvironment();
            const a = extractBootstrapPart(renderUserDataText(env)).split('\n');
            const b = extractBootstrapPart(renderUserDataText({ ...env, INSTANCE_TYPE: 'm7g.4xlarge' })).split('\n');
            const differing = a.filter((line, i) => line !== b[i]);
            expect(differing).toEqual([`INSTANCE_TYPE='${env.INSTANCE_TYPE}'`]);
        });
    });

    describe('stripCommentLines', () => {
        it('keeps the shebang, code and KEY=value lines and removes full-line comments', () => {
            const out = UserDataManager.stripCommentLines('#!/bin/bash\n# comment\n  # indented\nA=\'#x\'\necho "# not a comment"\n');
            expect(out).toBe('#!/bin/bash\nA=\'#x\'\necho "# not a comment"\n');
        });
    });

    describe('user data size limit', () => {
        it('estimates unresolved tokens conservatively', () => {
            const bytes = UserDataManager.estimateRenderedBytes('x=${A}', { A: '${Token[TOKEN.1]}' });
            expect(bytes).toBe('x='.length + 128);
        });

        it('fails synthesis when the rendered user data would exceed 16 KB', () => {
            const env = loadDummyEnvironment();
            env.CUSTOM_VARIABLES = { DUMMY_BIG_VALUE: 'x'.repeat(USER_DATA_MAX_BYTES) };
            expect(() => manager.renderUserData(env, SAMPLE_CFN_CONFIG))
                .toThrow(/over the EC2 limit of 16384 bytes/);
        });

        it('warns when the rendered user data is close to the limit', () => {
            const env = loadDummyEnvironment();
            const base = renderUserDataText(env).length;
            env.CUSTOM_VARIABLES = { DUMMY_BIG_VALUE: 'x'.repeat(USER_DATA_WARN_BYTES - base + 200) };
            const stack = new cdk.Stack(new cdk.App(), 'SizeWarnStack');
            new cdk.CfnWaitConditionHandle(stack, 'Placeholder');
            manager.renderUserData(env, SAMPLE_CFN_CONFIG, stack);
            Annotations.fromStack(stack).hasWarning('*', Match.stringLikeRegexp('Rendered user data is about \\d+ of 16384 bytes'));
        });

        // Every built-in sample must stay well below the limit, so ordinary
        // .env additions never hit it.
        const samples = fs.readdirSync(BLUEPRINTS_PATH).flatMap(protocol => {
            const dir = path.join(BLUEPRINTS_PATH, protocol, 'samples');
            return fs.existsSync(dir)
                ? fs.readdirSync(dir).filter(f => f.startsWith('.env-')).map(f => [protocol, path.join(dir, f)])
                : [];
        });

        it.each(samples)('%s sample %s renders under the warning threshold', (protocol, envPath) => {
            const userData = renderUserDataText(loadDummyEnvironment(envPath, protocol));
            expect(Buffer.byteLength(userData)).toBeLessThan(USER_DATA_WARN_BYTES);
        });
    });
});
