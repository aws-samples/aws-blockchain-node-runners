// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'child_process';

/**
 * Helpers for behaviour tests of the provisioning shell scripts.
 *
 * The scripts target Ubuntu 24.04 (bash 5) and use bash 4+ features
 * (mapfile, ${!var}). macOS ships bash 3.2, so these tests locate a bash 4+
 * interpreter (BASH_FOR_TESTS, or `bash` on PATH) and are skipped when none
 * is available. CI runs on ubuntu-latest, where they always run.
 */
function findModernBash(): string | undefined {
    const candidates = [process.env.BASH_FOR_TESTS, 'bash', '/opt/homebrew/bin/bash', '/usr/local/bin/bash']
        .filter((c): c is string => !!c);
    for (const candidate of candidates) {
        const res = spawnSync(candidate, ['-c', 'echo ${BASH_VERSINFO[0]}'], { encoding: 'utf-8' });
        if (res.status === 0 && parseInt(res.stdout.trim(), 10) >= 4) {
            return candidate;
        }
    }
    return undefined;
}

export const MODERN_BASH = findModernBash();

/** `describe` when bash 4+ is available, otherwise `describe.skip`. */
export const describeWithBash = MODERN_BASH ? describe : describe.skip;

export interface BashResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/** Run a bash script body with the bash 4+ interpreter. */
export function runBash(script: string, env: NodeJS.ProcessEnv = {}): BashResult {
    if (!MODERN_BASH) {
        throw new Error('bash 4+ not available');
    }
    const res = spawnSync(MODERN_BASH, ['-c', script], {
        encoding: 'utf-8',
        env: { ...process.env, ...env },
        timeout: 60_000,
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}
