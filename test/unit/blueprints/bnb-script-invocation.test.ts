// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression guard: BNB configuration scripts must not execute repository
 * shell scripts directly by path.
 *
 * When the CDK asset is zipped from a Windows checkout, the execute bit that
 * git stores (100755) is lost, so `/opt/blueprints/.../foo.sh args` fails with
 * "Permission denied" on the instance. Invoking the helper as `bash <path>`
 * (or sourcing it) does not depend on the file mode.
 */

const configurationsDir = path.join(__dirname, '../../../blueprints/bnb/configurations');

// A /opt/blueprints/... .sh path in command position: at the start of a line,
// or right after `;`, `&`, `|`, `(`, `!`, or `if`/`then`/`else`/`do`.
// `bash <path>`, `source <path>` and `. <path>` are not in command position.
const DIRECT_EXEC = /(^|[;&|(!]\s*|\b(?:if|then|else|do)\s+)["']?\/opt\/blueprints\/[^\s"']+\.sh\b/;

function directExecutions(script: string): string[] {
    return script
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'))
        .filter(line => DIRECT_EXEC.test(line));
}

describe('BNB configuration scripts invoke repo shell scripts via bash', () => {
    const scripts = fs.readdirSync(configurationsDir).filter(f => f.endsWith('.sh'));

    it('finds BNB configuration scripts to check', () => {
        expect(scripts.length).toBeGreaterThan(0);
    });

    it.each(scripts)('%s does not execute a /opt/blueprints/*.sh path directly', file => {
        const script = fs.readFileSync(path.join(configurationsDir, file), 'utf8');
        expect(directExecutions(script)).toEqual([]);
    });

    it('detects the direct-execution pattern this guards against', () => {
        const bad = '    /opt/blueprints/user-data/common/download-snapshot.sh geth "$T" || true';
        const good = '    if ! bash /opt/blueprints/user-data/common/download-snapshot.sh geth "$T"; then';
        expect(directExecutions(bad)).toHaveLength(1);
        expect(directExecutions(good)).toEqual([]);
    });
});
