import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = vi.hoisted(() => {
    const mkdtempSync = vi.fn<(typeof import('fs'))['mkdtempSync']>();
    const existsSync = vi.fn<(typeof import('fs'))['existsSync']>();
    const rmSync = vi.fn<(typeof import('fs'))['rmSync']>();
    const mkdirSync = vi.fn<(typeof import('fs'))['mkdirSync']>();
    const writeFileSync = vi.fn<(typeof import('fs'))['writeFileSync']>();
    const readFileSync = vi.fn<(typeof import('fs'))['readFileSync']>();
    return { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync, readFileSync };
});

vi.mock('node:fs', () => ({
    default: {
        mkdtempSync: mockFs.mkdtempSync,
        existsSync: mockFs.existsSync,
        rmSync: mockFs.rmSync,
        mkdirSync: mockFs.mkdirSync,
        writeFileSync: mockFs.writeFileSync,
        readFileSync: mockFs.readFileSync,
    },
    mkdtempSync: mockFs.mkdtempSync,
    existsSync: mockFs.existsSync,
    rmSync: mockFs.rmSync,
    mkdirSync: mockFs.mkdirSync,
    writeFileSync: mockFs.writeFileSync,
    readFileSync: mockFs.readFileSync,
}));

import {
    cleanupTestDir,
    createTestDir,
    createFile,
    readFile,
    readJsonFile,
    fileExists,
    createMetricsRunFixture,
    createCoverageSnapshotFixture,
    createFailureClassificationFixture,
    createFeaturesJsonFixture,
    createFlatTestArrayFixture,
} from './integration-helpers.js';

/* ────────── Fixture factory tests (should pass now) ────────── */

describe('Fixture factories', () => {
    it('createMetricsRunFixture returns correct shape', () => {
        const result = createMetricsRunFixture();

        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('project');
        expect(result).toHaveProperty('total', 100);
        expect(result).toHaveProperty('passed', 90);
        expect(result).toHaveProperty('failed', 8);
        expect(result).toHaveProperty('skipped', 2);
        expect(result).toHaveProperty('duration', 15000);
        expect(result.tests).toHaveLength(3);
    });

    it('createMetricsRunFixture test states are correct', () => {
        const result = createMetricsRunFixture();

        expect(result.tests[0]).toHaveProperty('state', 'passed');
        expect(result.tests[1]).toHaveProperty('state', 'failed');
        expect(result.tests[2]).toHaveProperty('state', 'skipped');
    });

    it('createMetricsRunFixture merges overrides', () => {
        const result = createMetricsRunFixture({ total: 200, project: 'custom' });

        expect(result.total).toBe(200);
        expect(result.project).toBe('custom');
        expect(result.passed).toBe(90);
    });

    it('createCoverageSnapshotFixture returns correct shape', () => {
        const result = createCoverageSnapshotFixture();

        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('project', 'test-project');
        expect(result).toHaveProperty('totalIssues', 500);
        expect(result).toHaveProperty('mappedIssues', 450);
        expect(result).toHaveProperty('coveragePct', 90);
    });

    it('createCoverageSnapshotFixture merges overrides', () => {
        const result = createCoverageSnapshotFixture({ totalIssues: 1000 });

        expect(result.totalIssues).toBe(1000);
        expect(result.mappedIssues).toBe(450);
    });

    it('createFailureClassificationFixture returns correct shape', () => {
        const result = createFailureClassificationFixture();

        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('testTitle', 'test should work');
        expect(result).toHaveProperty('category', 'ASSERTION');
        expect(result).toHaveProperty('project', 'test-project');
    });

    it('createFeaturesJsonFixture returns correct shape', () => {
        const result = createFeaturesJsonFixture();
        const testProject = result['test-project'];
        const gitlabProject = result['gitlab-project'];

        expect(testProject).toBeDefined();
        expect(testProject?.gitProvider).toBe('github');
        expect(gitlabProject).toBeDefined();
        expect(gitlabProject?.gitProvider).toBe('gitlab');
    });

    it('createFlatTestArrayFixture returns correct shape', () => {
        const result = createFlatTestArrayFixture();

        expect(result).toHaveLength(5);
        expect(result[0]).toHaveProperty('state', 'passed');
        expect(result[3]).toHaveProperty('state', 'failed');
        expect(result[3]).toHaveProperty('error');
        expect(result[4]).toHaveProperty('state', 'skipped');
    });
});

/* ────────── I/O helper tests (RED — will fail with current code) ────────── */

describe('CleanupTestDir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('warn on rmSync error (not silently swallow)', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.existsSync.mockReturnValue(true);
        mockFs.rmSync.mockImplementation(() => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        });

        cleanupTestDir('/tmp/test');

        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('g3: should warn with actionable message on rmSync error', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.existsSync.mockReturnValue(true);
        mockFs.rmSync.mockImplementation(() => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        });

        cleanupTestDir('/tmp/test');

        const message = String(warnSpy.mock.calls[0]?.[0]);

        expect(message).toContain('cleanupTestDir');
        expect(message).toMatch(/verifique|verificar|tente|tentar|ação|permissão|disco|execute/);

        warnSpy.mockRestore();
    });

    it('silently continue on ENOENT', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.existsSync.mockReturnValue(true);
        mockFs.rmSync.mockImplementation(() => {
            throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        });

        cleanupTestDir('/tmp/test');

        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});

describe('CreateTestDir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('g2: should throw descriptive error on mkdtempSync failure', () => {
        const fsError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
        mockFs.mkdtempSync.mockImplementation(() => {
            throw fsError;
        });

        expect(() => createTestDir('test-prefix')).toThrow('createTestDir');
    });
});

describe('CreateFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('g3: should throw descriptive error on writeFileSync failure', () => {
        mockFs.mkdirSync.mockReturnValue(undefined);
        const fsError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
        mockFs.writeFileSync.mockImplementation(() => {
            throw fsError;
        });

        expect(() => createFile('/tmp/base', 'sub/file.txt', 'content')).toThrow('createFile');
    });
});

describe('ReadFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('return null on ENOENT (not log)', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.readFileSync.mockImplementation(() => {
            throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        });

        const result = readFile('/tmp/base', 'missing.txt');

        expect(result).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('g4: should warn on non-ENOENT error then return null', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.readFileSync.mockImplementation(() => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        });

        const result = readFile('/tmp/base', 'noaccess.txt');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });
});

describe('ReadJsonFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('return null on ENOENT (not log)', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.readFileSync.mockImplementation(() => {
            throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        });

        const result = readJsonFile('/tmp/base', 'missing.json');

        expect(result).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('g5/G12: should return null on invalid JSON (not crash)', () => {
        mockFs.readFileSync.mockReturnValue('{ invalid json }');

        const result = readJsonFile('/tmp/base', 'bad.json');

        expect(result).toBeNull();
    });

    it('g6: should warn on non-ENOENT error then return null', () => {
        const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockFs.readFileSync.mockImplementation(() => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        });

        const result = readJsonFile('/tmp/base', 'noaccess.json');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });
});

describe('FileExists', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('return true when existsSync returns true', () => {
        mockFs.existsSync.mockReturnValue(true);

        expect(fileExists('/tmp', 'file.txt')).toBeTruthy();
    });

    it('return false when existsSync returns false', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(fileExists('/tmp', 'missing.txt')).toBeFalsy();
    });

    it('g2: should return false on existsSync error (not crash)', () => {
        mockFs.existsSync.mockImplementation(() => {
            throw new Error('permission denied');
        });
        const result = fileExists('/tmp', 'restricted.txt');

        expect(result).toBeFalsy();
    });
});
