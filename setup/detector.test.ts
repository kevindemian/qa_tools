import { detectFramework, extractRepoFromGit } from './detector.js';
import fs from 'fs';

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
    default: { readFileSync: mockReadFileSync, existsSync: vi.fn() },
    readFileSync: mockReadFileSync,
    existsSync: vi.fn(),
}));

const mockFsReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('detectFramework', () => {
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

describe('extractRepoFromGit', () => {
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
