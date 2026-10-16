// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithBash, runBash } from './shell-test-helpers';

/**
 * Behaviour tests for assets/common/node-setup.sh, the full setup the
 * bootstrap runs on first boot and whenever its gate decides to re-apply.
 * The script is sourced with NODE_RUNNER_SOURCE_ONLY=1, system commands are
 * stubbed with functions that log calls, and apply_setup is invoked directly.
 */
const SCRIPT = path.join(__dirname, '../../../assets/common/node-setup.sh');

describeWithBash('node-setup.sh (re-run safety)', () => {
    let tmp: string;
    const log = () => fs.readFileSync(path.join(tmp, 'calls.log'), 'utf-8');

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'node-setup-'));
        fs.mkdirSync(path.join(tmp, 'common'));
        fs.mkdirSync(path.join(tmp, 'blueprints/user-data'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'state'));
        fs.writeFileSync(path.join(tmp, 'calls.log'), '');
        fs.writeFileSync(path.join(tmp, 'cdk_environment'), [
            "STACK_NAME='s'", "AWS_REGION='us-east-1'", "LOGICAL_RESOURCE_ID='SingleNode1'",
            "LIFECYCLE_HOOK_NAME='none'", "ASG_NAME='none'", "SNAPSHOT_ENABLED='false'",
            "BLOCKCHAIN_PROTOCOL='dummy'", '',
        ].join('\n'));
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    function apply(reapply: string, opts: { storageExit?: number; nodeExit?: number; nodeServiceExists?: boolean } = {}) {
        const calls = path.join(tmp, 'calls.log');
        fs.writeFileSync(path.join(tmp, 'common/setup-storage.sh'),
            `#!/bin/bash\necho storage >> '${calls}'\nexit ${opts.storageExit ?? 0}\n`, { mode: 0o755 });
        fs.writeFileSync(path.join(tmp, 'blueprints/user-data/node.sh'),
            `#!/bin/bash\necho "node.sh $1" >> '${calls}'\nexit ${opts.nodeExit ?? 0}\n`, { mode: 0o755 });
        return runBash(`
export NODE_RUNNER_SOURCE_ONLY=1 CDK_ENV_FILE='${tmp}/cdk_environment' STATE_DIR='${tmp}/state'
export COMMON_ASSETS_PATH='${tmp}/common' PROTOCOL_ASSETS_PATH='${tmp}/blueprints'
source '${SCRIPT}'
c() { echo "$*" >> '${calls}'; }
curl() { echo i-0123; }
setup_cloudwatch_agent() { c cloudwatch; }
setup_traffic_shaping_and_syncchecker() { c traffic; }
cfn-signal() { c "cfn-signal $*"; }
groupadd() { :; }; useradd() { :; }; usermod() { :; }
sleep() { c "sleep $*"; }
aws() { c "aws $*"; }
systemctl() {
  if [[ "$1" == cat ]]; then return ${opts.nodeServiceExists ? 0 : 1}; fi
  c "systemctl $*"
}
apply_setup '${reapply}'
`);
    }

    it('first boot: waits for volumes, signals CloudFormation once, runs storage then node.sh', () => {
        const res = apply('');
        expect(res.status).toBe(0);
        const calls = log().split('\n').filter(Boolean);
        expect(calls).toEqual([
            'cloudwatch',
            'cfn-signal --stack s --resource SingleNode1 --region us-east-1',
            'sleep 60',
            'storage',
            'traffic',
            'node.sh false',
        ]);
        expect(fs.existsSync(path.join(tmp, 'state/cfn-signalled'))).toBe(true);
    });

    it('re-apply: no repeated cfn-signal or volume wait, and node.service is stopped before node.sh', () => {
        apply('');
        fs.writeFileSync(path.join(tmp, 'calls.log'), '');
        const res = apply('true', { nodeServiceExists: true });
        expect(res.status).toBe(0);
        const calls = log().split('\n').filter(Boolean);
        expect(calls).not.toContain('sleep 60');
        expect(calls.some(c => c.startsWith('cfn-signal'))).toBe(false);
        expect(calls.indexOf('systemctl stop node.service')).toBeGreaterThan(-1);
        expect(calls.indexOf('systemctl stop node.service')).toBeLessThan(calls.indexOf('node.sh false'));
    });

    it('re-apply: aborts before node.sh when storage setup fails (never runs the node on the root disk)', () => {
        const res = apply('true', { storageExit: 1, nodeServiceExists: true });
        expect(res.status).not.toBe(0);
        expect(res.stdout).toContain('storage setup failed during re-apply');
        expect(log()).not.toContain('node.sh');
    });

    it('first boot: a storage failure is logged but does not stop setup (unchanged behaviour)', () => {
        const res = apply('', { storageExit: 1 });
        expect(res.status).toBe(0);
        expect(log()).toContain('node.sh false');
    });

    it('propagates a node.sh failure so the bootstrap retries on the next boot', () => {
        const res = apply('true', { nodeExit: 3 });
        expect(res.status).toBe(3);
    });

    it('signals the HA lifecycle hook when configured', () => {
        fs.appendFileSync(path.join(tmp, 'cdk_environment'), "LIFECYCLE_HOOK_NAME='hook'\nASG_NAME='asg'\nLOGICAL_RESOURCE_ID='none'\n");
        const res = apply('');
        expect(res.status).toBe(0);
        expect(log()).toMatch(/aws autoscaling complete-lifecycle-action .*--instance-id i-0123 --lifecycle-hook-name hook --auto-scaling-group-name asg/);
        expect(log()).not.toContain('cfn-signal');
    });
});
