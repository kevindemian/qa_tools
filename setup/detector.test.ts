import { detectFramework, detectConfigCtrf, extractRepoFromGit } from './detector.js';
import fs from 'fs';

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
    default: { readFileSync: mockReadFileSync, existsSync: mockExistsSync },
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
}));

const mockFsReadFileSync = vi.spyOn(fs, 'readFileSync');
const mockFsExistsSync = vi.spyOn(fs, 'existsSync');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('DetectFramework', () => {
    it('detects cypress from devDependencies', () => {
        mockFsReadFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { cypress: '^13.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');

        expect(result.framework).toBe('cypress');
        expect(result.testCmd).toContain('cypress');
    });

    it('detects playwright from dependencies', () => {
        mockFsReadFileSync.mockReturnValueOnce(
            JSON.stringify({
                dependencies: { '@playwright/test': '^1.40' },
            }),
        );
        const result = detectFramework('/fake/package.json');

        expect(result.framework).toBe('playwright');
    });

    it('detects jest', () => {
        mockFsReadFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { jest: '^29.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');

        expect(result.framework).toBe('jest');
    });

    it('detects vitest', () => {
        mockFsReadFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { vitest: '^1.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');

        expect(result.framework).toBe('vitest');
    });

    it('falls back to generic when no framework found', () => {
        mockFsReadFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { eslint: '^8.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');

        expect(result.framework).toBe('generic');
    });

    it('falls back to generic when file read fails', () => {
        mockFsReadFileSync.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        const result = detectFramework('/nonexistent/package.json');

        expect(result.framework).toBe('generic');
    });
});

describe('DetectConfigCtrf', () => {
    function mockPathEndsWith(suffix: string): (p: fs.PathLike) => boolean {
        return (p: fs.PathLike) => String(p).endsWith(suffix);
    }

    function mockReadFileWith(suffix: string, content: string): (p: fs.PathOrFileDescriptor) => string {
        return (p: fs.PathOrFileDescriptor) => {
            if (String(p).endsWith(suffix)) return content;
            return '';
        };
    }

    it('returns true when vitest.config.ts contains VitestCtrfReporter', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith(
                'vitest.config.ts',
                `import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';
reporters: ['default', new VitestCtrfReporter()]`,
            ),
        );

        expect(detectConfigCtrf('/fake/project')).toBeTruthy();
    });

    it('returns true when vite.config.ts contains ctrf reporter import', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vite.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith(
                'vite.config.ts',
                `import { defineConfig } from 'vite';
import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';`,
            ),
        );

        expect(detectConfigCtrf('/fake/project')).toBeTruthy();
    });

    it('returns true for @d2t/vitest-ctrf-json-reporter in config', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith('vitest.config.ts', `reporters: [['@d2t/vitest-ctrf-json-reporter', {}]]`),
        );

        expect(detectConfigCtrf('/fake/project')).toBeTruthy();
    });

    it('returns true for vitest-ctrf-json-reporter in config', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith('vitest.config.ts', `reporters: ['vitest-ctrf-json-reporter']`),
        );

        expect(detectConfigCtrf('/fake/project')).toBeTruthy();
    });

    it('returns false when no config file exists', () => {
        mockFsExistsSync.mockReturnValue(false);

        expect(detectConfigCtrf('/fake/project')).toBeFalsy();
    });

    it('returns false when config file exists but no CTRF reporter', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith('vitest.config.ts', `export default defineConfig({ test: { reporters: ['default'] } })`),
        );

        expect(detectConfigCtrf('/fake/project')).toBeFalsy();
    });

    it('returns false when config file read fails', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        expect(detectConfigCtrf('/fake/project')).toBeFalsy();
    });

    it('returns true for ctrf-json-reporter in config', () => {
        mockFsExistsSync.mockImplementation(mockPathEndsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation(
            mockReadFileWith('vitest.config.ts', `reporters: ['ctrf-json-reporter']`),
        );

        expect(detectConfigCtrf('/fake/project')).toBeTruthy();
    });
});

describe('DetectFrameworkCtrf', () => {
    it('returns ctrfSource=cli-flag for cypress', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { cypress: '^13.0' } }));
        const result = detectFramework('/fake/package.json');

        expect(result.ctrfSource).toBe('cli-flag');
    });

    it('returns ctrfSource=cli-flag for playwright', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { '@playwright/test': '^1.40' } }));
        const result = detectFramework('/fake/package.json');

        expect(result.ctrfSource).toBe('cli-flag');
    });

    it('returns ctrfSource=cli-flag for jest', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { jest: '^29.0' } }));
        const result = detectFramework('/fake/package.json');

        expect(result.ctrfSource).toBe('cli-flag');
    });

    it('returns ctrfSource=config-file for vitest when CTRF found in config', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { vitest: '^1.0' } }));
        mockFsExistsSync.mockImplementation((p: fs.PathLike) => String(p).endsWith('vitest.config.ts'));
        mockFsReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
            if (String(p).endsWith('vitest.config.ts')) {
                return `import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';`;
            }
            return '';
        });
        const result = detectFramework('/fake/package.json');

        expect(result.ctrfSource).toBe('config-file');
    });

    it('returns ctrfSource=missing for vitest when no CTRF in config', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { vitest: '^1.0' } }));
        mockFsExistsSync.mockReturnValue(false);
        const result = detectFramework('/fake/package.json');

        expect(result.ctrfSource).toBe('missing');
    });

    it('vitest testCmd does not include --reporter ctrf', () => {
        mockFsReadFileSync.mockReturnValueOnce(JSON.stringify({ devDependencies: { vitest: '^1.0' } }));
        mockFsExistsSync.mockReturnValue(false);
        const result = detectFramework('/fake/package.json');

        expect(result.testCmd).not.toContain('--reporter ctrf');
        expect(result.testCmd).toBe('npx vitest run');
    });
});

describe('ExtractRepoFromGit', () => {
    it('extracts GitHub owner and repo from git config', () => {
        mockFsReadFileSync.mockReturnValueOnce(`[remote "origin"]
\turl = git@github.com:myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);
        const result = extractRepoFromGit();

        expect(result.owner).toBe('myorg');
        expect(result.repo).toBe('my-repo');
    });

    it('extracts GitLab owner and repo', () => {
        mockFsReadFileSync.mockReturnValueOnce(`[remote "origin"]
\turl = https://gitlab.com/myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);
        const result = extractRepoFromGit();

        expect(result.owner).toBe('myorg');
        expect(result.repo).toBe('my-repo');
    });

    it('returns empty when not a git repo', () => {
        mockFsReadFileSync.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        const result = extractRepoFromGit();

        expect(result.owner).toBe('');
        expect(result.repo).toBe('');
    });
});
