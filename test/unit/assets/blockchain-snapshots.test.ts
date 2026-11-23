// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithBash, runBash } from './shell-test-helpers';

/**
 * Behaviour tests for assets/common/blockchain-snapshots.sh. The script is
 * sourced with NODE_RUNNER_SOURCE_ONLY=1, aws/apt-get/git/runuser are stubbed
 * with functions that log their calls, and main is invoked directly.
 */
const SCRIPT = path.join(__dirname, '../../../assets/common/blockchain-snapshots.sh');
const PINNED = fs.readFileSync(SCRIPT, 'utf-8').match(/^BLOCKCHAIN_SNAPSHOTS_COMMIT="([0-9a-f]{40})"$/m)![1];

describeWithBash('blockchain-snapshots.sh', () => {
    let tmp: string;
    let out: string;
    const calls = () => fs.readFileSync(path.join(tmp, 'calls.log'), 'utf-8').split('\n').filter(Boolean);

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blockchain-snapshots-'));
        out = path.join(tmp, 'data/execution');
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(tmp, 'calls.log'), '');
        fs.writeFileSync(path.join(tmp, 'cdk_environment'),
            "SNAPSHOT_ID='ethereum-mainnet-geth'\nAWS_REGION='us-east-1'\n");
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    function run(opts: { bucketOk?: boolean; toolOk?: boolean; head?: string } = {}) {
        const log = path.join(tmp, 'calls.log');
        return runBash(`
export NODE_RUNNER_SOURCE_ONLY=1 CDK_ENV_FILE='${tmp}/cdk_environment' BLOCKCHAIN_SNAPSHOTS_TOOL_DIR='${tmp}/tool'
source '${SCRIPT}'
c() { echo "$*" >> '${log}'; }
aws() { c "aws $*"; return ${opts.bucketOk === false ? 254 : 0}; }
fuser() { return 1; }
sleep() { :; }
apt-get() { c "apt-get $*"; }
git() {
  if [[ "$3" == rev-parse ]]; then echo '${opts.head ?? PINNED}'; return 0; fi
  c "git $*"
}
runuser() { c "runuser $*"; ${opts.toolOk === false ? 'return 1' : `echo '{"snapshot_id":"ethereum-mainnet-geth","version":26469585,"size_bytes":10,"duration_seconds":2,"method":"s3"}'`}; }
jq() { echo summary; }
install() { [[ "$1" == -d ]] && mkdir -p "\${@: -1}"; }
main '${out}'
`);
    }

    it('checks the bucket first, then installs, fetches the pinned commit and runs as bcuser', () => {
        const res = run();
        expect(res.stderr).toBe('');
        expect(res.status).toBe(0);
        const lines = calls();
        expect(lines[0]).toBe('aws s3api head-bucket --bucket blockchain-snapshots-us-east-1 --region us-east-1');
        expect(lines[1]).toMatch(/^apt-get -yqq install git python3-boto3 python3-zstandard zstd tar curl$/);
        expect(lines).toContain(`git -C ${tmp}/tool fetch -q --depth 1 https://github.com/awslabs/blockchain-snapshots.git ${PINNED}`);
        const runLine = lines.find(l => l.startsWith('runuser'))!;
        expect(runLine).toContain('runuser -u bcuser -- env -i HOME=/home/bcuser');
        expect(runLine).toContain(
            `${tmp}/tool/dist/snapshot.sh --snapshot ethereum-mainnet-geth --region us-east-1 ` +
            `--registry ${tmp}/tool/dist/regions.json --source s3 --out ${out} --json`);
        expect(runLine).not.toContain('--force');
        expect(fs.readFileSync(`${out}.snapshot-restored`, 'utf-8')).toContain('"version":26469585');
        expect(fs.existsSync(`${out}.snapshot-in-progress`)).toBe(false);
    });

    it('stops before installing anything when the bucket is unreachable', () => {
        const res = run({ bucketOk: false });
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/cannot reach s3:\/\/blockchain-snapshots-us-east-1.*S3 gateway VPC endpoint/);
        expect(calls()).toHaveLength(1);
        expect(fs.existsSync(`${out}.snapshot-in-progress`)).toBe(false);
    });

    it('refuses a checkout that is not the pinned commit', () => {
        const res = run({ head: 'f'.repeat(40) });
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/is not the pinned/);
        expect(calls().some(l => l.startsWith('runuser'))).toBe(false);
    });

    it('keeps the in-progress marker when the tool fails, and the retry deletes the partial output first', () => {
        expect(run({ toolOk: false }).status).toBe(1);
        expect(fs.existsSync(`${out}.snapshot-in-progress`)).toBe(true);
        expect(fs.existsSync(`${out}.snapshot-restored`)).toBe(false);

        fs.writeFileSync(path.join(out, 'partial'), '');
        expect(run().status).toBe(0);
        expect(fs.existsSync(path.join(out, 'partial'))).toBe(false);
        expect(fs.readdirSync(out)).toEqual([]);
        expect(calls().filter(l => l.startsWith('runuser')).pop()).toMatch(/ --json$/);
        expect(fs.existsSync(`${out}.snapshot-restored`)).toBe(true);
    });

    it('does nothing once the snapshot is restored', () => {
        fs.writeFileSync(`${out}.snapshot-restored`, '{}');
        const res = run();
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('already restored');
        expect(calls()).toEqual([]);
    });

    it('never overwrites data it did not restore', () => {
        fs.writeFileSync(path.join(out, 'chaindata'), '');
        const res = run();
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('not restoring');
        expect(calls()).toEqual([]);
    });

    it('fails when SNAPSHOT_ID is missing', () => {
        fs.writeFileSync(path.join(tmp, 'cdk_environment'), "AWS_REGION='us-east-1'\n");
        const res = run();
        expect(res.status).toBe(1);
        expect(res.stderr).toContain('SNAPSHOT_ID and AWS_REGION must be set');
    });
});

/**
 * remove_mismatched_incremental in blueprints/solana/user-data/node.sh, run
 * against real zstd tar archives. On 2026-11-23 a mainnet-beta restore
 * downloaded an incremental archive whose S3 object had been replaced after
 * the catalog was read: named slot 472999060, bank 473016168. Agave and
 * Frankendancer both refused to start with "snapshot slot mismatch".
 */
const SOLANA_NODE_SH = path.join(__dirname, '../../../blueprints/solana/user-data/node.sh');
const HAS_ZSTD = runBashIfAvailable('command -v zstd && command -v tar');

function runBashIfAvailable(cmd: string): boolean {
    try {
        return runBash(cmd).status === 0;
    } catch {
        return false;
    }
}

(HAS_ZSTD ? describeWithBash : describe.skip)('solana node.sh remove_mismatched_incremental', () => {
    let ledger: string;
    const fn = fs.readFileSync(SOLANA_NODE_SH, 'utf-8')
        .match(/^remove_mismatched_incremental\(\) \{[\s\S]*?^\}$/m)![0];

    beforeEach(() => {
        ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
    });
    afterEach(() => fs.rmSync(ledger, { recursive: true, force: true }));

    function archive(name: string, bankSlot: number) {
        const src = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-'));
        fs.mkdirSync(path.join(src, `snapshots/${bankSlot}`), { recursive: true });
        fs.writeFileSync(path.join(src, `snapshots/${bankSlot}/${bankSlot}`), 'bank');
        fs.writeFileSync(path.join(src, 'version'), '1.2.0');
        const res = runBash(`cd '${src}' && tar -cf - version snapshots | zstd -q -o '${ledger}/${name}'`);
        expect(res.status).toBe(0);
        fs.rmSync(src, { recursive: true, force: true });
    }

    function run() {
        return runBash(`LEDGER='${ledger}'\n${fn}\nremove_mismatched_incremental`);
    }

    it('keeps an incremental archive whose bank matches its name', () => {
        const name = 'incremental-snapshot-472986528-472999060-Dx.tar.zst';
        archive(name, 472999060);
        expect(run().status).toBe(0);
        expect(fs.readdirSync(ledger)).toEqual([name]);
    });

    it('removes an incremental archive that holds a newer bank than its name says', () => {
        archive('incremental-snapshot-472986528-472999060-Dx.tar.zst', 473016168);
        const res = run();
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('holds bank 473016168, not slot 472999060');
        expect(fs.readdirSync(ledger)).toEqual([]);
    });
});
