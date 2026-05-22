// @ts-nocheck
const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), writeFileOnly: jest.fn() },
}));

const PackageVersionManager = require('./package_version_manager');

describe('PackageVersionManager', () => {
    let tmpDir;
    let pkg;

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

    describe('updateVersion', () => {
        it('updates version in package.json', () => {
            writePackage('1.0.0');
            pkg.updateVersion('2.0.0');
            const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
            expect(json.version).toBe('2.0.0');
        });

        it('handles missing package.json', () => {
            expect(() => pkg.updateVersion('2.0.0')).not.toThrow();
        });
    });

    describe('updateReleaseNotes', () => {
        it('prepends new release notes', () => {
            writeReleaseNotes();
            pkg.updateReleaseNotes('v2.0', ['TASK-1 Fix bug', 'TASK-2 Add feature']);
            const content = fs.readFileSync(path.join(tmpDir, 'release_notes', 'ReleaseNotes.txt'), 'utf8');
            expect(content).toContain('Release v2.0');
            expect(content).toContain('TASK-1 Fix bug');
            expect(content).toContain('Old content');
        });

        it('handles missing release notes file', () => {
            expect(() => pkg.updateReleaseNotes('v2.0', ['task'])).not.toThrow();
        });

        it('handles non-array tasks', () => {
            writeReleaseNotes();
            expect(() => pkg.updateReleaseNotes('v2.0', 'task')).not.toThrow();
        });
    });
});
