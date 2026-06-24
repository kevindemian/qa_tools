import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../shared/logger', () => ({
    rootLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), writeFileOnly: vi.fn() },
}));

import PackageVersionManager from './package_version_manager.js';

describe('PackageVersionManager', () => {
    let tmpDir: string;
    let pkg: InstanceType<typeof PackageVersionManager>;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvm-'));
        pkg = new PackageVersionManager(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writePackage(version = '1.0.0') {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version }));
    }

    function writeReleaseNotes() {
        const dir = path.join(tmpDir, 'release_notes');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'ReleaseNotes.txt'), 'Header\n----\nOld content');
    }

    describe('UpdateVersion', () => {
        it('updates version in package.json', () => {
            writePackage('1.0.0');
            pkg.updateVersion('2.0.0');
            const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as { version: string };

            expect(json.version).toBe('2.0.0');
        });

        it('handles missing package.json', () => {
            expect(pkg.updateVersion('2.0.0')).toBeUndefined();
        });

        it('calls extraUpdate callback when provided to _updateJsonFile', () => {
            writePackage('1.0.0');
            const extraUpdate = vi.fn();
            pkg._updateJsonFile(path.join(tmpDir, 'package.json'), '3.0.0', extraUpdate);

            expect(extraUpdate).toHaveBeenCalledTimes(1);

            const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as { version: string };

            expect(json.version).toBe('3.0.0');
        });
    });

    describe('UpdateReleaseNotes', () => {
        it('prepends new release notes', () => {
            writeReleaseNotes();
            pkg.updateReleaseNotes('v2.0', ['TASK-1 Fix bug', 'TASK-2 Add feature']);
            const content = fs.readFileSync(path.join(tmpDir, 'release_notes', 'ReleaseNotes.txt'), 'utf8');

            expect(content).toContain('Release v2.0');
            expect(content).toContain('TASK-1 Fix bug');
            expect(content).toContain('Old content');
        });

        it('handles missing release notes file', () => {
            expect(pkg.updateReleaseNotes('v2.0', ['task'])).toBeUndefined();
        });

        it('handles non-array tasks', () => {
            writeReleaseNotes();

            expect(pkg.updateReleaseNotes('v2.0', 'task')).toBeUndefined();
        });

        it('logs error when writeFileSync fails in release notes update', () => {
            writeReleaseNotes();
            const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
                throw new Error('Write error');
            });
            pkg.updateReleaseNotes('v2.0', ['TASK-1']);

            expect(spy).toHaveBeenCalled();

            spy.mockRestore();
        });
    });
});
