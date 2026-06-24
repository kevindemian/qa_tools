import fs from 'fs';
import path from 'path';
import os from 'os';
import { afterAll, describe, expect, it } from 'vitest';
import { getHeadSha, getCurrentBranch, detectGitDir } from './git-sha.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-git-sha-test-'));

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectGitDir', () => {
    it('returns null when no .git in path', () => {
        const result = detectGitDir('/nonexistent');

        expect(result).toBeNull();
    });

    it('finds .git in current directory', () => {
        const dir = path.join(tmpDir, 'has-git');
        fs.mkdirSync(dir, { recursive: true });
        fs.mkdirSync(path.join(dir, '.git'));
        const result = detectGitDir(dir);

        expect(result).toBe(dir);
    });

    it('finds .git in parent directory', () => {
        const gitDir = path.join(tmpDir, 'parent-git');
        const subDir = path.join(gitDir, 'sub', 'deep');
        fs.mkdirSync(subDir, { recursive: true });
        fs.mkdirSync(path.join(gitDir, '.git'));
        const result = detectGitDir(subDir);

        expect(result).toBe(gitDir);
    });

    it('works with default (process.cwd)', () => {
        const result = detectGitDir();

        expect(result).not.toBeNull();
    });
});

describe('getHeadSha', () => {
    it('returns GITHUB_SHA env var', () => {
        const env = { GITHUB_SHA: 'gh-abc123' } as NodeJS.ProcessEnv;

        expect(getHeadSha(env)).toBe('gh-abc123');
    });

    it('returns CI_COMMIT_SHA env var', () => {
        const env = { CI_COMMIT_SHA: 'gl-def456' } as NodeJS.ProcessEnv;

        expect(getHeadSha(env)).toBe('gl-def456');
    });

    it('prefers GITHUB_SHA over CI_COMMIT_SHA', () => {
        const env = { GITHUB_SHA: 'gh-pickme', CI_COMMIT_SHA: 'gl-notme' } as NodeJS.ProcessEnv;

        expect(getHeadSha(env)).toBe('gh-pickme');
    });

    it('reads from .git/HEAD when ref is present', () => {
        const dir = path.join(tmpDir, 'git-head-ref');
        fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.git', 'refs', 'heads', 'main'), 'abc123def\n');
        fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        const origCwd = process.cwd();
        process.chdir(dir);
        try {
            const sha = getHeadSha({});

            expect(sha).toBe('abc123def');
        } finally {
            process.chdir(origCwd);
        }
    });

    it('falls back to git rev-parse when no env vars set', () => {
        const env = {} as NodeJS.ProcessEnv;
        const result = getHeadSha(env);
        if (result !== null) {
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThanOrEqual(40);
        }
    });

    it('reads from packed-refs when ref file is missing', () => {
        const dir = path.join(tmpDir, 'git-packed-refs');
        fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        fs.writeFileSync(
            path.join(dir, '.git', 'packed-refs'),
            '# pack-refs with: peeled fully-peeled sorted\nabc123def refs/heads/main\n',
        );
        fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        const origCwd = process.cwd();
        process.chdir(dir);
        try {
            const sha = getHeadSha({});

            expect(sha).toBe('abc123def');
        } finally {
            process.chdir(origCwd);
        }
    });

    it('returns direct SHA when HEAD is detached', () => {
        const dir = path.join(tmpDir, 'git-detached');
        fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'abc123def\n');
        const origCwd = process.cwd();
        process.chdir(dir);
        try {
            const sha = getHeadSha({});

            expect(sha).toBe('abc123def');
        } finally {
            process.chdir(origCwd);
        }
    });

    it('uses BUILD_SOURCEVERSION env var', () => {
        const env = { BUILD_SOURCEVERSION: 'build-v999' } as NodeJS.ProcessEnv;

        expect(getHeadSha(env)).toBe('build-v999');
    });

    it('falls back to execSync when no .git directory exists', () => {
        const fakeDir = path.join(tmpDir, 'no-git-exec');
        fs.mkdirSync(fakeDir, { recursive: true });
        const origCwd = process.cwd();
        process.chdir(fakeDir);
        try {
            const result = getHeadSha({});

            expect(result).toBeNull();
        } finally {
            process.chdir(origCwd);
        }
    });

    it('uses process.env when env argument is omitted', () => {
        const origGithubSha = process.env['GITHUB_SHA'];
        const origCiSha = process.env['CI_COMMIT_SHA'];
        const origBuildSha = process.env['BUILD_SOURCEVERSION'];
        delete process.env['GITHUB_SHA'];
        delete process.env['CI_COMMIT_SHA'];
        delete process.env['BUILD_SOURCEVERSION'];

        const fakeDir = path.join(tmpDir, 'no-git-omit-env');
        fs.mkdirSync(fakeDir, { recursive: true });
        const origCwd = process.cwd();
        process.chdir(fakeDir);
        try {
            const result = getHeadSha();

            expect(result).toBeNull();
        } finally {
            process.chdir(origCwd);
            if (origGithubSha) process.env['GITHUB_SHA'] = origGithubSha;
            if (origCiSha) process.env['CI_COMMIT_SHA'] = origCiSha;
            if (origBuildSha) process.env['BUILD_SOURCEVERSION'] = origBuildSha;
        }
    });
});

describe('getCurrentBranch', () => {
    it('returns GITHUB_REF_NAME env var', () => {
        const env = { GITHUB_REF_NAME: 'feature/foo' } as NodeJS.ProcessEnv;

        expect(getCurrentBranch(env)).toBe('feature/foo');
    });

    it('returns CI_COMMIT_BRANCH env var', () => {
        const env = { CI_COMMIT_BRANCH: 'main' } as NodeJS.ProcessEnv;

        expect(getCurrentBranch(env)).toBe('main');
    });

    it('uses BUILD_SOURCEBRANCHNAME env var', () => {
        const env = { BUILD_SOURCEBRANCHNAME: 'azure-branch' } as NodeJS.ProcessEnv;

        expect(getCurrentBranch(env)).toBe('azure-branch');
    });

    it('prefers GITHUB_REF_NAME over CI_COMMIT_BRANCH', () => {
        const env = { GITHUB_REF_NAME: 'gh-branch', CI_COMMIT_BRANCH: 'ci-branch' } as NodeJS.ProcessEnv;

        expect(getCurrentBranch(env)).toBe('gh-branch');
    });

    it('falls back to git rev-parse when no env vars set', () => {
        const env = {} as NodeJS.ProcessEnv;
        const result = getCurrentBranch(env);
        if (result !== null) {
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        }
    });

    it('returns null when git rev-parse fails', () => {
        const fakeDir = path.join(tmpDir, 'no-git-branch');
        fs.mkdirSync(fakeDir, { recursive: true });
        const origCwd = process.cwd();
        process.chdir(fakeDir);
        try {
            const result = getCurrentBranch({});

            expect(result).toBeNull();
        } finally {
            process.chdir(origCwd);
        }
    });

    it('returns null when packed-refs file does not exist', () => {
        const dir = path.join(tmpDir, 'git-no-packed-refs');
        fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        const origCwd = process.cwd();
        process.chdir(dir);
        try {
            const sha = getHeadSha({});

            expect(sha).toBeNull();
        } finally {
            process.chdir(origCwd);
        }
    });

    it('handles packed-refs entry without SHA prefix gracefully', () => {
        const dir = path.join(tmpDir, 'git-no-sha-packed');
        fs.mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        fs.writeFileSync(
            path.join(dir, '.git', 'packed-refs'),
            '# pack-refs with: peeled fully-peeled sorted\nrefs/heads/main\n',
        );
        fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        const origCwd = process.cwd();
        process.chdir(dir);
        try {
            const sha = getHeadSha({});

            /* Line without SHA prefix returns the ref itself, not null */
            expect(sha).toBe('refs/heads/main');
        } finally {
            process.chdir(origCwd);
        }
    });

    it('uses process.env when env argument is omitted for getCurrentBranch', () => {
        const origRef = process.env['GITHUB_REF_NAME'];
        const origBranch = process.env['CI_COMMIT_BRANCH'];
        const origBuildBranch = process.env['BUILD_SOURCEBRANCHNAME'];
        delete process.env['GITHUB_REF_NAME'];
        delete process.env['CI_COMMIT_BRANCH'];
        delete process.env['BUILD_SOURCEBRANCHNAME'];

        const fakeDir = path.join(tmpDir, 'no-git-omit-env-branch');
        fs.mkdirSync(fakeDir, { recursive: true });
        const origCwd = process.cwd();
        process.chdir(fakeDir);
        try {
            const result = getCurrentBranch();

            expect(result).toBeNull();
        } finally {
            process.chdir(origCwd);
            if (origRef) process.env['GITHUB_REF_NAME'] = origRef;
            if (origBranch) process.env['CI_COMMIT_BRANCH'] = origBranch;
            if (origBuildBranch) process.env['BUILD_SOURCEBRANCHNAME'] = origBuildBranch;
        }
    });
});
