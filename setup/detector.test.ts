import { detectFramework, extractRepoFromGit } from './detector';

jest.mock('fs');

describe('detectFramework', () => {
    it('detects cypress from devDependencies', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { cypress: '^13.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');
        expect(result.framework).toBe('cypress');
        expect(result.testCmd).toContain('cypress');
    });

    it('detects playwright from dependencies', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                dependencies: { '@playwright/test': '^1.40' },
            }),
        );
        const result = detectFramework('/fake/package.json');
        expect(result.framework).toBe('playwright');
    });

    it('detects jest', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { jest: '^29.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');
        expect(result.framework).toBe('jest');
    });

    it('detects vitest', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { vitest: '^1.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');
        expect(result.framework).toBe('vitest');
    });

    it('falls back to generic when no framework found', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({
                devDependencies: { eslint: '^8.0' },
            }),
        );
        const result = detectFramework('/fake/package.json');
        expect(result.framework).toBe('generic');
    });

    it('falls back to generic when file read fails', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        const result = detectFramework('/nonexistent/package.json');
        expect(result.framework).toBe('generic');
    });
});

describe('extractRepoFromGit', () => {
    it('extracts GitHub owner and repo from git config', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(`[remote "origin"]
\turl = git@github.com:myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);
        const result = extractRepoFromGit();
        expect(result.owner).toBe('myorg');
        expect(result.repo).toBe('my-repo');
    });

    it('extracts GitLab owner and repo', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockReturnValueOnce(`[remote "origin"]
\turl = https://gitlab.com/myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);
        const result = extractRepoFromGit();
        expect(result.owner).toBe('myorg');
        expect(result.repo).toBe('my-repo');
    });

    it('returns empty when not a git repo', () => {
        const fs = jest.mocked(jest.requireMock<typeof import('fs')>('fs'));
        fs.readFileSync.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        const result = extractRepoFromGit();
        expect(result.owner).toBe('');
        expect(result.repo).toBe('');
    });
});
