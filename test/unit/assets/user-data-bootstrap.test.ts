// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithBash, runBash } from './shell-test-helpers';
import { extractBootstrapPart, loadDummyEnvironment, renderUserDataText, SAMPLE_CFN_CONFIG } from './render-user-data';
import { EnvironmentConfig } from '../../../lib/interfaces';

/**
 * Behaviour tests for the per-boot bootstrap gate in
 * assets/common/user-data-ubuntu.sh (issue #340).
 *
 * The user data is rendered from the real dummy single-node sample. Each
 * "boot" sources the rendered bootstrap with NODE_RUNNER_SOURCE_ONLY=1, points
 * its state/env/asset paths at a temp dir, stubs IMDS, package installs and
 * mounts, and calls main(). The fake node-setup.sh records each run.
 */
describeWithBash('user-data bootstrap gate (per-boot re-apply)', () => {
    let tmp: string;
    let env: EnvironmentConfig;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-'));
        fs.mkdirSync(path.join(tmp, 'per-boot'));
        fs.mkdirSync(path.join(tmp, 'assets/common'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'setup-runs.log'), '');
        env = loadDummyEnvironment();
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    const selfPath = () => path.join(tmp, 'per-boot/node-runner-bootstrap.sh');
    const setupRuns = () => fs.readFileSync(path.join(tmp, 'setup-runs.log'), 'utf-8').split('\n').filter(Boolean);
    const envFile = () => fs.readFileSync(path.join(tmp, 'cdk_environment'), 'utf-8');

    /** Deploy new user data: what IMDS returns and what cloud-init installed. */
    function deploy(userData: string, opts: { installedCopy?: string } = {}) {
        fs.writeFileSync(path.join(tmp, 'imds-user-data.fixture'), userData);
        fs.writeFileSync(selfPath(), opts.installedCopy ?? extractBootstrapPart(userData), { mode: 0o700 });
    }

    /** One boot. Returns the bootstrap's output. */
    function boot(opts: { setupExit?: number; mounted?: string[]; imdsDown?: boolean } = {}) {
        const mounted = opts.mounted ?? ['/data'];
        const res = runBash(`
export NODE_RUNNER_SOURCE_ONLY=1
source '${selfPath()}'
unset NODE_RUNNER_SOURCE_ONLY
CDK_ENV_FILE='${tmp}/cdk_environment'
STATE_DIR='${tmp}/state'
PER_BOOT_DIR='${tmp}/per-boot'
COMMON_ASSETS_PATH='${tmp}/assets/common'
fetch_imds_user_data() { ${opts.imdsDown ? 'return 1' : `cp '${tmp}/imds-user-data.fixture' "$1"`}; }
install_base_packages() { :; }
refresh_assets() {
  printf '#!/bin/bash\\necho "reapply=$1 env=$CDK_ENV_FILE" >> "${tmp}/setup-runs.log"\\nexit ${opts.setupExit ?? 0}\\n' > "$COMMON_ASSETS_PATH/node-setup.sh"
}
systemctl() { echo "systemctl $*" >> '${tmp}/systemctl.log'; }
mountpoint() { [[ " ${mounted.join(' ')} " == *" \${@: -1} "* ]]; }
main '${selfPath()}'
`);
        return res;
    }

    it('applies on first boot and records the fingerprint', () => {
        deploy(renderUserDataText(env));
        const res = boot();
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('Boot action: apply');
        expect(setupRuns()).toEqual([`reapply= env=${tmp}/cdk_environment`]);
        expect(fs.existsSync(path.join(tmp, 'state/applied-fingerprint'))).toBe(true);
        expect(fs.statSync(path.join(tmp, 'cdk_environment')).mode & 0o777).toBe(0o600);
    });

    it('does nothing on a plain reboot', () => {
        deploy(renderUserDataText(env));
        boot();
        const res = boot();
        expect(res.stdout).toContain('Boot action: skip');
        expect(setupRuns()).toHaveLength(1);
    });

    it('rewrites /etc/cdk_environment instead of appending to it', () => {
        deploy(renderUserDataText(env));
        boot();
        boot();
        boot();
        const content = envFile();
        expect(content.match(/^CLIENT_CONFIG=/gm)).toHaveLength(1);
        expect(content.match(/^STACK_NAME=/gm)).toHaveLength(1);
        expect(content).toContain(`CLIENT_CONFIG='${env.CLIENT_CONFIG}'`);
    });

    it('keeps an HA staging volume ID appended by snapshot-staging.sh', () => {
        deploy(renderUserDataText(env));
        boot();
        fs.appendFileSync(path.join(tmp, 'cdk_environment'), 'SNAPSHOT_STAGING_VOL_ID=vol-0123456789abcdef0\n');
        boot();
        expect(envFile()).toContain('\nSNAPSHOT_STAGING_VOL_ID=vol-0123456789abcdef0\n');
    });

    it('does not re-run setup for an INSTANCE_TYPE-only change, but updates the env file', () => {
        deploy(renderUserDataText(env));
        boot();
        deploy(renderUserDataText({ ...env, INSTANCE_TYPE: 'm7g.2xlarge' }));
        const res = boot();
        expect(res.stdout).toContain('Boot action: skip');
        expect(setupRuns()).toHaveLength(1);
        expect(envFile()).toContain("INSTANCE_TYPE='m7g.2xlarge'");
    });

    it('re-applies (as a re-apply) when CLIENT_CONFIG changes', () => {
        deploy(renderUserDataText(env));
        boot();
        deploy(renderUserDataText({ ...env, CLIENT_CONFIG: 'dummy-1.0.0-rpc-extended.sh' }));
        const res = boot();
        expect(res.stdout).toContain('Boot action: apply');
        expect(setupRuns()).toHaveLength(2);
        expect(setupRuns()[1]).toMatch(/^reapply=true /);
        expect(envFile()).toContain("CLIENT_CONFIG='dummy-1.0.0-rpc-extended.sh'");
    });

    it('re-applies when an asset changes (new S3 key in user data)', () => {
        deploy(renderUserDataText(env));
        boot();
        deploy(renderUserDataText(env, {
            ...SAMPLE_CFN_CONFIG,
            PROTOCOL_ASSETS_S3_PATH: 's3://bucket/' + 'c'.repeat(64) + '.zip',
        }));
        expect(boot().stdout).toContain('Boot action: apply');
    });

    it('retries setup on every boot until it succeeds (interrupted or failed first boot)', () => {
        deploy(renderUserDataText(env));
        const failed = boot({ setupExit: 1 });
        expect(failed.status).not.toBe(0);
        expect(failed.stdout).toContain('will be retried on next boot');
        expect(fs.existsSync(path.join(tmp, 'state/applied-fingerprint'))).toBe(false);
        expect(fs.readFileSync(path.join(tmp, 'systemctl.log'), 'utf-8')).toContain('systemctl start node.service');

        expect(boot().stdout).toContain('Boot action: apply');
        expect(boot().stdout).toContain('Boot action: skip');
        expect(setupRuns()).toHaveLength(2);
    });

    it('re-applies when a configured data volume is not mounted (e.g. wiped instance store)', () => {
        deploy(renderUserDataText(env));
        boot();
        const res = boot({ mounted: [] });
        expect(res.stderr).toContain('Data volume /data is not mounted');
        expect(res.stdout).toContain('Boot action: apply');
    });

    it('falls back to its own copy when IMDS is unreachable', () => {
        deploy(renderUserDataText(env));
        boot();
        const res = boot({ imdsDown: true });
        expect(res.stdout).toContain('could not read user data from IMDS');
        expect(res.stdout).toContain('Boot action: skip');
    });

    it('removes itself when user data was rolled back to a non-per-boot version', () => {
        deploy(renderUserDataText(env));
        boot();
        fs.writeFileSync(path.join(tmp, 'imds-user-data.fixture'), '#!/bin/bash\necho legacy user data\n');
        const res = boot();
        expect(res.stdout).toContain('Boot action: uninstall');
        expect(fs.existsSync(selfPath())).toBe(false);
        expect(setupRuns()).toHaveLength(1);
    });

    it('detects a stale installed copy and selects re-exec of the IMDS version', () => {
        const oldUserData = renderUserDataText(env);
        const newUserData = renderUserDataText({ ...env, CLIENT_CONFIG: 'dummy-1.0.0-rpc-extended.sh' });
        deploy(newUserData, { installedCopy: extractBootstrapPart(oldUserData) });
        const res = runBash(`
export NODE_RUNNER_SOURCE_ONLY=1
source '${selfPath()}'
STATE_DIR='${tmp}/state'; mkdir -p "$STATE_DIR"
DATA_VOLUMES_COUNT=0
echo "action=$(bootstrap_action '${selfPath()}' '${tmp}/imds-user-data.fixture')"
NODE_RUNNER_REEXEC=1
echo "reexec-action=$(bootstrap_action "$STATE_DIR/current-bootstrap.sh" '${tmp}/imds-user-data.fixture')"
`);
        expect(res.stdout).toContain('action=reexec');
        // The re-exec'd copy must not loop: it goes straight to the gate.
        expect(res.stdout).toContain('reexec-action=apply');
        expect(fs.readFileSync(path.join(tmp, 'state/current-bootstrap.sh'), 'utf-8'))
            .toBe(extractBootstrapPart(newUserData));
    });
});
