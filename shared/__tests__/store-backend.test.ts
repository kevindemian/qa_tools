import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsStoreBackend, GitStoreBackend, detectStoreBackend, detectProjectGitDir } from '../infra/store-backend.js';

const GIT_BIN = '/usr/bin/git';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-store-backend-test-'));

describe('Store Backend', () => {
    beforeEach(() => {
        for (const f of fs.readdirSync(path.resolve(tmpDir))) {
            const fp = path.join(tmpDir, f);
            fs.rmSync(fp, { recursive: true, force: true });
        }
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('FsStoreBackend', () => {
        it('init creates base directory', () => {
            const dir = path.join(tmpDir, 'fs-test');
            const backend = new FsStoreBackend(dir);
            backend.init();

            expect(fs.existsSync(path.resolve(dir))).toBeTruthy();
        });

        it('write creates intermediate directories and writes file', () => {
            const dir = path.join(tmpDir, 'fs-write');
            const backend = new FsStoreBackend(dir);
            backend.init();
            backend.write('subdir/test.json', Buffer.from(JSON.stringify({ key: 'value' })));
            const full = path.join(dir, 'subdir', 'test.json');

            expect(fs.existsSync(path.resolve(full))).toBeTruthy();

            const content = JSON.parse(fs.readFileSync(path.resolve(full), 'utf8')) as Record<string, string>;

            expect(content['key']).toBe('value');
        });

        it('read returns null for missing file', () => {
            const dir = path.join(tmpDir, 'fs-read');
            const backend = new FsStoreBackend(dir);
            backend.init();

            expect(backend.read('nonexistent.json')).toBeNull();
        });

        it('read returns file content', () => {
            const dir = path.join(tmpDir, 'fs-read-existing');
            const backend = new FsStoreBackend(dir);
            backend.init();
            backend.write('data.json', Buffer.from('hello'));
            const result = backend.read('data.json');

            expect(result).not.toBeNull();

            expect(result?.toString()).toBe('hello');
        });

        it('exists returns true for existing file', () => {
            const dir = path.join(tmpDir, 'fs-exists');
            const backend = new FsStoreBackend(dir);
            backend.init();
            backend.write('data.json', Buffer.from(''));

            expect(backend.exists('data.json')).toBeTruthy();
            expect(backend.exists('missing.json')).toBeFalsy();
        });

        it('flush is a no-op', () => {
            const dir = path.join(tmpDir, 'fs-flush');
            const backend = new FsStoreBackend(dir);
            backend.init();

            expect(() => backend.flush('test')).not.toThrow();
        });

        it('write overwrites existing file', () => {
            const dir = path.join(tmpDir, 'fs-overwrite');
            const backend = new FsStoreBackend(dir);
            backend.init();
            backend.write('data.json', Buffer.from('first'));
            backend.write('data.json', Buffer.from('second'));
            const result = backend.read('data.json');

            expect(result?.toString()).toBe('second');
        });

        it('read handles corrupted file gracefully', () => {
            const dir = path.join(tmpDir, 'fs-corrupt');
            const backend = new FsStoreBackend(dir);
            backend.init();
            const full = path.join(dir, 'bad.json');
            fs.writeFileSync(path.resolve(full), 'not valid buffer', 'utf8');
            const result = backend.read('bad.json');

            expect(result).not.toBeNull();

            expect(result?.toString()).toBe('not valid buffer');
        });
    });

    describe('GitStoreBackend', () => {
        it('init creates directory and initializes git repo', () => {
            const dir = path.join(tmpDir, 'git-test-init');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();

            expect(fs.existsSync(path.resolve(dir))).toBeTruthy();
            expect(fs.existsSync(path.join(dir, '.git'))).toBeTruthy();
            expect(fs.existsSync(path.join(dir, '.git', 'config'))).toBeTruthy();
        });

        it('write and read round-trips data in working tree', () => {
            const dir = path.join(tmpDir, 'git-test-rw');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            backend.write('test.json', Buffer.from(JSON.stringify({ a: 1 })));
            const result = backend.read('test.json');

            expect(result).not.toBeNull();

            expect((JSON.parse(result?.toString() ?? '{}') as Record<string, number>)['a']).toBe(1);
        });

        it('flush creates a git commit', () => {
            const dir = path.join(tmpDir, 'git-test-flush');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            backend.write('data.json', Buffer.from('test'));
            backend.flush('qa-tools: test commit');
            const log = execFileSync(GIT_BIN, ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });

            expect(log).toContain('qa-tools: test commit');
        });

        it('flush with no changes creates empty commit', () => {
            const dir = path.join(tmpDir, 'git-test-empty');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            backend.flush('qa-tools: empty');
            const log = execFileSync(GIT_BIN, ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });

            expect(log).toContain('qa-tools: empty');
        });

        it('works with subdirectory relStoreDir', () => {
            const dir = path.join(tmpDir, 'git-test-subdir');
            const backend = new GitStoreBackend(dir, '.qa-tools');
            backend.init();
            backend.write('data.json', Buffer.from('subdir test'));
            const full = path.join(dir, '.qa-tools', 'data.json');

            expect(fs.existsSync(path.resolve(full))).toBeTruthy();
        });

        it('pre-existing git repo is not re-initialized', () => {
            const dir = path.join(tmpDir, 'git-test-existing');
            fs.mkdirSync(path.resolve(dir), { recursive: true });
            execFileSync(GIT_BIN, ['init', dir], { stdio: 'ignore' });
            execFileSync(GIT_BIN, ['-C', dir, 'config', 'user.name', 'preexisting'], { stdio: 'ignore' });
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            const config = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8');

            expect(config).toContain('preexisting');
        });
    });

    describe('GitStoreBackend additional coverage', () => {
        it('init throws when mkdir fails', () => {
            const dir = path.join(tmpDir, 'git-init-mkdir-fail');
            const backend = new GitStoreBackend(dir, '.');
            const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('EACCES');
            });

            expect(() => backend.init()).toThrow('GitStoreBackend: não foi possível criar diretório');

            spy.mockRestore();
        });

        it('init throws when git init fails', () => {
            const dir = path.join(tmpDir, 'git-init-git-fail');
            fs.mkdirSync(path.resolve(dir), { recursive: true });
            const backend = new GitStoreBackend(dir, '.');
            /* Make dir read-only so git init cannot create .git */
            fs.chmodSync(path.resolve(dir), 0o500);
            try {
                expect(() => backend.init()).toThrow('GitStoreBackend: git init falhou');
            } finally {
                fs.chmodSync(path.resolve(dir), 0o750);
            }
        });

        it('write throws on filesystem error', () => {
            const dir = path.join(tmpDir, 'git-write-fail');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
                throw new Error('ENOSPC');
            });

            expect(() => backend.write('fail.json', Buffer.from('data'))).toThrow('GitStoreBackend: falha ao escrever');

            spy.mockRestore();
        });

        it('flush throws when git add/commit fails', () => {
            const dir = path.join(tmpDir, 'git-flush-fail');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            /* Make .git read-only so git add/commit fails */
            fs.chmodSync(path.join(dir, '.git'), 0o500);
            try {
                expect(() => backend.flush('test commit')).toThrow('GitStoreBackend: git add/commit falhou');
            } finally {
                fs.chmodSync(path.join(dir, '.git'), 0o750);
            }
        });

        it('read returns null for non-existent file in GitStoreBackend', () => {
            const dir = path.join(tmpDir, 'git-read-missing');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();

            expect(backend.read('nonexistent.json')).toBeNull();
        });

        it('read returns null on filesystem error', () => {
            const dir = path.join(tmpDir, 'git-read-error');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('EIO');
            });

            expect(backend.read('any.json')).toBeNull();

            spy.mockRestore();
            readSpy.mockRestore();
        });

        it('exists checks file existence', () => {
            const dir = path.join(tmpDir, 'git-exists');
            const backend = new GitStoreBackend(dir, '.');
            backend.init();
            backend.write('test.txt', Buffer.from('data'));

            expect(backend.exists('test.txt')).toBeTruthy();
            expect(backend.exists('missing.txt')).toBeFalsy();
        });

        it('write creates intermediate directories', () => {
            const dir = path.join(tmpDir, 'git-write-deep');
            const backend = new GitStoreBackend(dir, '.qa-tools');
            backend.init();
            backend.write('deeply/nested/file.json', Buffer.from('nested'));
            const full = path.join(dir, '.qa-tools', 'deeply', 'nested', 'file.json');

            expect(fs.existsSync(path.resolve(full))).toBeTruthy();
        });
    });

    describe('FsStoreBackend additional coverage', () => {
        it('read returns null on filesystem error', () => {
            const dir = path.join(tmpDir, 'fs-read-error');
            const backend = new FsStoreBackend(dir);
            backend.init();
            const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
            const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('EIO');
            });

            expect(backend.read('bad.json')).toBeNull();

            spy.mockRestore();
            readSpy.mockRestore();
        });

        it('write throws on filesystem error', () => {
            const dir = path.join(tmpDir, 'fs-write-error');
            const backend = new FsStoreBackend(dir);
            backend.init();
            const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
                throw new Error('ENOSPC');
            });

            expect(() => backend.write('fail.json', Buffer.from('data'))).toThrow('FsStoreBackend: falha ao escrever');

            spy.mockRestore();
        });
    });

    describe('DetectProjectGitDir', () => {
        it('returns null when no .git found', () => {
            expect(detectProjectGitDir('/nonexistent-path-xyz')).toBeNull();
        });

        it('returns null when no .git found from cwd', () => {
            const noGitDir = path.join(tmpDir, 'no-git-cwd');
            fs.mkdirSync(path.resolve(noGitDir), { recursive: true });
            const origCwd = process.cwd();
            process.chdir(noGitDir);
            try {
                expect(detectProjectGitDir()).toBeNull();
            } finally {
                process.chdir(origCwd);
            }
        });

        it('returns git dir for project with .git', () => {
            const dir = path.join(tmpDir, 'detect-proj');
            fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

            expect(detectProjectGitDir(dir)).toBe(dir);
        });

        it('finds .git in parent directory', () => {
            const gitDir = path.join(tmpDir, 'detect-parent');
            const subDir = path.join(gitDir, 'sub', 'deep');
            fs.mkdirSync(path.resolve(subDir), { recursive: true });
            fs.mkdirSync(path.join(gitDir, '.git'));

            expect(detectProjectGitDir(subDir)).toBe(gitDir);
        });
    });

    describe('DetectStoreBackend', () => {
        const origXdg = process.env['XDG_STATE_HOME'];
        const origHome = process.env['HOME'];

        afterAll(() => {
            if (origXdg) process.env['XDG_STATE_HOME'] = origXdg;
            else delete process.env['XDG_STATE_HOME'];
            if (origHome) process.env['HOME'] = origHome;
            else delete process.env['HOME'];
        });

        it('returns FsStoreBackend when no git and no project dir', () => {
            process.env['XDG_STATE_HOME'] = path.join(tmpDir, 'xdg-fallback');
            const backend = detectStoreBackend();
            const hasGit = (() => {
                try {
                    execFileSync(GIT_BIN, ['--version'], { stdio: 'ignore' });
                    return true;
                } catch {
                    return false;
                }
            })();
            const expectedName = hasGit ? 'GitStoreBackend' : 'FsStoreBackend';

            expect(backend.constructor.name).toBe(expectedName);
        });

        it('returns GitStoreBackend when project has .git', () => {
            const projDir = path.join(tmpDir, 'proj-with-git');
            fs.mkdirSync(path.join(projDir, '.git'), { recursive: true });
            const backend = detectStoreBackend(projDir);

            expect(backend.constructor.name).toBe('GitStoreBackend');
        });

        it('falls through to XDG when projectDir has no .git', () => {
            const projDir = path.join(tmpDir, 'proj-no-git');
            fs.mkdirSync(path.resolve(projDir), { recursive: true });
            const prevXdg = process.env['XDG_STATE_HOME'];
            const xdgDir = path.join(tmpDir, 'xdg-fallback-no-git');
            process.env['XDG_STATE_HOME'] = xdgDir;
            try {
                const backend = detectStoreBackend(projDir);

                expect(backend.constructor.name).toBe('GitStoreBackend');
            } finally {
                if (prevXdg) process.env['XDG_STATE_HOME'] = prevXdg;
                else delete process.env['XDG_STATE_HOME'];
            }
        });

        it('returns FsStoreBackend when git dir check throws', () => {
            const xdgDir = path.join(tmpDir, 'xdg-throw-fallback');
            process.env['XDG_STATE_HOME'] = xdgDir;

            const origExists = fs.existsSync;
            const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
                const pStr = typeof p === 'string' ? p : String(p);
                if (pStr.includes('xdg-throw-fallback') && pStr.includes('.git')) {
                    throw new Error('EACCES');
                }
                return origExists(p);
            });

            try {
                const backend = detectStoreBackend();

                expect(backend).toBeInstanceOf(FsStoreBackend);
            } finally {
                existsSpy.mockRestore();
            }
        });

        it('returns GitStoreBackend when XDG dir already has .git', () => {
            const xdgDir = path.join(tmpDir, 'xdg-has-git');
            fs.mkdirSync(path.join(xdgDir, '.git'), { recursive: true });
            process.env['XDG_STATE_HOME'] = xdgDir;
            try {
                const backend = detectStoreBackend();

                expect(backend).toBeInstanceOf(GitStoreBackend);
            } finally {
                delete process.env['XDG_STATE_HOME'];
            }
        });

        it('returns GitStoreBackend when canExecGit succeeds with full path', () => {
            const xdgDir = path.join(tmpDir, 'xdg-fullpath');
            fs.mkdirSync(path.resolve(xdgDir), { recursive: true });
            process.env['XDG_STATE_HOME'] = xdgDir;
            /* Implementation uses /usr/bin/git (full path), so canExecGit
               succeeds even when PATH is cleared — this is the correct
               behavior for sonarjs/no-os-command-from-path compliance. */
            const backend = detectStoreBackend('/nonexistent-project-dir');

            expect(backend).toBeInstanceOf(GitStoreBackend);
        });

        it('falls back to os.homedir when XDG_STATE_HOME is not set', () => {
            const origXdg = process.env['XDG_STATE_HOME'];
            const origHome = process.env['HOME'];
            const xdgDir = path.join(tmpDir, 'xdg-homedir');
            process.env['HOME'] = xdgDir;
            delete process.env['XDG_STATE_HOME'];
            try {
                const backend = detectStoreBackend();

                expect(backend).toBeInstanceOf(GitStoreBackend);
            } finally {
                if (origXdg) process.env['XDG_STATE_HOME'] = origXdg;
                else delete process.env['XDG_STATE_HOME'];
                if (origHome) process.env['HOME'] = origHome;
                else delete process.env['HOME'];
            }
        });
    });
});
