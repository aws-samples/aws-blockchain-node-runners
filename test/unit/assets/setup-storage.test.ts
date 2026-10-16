// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeWithBash, runBash } from './shell-test-helpers';

/**
 * Behaviour tests for assets/common/setup-storage.sh.
 *
 * Setup now re-runs on configuration changes (issue #340), so storage setup
 * must never reformat a device that already holds data. The script is sourced
 * (its main() is guarded) and every command that touches real devices
 * (blkid, mkfs, mount, mdadm, lsblk, chown, tee to /etc/fstab) is replaced by
 * a bash function stub that records its calls.
 */
const SCRIPT = path.join(__dirname, '../../../assets/common/setup-storage.sh');

describeWithBash('setup-storage.sh (non-destructive re-runs)', () => {
    let tmp: string;
    let callLog: string;
    let fstabLog: string;
    let mountPath: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-storage-'));
        callLog = path.join(tmp, 'calls.log');
        fstabLog = path.join(tmp, 'fstab.log');
        mountPath = path.join(tmp, 'mnt-data');
        fs.writeFileSync(callLog, '');
        fs.writeFileSync(fstabLog, '');
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    /**
     * Build a bash program that sources the script, installs stubs, then runs
     * `body`. `signatures` maps device -> blkid TYPE (absent = blank device).
     */
    function program(body: string, opts: {
        signatures?: Record<string, string>;
        mounted?: string[];
        mountAMounts?: string[];
        emptyDisks?: string;
    } = {}): string {
        const sigs = Object.entries(opts.signatures ?? {})
            .map(([dev, type]) => `[${dev}]=${type}`).join(' ');
        return `
set +u
source '${SCRIPT}'
set +e
CALLS='${callLog}'
declare -A SIG=( ${sigs} )
MOUNTED=" ${(opts.mounted ?? []).join(' ')} "
MOUNT_A_MOUNTS="${(opts.mountAMounts ?? []).join(' ')}"
blkid() { local dev="\${@: -1}"; if [[ -n "\${SIG[$dev]:-}" ]]; then echo "\${SIG[$dev]}"; else return 2; fi; }
mkfs() { echo "mkfs $*" >> "$CALLS"; }
mkfs.xfs() { echo "mkfs.xfs $*" >> "$CALLS"; }
mountpoint() { local mp="\${@: -1}"; [[ "$MOUNTED" == *" $mp "* ]]; }
mount() {
  echo "mount $*" >> "$CALLS"
  if [[ "$*" == "-a" && -n "$MOUNT_A_MOUNTS" ]]; then MOUNTED="$MOUNTED$MOUNT_A_MOUNTS "; fi
}
lsblk() {
  case "$*" in
    "-lnb") echo "nvme1n1 259:1 0 107374182400 0 disk " ;;
    "-fn -o UUID"*) echo "uuid-1234" ;;
    *) : ;;
  esac
}
chown() { echo "chown $*" >> "$CALLS"; }
sleep() { :; }
tee() { cat >> '${fstabLog}'; }
mdadm() {
  echo "mdadm $*" >> "$CALLS"
  if [[ "$*" == "--detail --scan" ]]; then echo "ARRAY /dev/md0 metadata=1.2 UUID=aaaa:bbbb"; fi
}
sgdisk() { echo "sgdisk $*" >> "$CALLS"; }
get_all_empty_nvme_disks() { echo "${opts.emptyDisks ?? 'nvme1n1 nvme2n1'}"; }
export MDADM_CONF='${path.join(tmp, 'mdadm.conf')}'
${body}
`;
    }

    const calls = () => fs.readFileSync(callLog, 'utf-8');
    const fstab = () => fs.readFileSync(fstabLog, 'utf-8');
    const SIZE_100G = String(100 * 1024 * 1024 * 1024);

    describe('setup_volume (EBS)', () => {
        it('reuses an existing filesystem without formatting or recursive chown', () => {
            const res = runBash(program(`setup_volume '${mountPath}' ext4 ${SIZE_100G}`, {
                signatures: { '/dev/nvme1n1': 'ext4' },
            }));
            expect(res.status).toBe(0);
            expect(res.stdout).toContain('already has a \'ext4\' filesystem, reusing it (no format)');
            expect(calls()).not.toMatch(/^mkfs/m);
            expect(calls()).not.toMatch(/^chown -R/m);
            expect(calls()).toMatch(/^mount -a$/m);
            expect(fstab()).toContain(`UUID=uuid-1234 ${mountPath} ext4 defaults,nofail 0 2`);
        });

        it('formats and chowns a blank volume (first boot behaviour unchanged)', () => {
            const res = runBash(program(`setup_volume '${mountPath}' ext4 ${SIZE_100G}`));
            expect(res.status).toBe(0);
            expect(calls()).toMatch(/^mkfs -t ext4 \/dev\/nvme1n1$/m);
            expect(calls()).toMatch(new RegExp(`^chown -R bcuser:bcuser ${mountPath}$`, 'm'));
        });

        it('mounts with the detected type when it differs from the configured one', () => {
            const res = runBash(program(`setup_volume '${mountPath}' ext4 ${SIZE_100G}`, {
                signatures: { '/dev/nvme1n1': 'xfs' },
            }));
            expect(res.status).toBe(0);
            expect(res.stdout).toContain('WARNING');
            expect(calls()).not.toMatch(/^mkfs/m);
            expect(fstab()).toContain(`${mountPath} xfs noatime,nodiratime,nodiscard,nofail 0 2`);
        });

        it('does nothing when the mount path is already mounted', () => {
            const res = runBash(program(`setup_volume '${mountPath}' ext4 ${SIZE_100G}`, {
                mounted: [mountPath],
            }));
            expect(res.status).toBe(0);
            expect(res.stdout).toContain('already mounted, nothing changed');
            expect(calls()).toBe('');
        });
    });

    describe('make_fs', () => {
        it('refuses to format a device that already has a signature', () => {
            const res = runBash(program('make_fs ext4 /dev/nvme1n1', { signatures: { '/dev/nvme1n1': 'ext4' } }));
            expect(res.status).not.toBe(0);
            expect(res.stdout).toContain('Refusing to format /dev/nvme1n1');
            expect(calls()).not.toMatch(/^mkfs/m);
        });
    });

    describe('setup_single_raid (instance store)', () => {
        it('skips RAID creation when the mount path is already mounted', () => {
            const res = runBash(program(`setup_single_raid '${mountPath}' ext4`, { mounted: [mountPath] }));
            expect(res.status).toBe(0);
            expect(calls()).not.toMatch(/mdadm --create/);
            expect(calls()).not.toMatch(/^mkfs/m);
        });

        it('re-assembles an existing array instead of creating a new one', () => {
            const res = runBash(program(`setup_single_raid '${mountPath}' ext4`, { mountAMounts: [mountPath] }));
            expect(res.status).toBe(0);
            expect(calls()).toMatch(/^mdadm --assemble --scan$/m);
            expect(calls()).not.toMatch(/mdadm --create/);
            expect(calls()).not.toMatch(/^mkfs/m);
        });

        it('never includes a disk that already has a signature in a new array', () => {
            const res = runBash(program(`setup_single_raid '${mountPath}' ext4`, {
                signatures: { '/dev/nvme2n1': 'ext4' },
            }));
            expect(res.status).toBe(0);
            expect(calls()).toMatch(/^mdadm --create \/dev\/md0 --level=0 --raid-devices=1 \/dev\/nvme1n1 --force --run$/m);
            expect(calls()).not.toMatch(/nvme2n1/);
        });

        it('fails instead of building an array when no blank disk is left', () => {
            const res = runBash(program(`setup_single_raid '${mountPath}' ext4`, {
                signatures: { '/dev/nvme1n1': 'linux_raid_member', '/dev/nvme2n1': 'ext4' },
            }));
            expect(res.status).not.toBe(0);
            expect(calls()).not.toMatch(/mdadm --create/);
        });

        it('writes each ARRAY line to mdadm.conf only once across re-runs', () => {
            const res = runBash(program('save_mdadm_conf; save_mdadm_conf; save_mdadm_conf'));
            expect(res.status).toBe(0);
            const conf = fs.readFileSync(path.join(tmp, 'mdadm.conf'), 'utf-8');
            expect(conf.match(/^ARRAY /gm)).toHaveLength(1);
        });
    });

    describe('setup_dual_raid (instance store)', () => {
        it('skips RAID creation when both mount paths are already mounted', () => {
            const second = path.join(tmp, 'mnt-accounts');
            const res = runBash(program(`setup_dual_raid '${mountPath}' ext4 500 '${second}' ext4 300`, {
                mounted: [mountPath, second],
            }));
            expect(res.status).toBe(0);
            expect(calls()).not.toMatch(/mdadm --create|sgdisk/);
        });
    });
});
