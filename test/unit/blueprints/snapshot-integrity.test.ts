// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * Security guard tests for snapshot download integrity.
 *
 * Snapshots are downloaded and extracted as root at boot, so the download
 * helpers must (a) only accept HTTPS sources and (b) verify integrity where the
 * provider publishes a checksum. These tests lock in that behavior at the
 * script level (there is no bash test harness in this repo).
 */
describe('Snapshot download integrity guards', () => {
    const bnbHelper = path.join(__dirname, '../../../blueprints/bnb/user-data/common/download-snapshot.sh');
    const baseHelper = path.join(__dirname, '../../../blueprints/base/user-data/common/download-snapshot.sh');

    describe('BNB (48Club) helper', () => {
        const script = fs.readFileSync(bnbHelper, 'utf8');

        it('extracts the published md5 from 48Club data.json', () => {
            expect(script).toMatch(/\.md5 \/\/ empty/);
        });

        it('verifies the downloaded archive md5 before extraction', () => {
            expect(script).toMatch(/md5sum "\$STAGING_DOWNLOAD_PATH\/snapshot\.tar\.zst"/);
            expect(script).toMatch(/md5 mismatch/);
        });

        it('fails closed (removes archive and exits) on md5 mismatch', () => {
            // The mismatch branch must rm the archive and exit before extraction.
            const mismatchBlock = script.slice(script.indexOf('md5 mismatch'));
            expect(mismatchBlock).toMatch(/rm -f "\$STAGING_DOWNLOAD_PATH\/snapshot\.tar\.zst"/);
            expect(mismatchBlock).toMatch(/exit 1/);
        });

        it('enforces HTTPS on the resolved snapshot URL', () => {
            expect(script).toMatch(/https:\/\/\*\) ;;/);
            expect(script).toMatch(/refusing non-HTTPS snapshot URL/);
        });
    });

    describe('Base helper', () => {
        const script = fs.readFileSync(baseHelper, 'utf8');

        it('enforces HTTPS on SNAPSHOT_DOWNLOAD_URL', () => {
            expect(script).toMatch(/https:\/\/\*\) ;;/);
            expect(script).toMatch(/refusing non-HTTPS SNAPSHOT_DOWNLOAD_URL/);
        });
    });
});
