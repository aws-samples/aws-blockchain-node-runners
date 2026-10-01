// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * Blueprint re-run contract (issue #340).
 *
 * node.sh runs on first boot and again whenever the configuration changes on
 * redeploy, against the existing /data and with node.service stopped. These
 * checks guard the specific hazards found in the audit of the built-in
 * blueprints, plus contract-wide invariants.
 */
const BLUEPRINTS = path.join(__dirname, '../../../blueprints');
const read = (rel: string) => fs.readFileSync(path.join(BLUEPRINTS, rel), 'utf-8');
const builtIns = fs.readdirSync(BLUEPRINTS)
    .filter(name => fs.existsSync(path.join(BLUEPRINTS, name, 'user-data/node.sh')));

describe('blueprint node.sh re-run contract', () => {
    it('covers all six built-in blueprints', () => {
        expect(builtIns.sort()).toEqual(['base', 'bitcoin', 'bnb', 'dummy', 'ethereum', 'solana']);
    });

    describe.each(builtIns)('%s', (blueprint) => {
        const nodeSh = read(`${blueprint}/user-data/node.sh`);

        it('installs node.service and starts it', () => {
            expect(nodeSh).toContain('/etc/systemd/system/node.service');
            expect(nodeSh).toMatch(/systemctl (start|restart) node\.service/);
        });

        it('never formats or deletes the data volume', () => {
            expect(nodeSh).not.toMatch(/\bmkfs/);
            expect(nodeSh).not.toMatch(/rm -rf\s+"?\/data"?(\/\*)?(\s|$)/m);
        });

        it('marks setup complete with /data/init-completed', () => {
            expect(nodeSh).toContain('touch /data/init-completed');
        });
    });

    it('solana: keeps an existing validator identity instead of regenerating it', () => {
        const nodeSh = read('solana/user-data/node.sh');
        const guard = nodeSh.indexOf('[ -s /home/bcuser/config/validator-keypair.json ]');
        expect(guard).toBeGreaterThan(-1);
        // Both key generators sit behind the guard.
        expect(nodeSh.indexOf('solana-keygen new')).toBeGreaterThan(guard);
        expect(nodeSh.indexOf('fdctl keys new')).toBeGreaterThan(guard);
    });

    it('base: re-clones into a clean directory', () => {
        const nodeSh = read('base/user-data/node.sh');
        const rm = nodeSh.indexOf('rm -rf "$BASE_NODE_DIR"');
        expect(rm).toBeGreaterThan(-1);
        expect(rm).toBeLessThan(nodeSh.indexOf('git clone --depth 1 --branch "$BASE_NODE_REF"'));
    });

    it('bnb reth: removes a leftover build directory before cloning', () => {
        const config = read('bnb/configurations/bsc-reth-v0.1.2-full.sh');
        const rm = config.indexOf('rm -rf reth-bsc-build');
        expect(rm).toBeGreaterThan(-1);
        expect(rm).toBeLessThan(config.indexOf('git clone --branch "$RETH_VERSION"'));
    });

    it('bnb and base: one-time genesis and snapshot steps are guarded', () => {
        for (const config of ['bsc-geth-v1.7.8-full.sh', 'bsc-reth-v0.1.2-full.sh']) {
            const text = read(`bnb/configurations/${config}`);
            if (text.includes(' init ')) {
                expect(text).toMatch(/if \[ ! -d \/data\/[a-z]+ \]/);
            }
        }
        expect(read('bnb/user-data/common/download-snapshot.sh')).toContain('if [ -f /data/snapshot_downloaded ]');
        expect(read('base/user-data/common/download-snapshot.sh')).toContain('if [ -f /data/snapshot_downloaded ]');
    });

    describe('dummy (reference implementation)', () => {
        const nodeSh = read('dummy/user-data/node.sh');

        it('runs the configuration as node.service instead of from cloud-init', () => {
            expect(nodeSh).toContain('cp "$CONFIG_SCRIPT" /home/bcuser/bin/start-node.sh');
            expect(nodeSh).toContain('ExecStart=/home/bcuser/bin/start-node.sh');
            // node.sh must return so the bootstrap can record success.
            expect(nodeSh).not.toMatch(/^wait\s*$/m);
            expect(nodeSh).not.toMatch(/^\s*"\$CONFIG_SCRIPT"/m);
        });

        it('fails when the service does not come up', () => {
            expect(nodeSh).toMatch(/if ! systemctl is-active --quiet node\.service; then[\s\S]*?exit 1/);
        });

        it('runs the one-time staging debug path only once', () => {
            expect(nodeSh).toContain('[ ! -f "$STAGING_DEBUG_DONE" ]');
        });

        it('documents the re-run contract for blueprint authors', () => {
            expect(nodeSh).toContain('Re-run contract');
        });

        it.each(['dummy-1.0.0-rpc-base.sh', 'dummy-1.0.0-rpc-extended.sh'])(
            '%s stays in the foreground as the service process', (config) => {
                expect(read(`dummy/configurations/${config}`).trimEnd().endsWith('\nwait')).toBe(true);
            });
    });
});
