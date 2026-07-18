import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { rootLogger } from '../logger.js';
import { sanitizePath } from '../path-utils.js';
import Config from '../config-accessor.js';

const GIT_BIN = '/usr/bin/git';

export interface StoreBackend {
    init(): void;
    read(relPath: string): Buffer | null;
    write(relPath: string, data: Buffer): void;
    exists(relPath: string): boolean;
    flush(message: string): void;
}

export class GitStoreBackend implements StoreBackend {
    constructor(
        private readonly gitWorkDir: string,
        private readonly relStoreDir: string = '.',
    ) {}

    private get fullPath(): string {
        return path.join(this.gitWorkDir, this.relStoreDir);
    }

    init(): void {
        try {
            fs.mkdirSync(path.resolve(this.fullPath), { recursive: true });
        } catch (err) {
            rootLogger.error('GitStoreBackend: mkdir failed: ' + String(err));
            /* if mkdir fails, subsequent operations will also fail — propagate */
            throw new Error(`GitStoreBackend: não foi possível criar diretório ${this.fullPath}`, { cause: err });
        }
        if (!fs.existsSync(path.join(this.gitWorkDir, '.git'))) {
            try {
                execFileSync(GIT_BIN, ['init', this.gitWorkDir], { stdio: 'ignore' });
                execFileSync(GIT_BIN, ['-C', this.gitWorkDir, 'config', 'user.name', 'qa-tools'], { stdio: 'ignore' });
                execFileSync(GIT_BIN, ['-C', this.gitWorkDir, 'config', 'user.email', 'qa-tools@localhost'], {
                    stdio: 'ignore',
                });
            } catch (err) {
                rootLogger.error('GitStoreBackend: git init failed: ' + String(err));
                throw new Error(`GitStoreBackend: git init falhou em ${this.gitWorkDir}`, { cause: err });
            }
        }
    }

    read(relPath: string): Buffer | null {
        const full = sanitizePath(this.fullPath, relPath);
        try {
            return fs.existsSync(path.resolve(full)) ? fs.readFileSync(full) : null;
        } catch (err) {
            rootLogger.warn('GitStoreBackend: read failed: ' + String(err));
            return null;
        }
    }

    write(relPath: string, data: Buffer): void {
        const full = sanitizePath(this.fullPath, relPath);
        try {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(path.resolve(full), data);
        } catch (err) {
            const msg = String(err);
            throw new Error(`GitStoreBackend: falha ao escrever ${relPath} — ${msg}`, {
                cause: err,
            });
        }
    }

    exists(relPath: string): boolean {
        return fs.existsSync(sanitizePath(this.fullPath, relPath));
    }

    flush(message: string): void {
        try {
            execFileSync(GIT_BIN, ['-C', this.gitWorkDir, 'add', this.relStoreDir], { stdio: 'ignore' });
            execFileSync(
                GIT_BIN,
                ['-C', this.gitWorkDir, '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', message],
                {
                    stdio: 'ignore',
                },
            );
        } catch (err) {
            const msg = String(err);
            throw new Error(`GitStoreBackend: git add/commit falhou em ${this.gitWorkDir} — ${msg}`, { cause: err });
        }
    }
}

export class FsStoreBackend implements StoreBackend {
    constructor(private readonly baseDir: string) {}

    init(): void {
        fs.mkdirSync(path.resolve(this.baseDir), { recursive: true });
    }

    read(relPath: string): Buffer | null {
        const full = path.join(this.baseDir, relPath);
        try {
            return fs.existsSync(path.resolve(full)) ? fs.readFileSync(full) : null;
        } catch (err) {
            rootLogger.warn('FsStoreBackend: read failed: ' + String(err));
            return null;
        }
    }

    write(relPath: string, data: Buffer): void {
        const full = path.join(this.baseDir, relPath);
        try {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(path.resolve(full), data);
        } catch (err) {
            const msg = String(err);
            throw new Error(`FsStoreBackend: falha ao escrever ${relPath} — ${msg}`, { cause: err });
        }
    }

    exists(relPath: string): boolean {
        return fs.existsSync(path.join(this.baseDir, relPath));
    }

    flush(_message: string): void {
        /* no-op */
    }
}

/**
 * Find the nearest ancestor directory containing a `.git` folder, walking up from `startDir`.
 * Quando `startDir` não é informado, usa (em ordem): `qaProjectDir` (Config, definido por `setCurrentProject`
 * na Fase 2) → `QA_PROJECT_DIR` (env) → `process.cwd()`. Isso faz o DataHub store respeitar o projeto ativo (T7).
 */
export function detectProjectGitDir(startDir?: string): string | null {
    let dir = startDir
        ? path.resolve(startDir)
        : Config.get('qaProjectDir') || process.env['QA_PROJECT_DIR'] || process.cwd();
    dir = path.resolve(dir);
    for (;;) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Detect the appropriate StoreBackend for persisting DataHub data.
 *
 * Precedência (T7 — store por projeto):
 * - Se `projectDir` explícito fornecido: comporta-se como antes (git repo → GitStoreBackend no projeto;
 *   senão cai no fallback XDG, preservando testes existentes).
 * - Se nenhum `projectDir` e um projeto está ativo (`qaProjectDir`/`QA_PROJECT_DIR`): o store vive em
 *   `<eff>/.qa-tools` (GitStoreBackend se `<eff>` for git repo, senão FsStoreBackend).
 * - Caso contrário: fallback XDG global (comportamento legado, inalterado).
 */
export function detectStoreBackend(projectDir?: string): StoreBackend {
    const xdgBase = process.env['XDG_STATE_HOME'] || path.join(os.homedir(), '.local', 'state');
    const xdgDir = path.join(xdgBase, 'qa-tools');

    if (projectDir) {
        const pd = path.resolve(projectDir);
        if (fs.existsSync(path.join(pd, '.git'))) {
            return new GitStoreBackend(pd, '.qa-tools');
        }
    } else {
        const eff = Config.get('qaProjectDir') || process.env['QA_PROJECT_DIR'];
        if (eff) {
            const effDir = path.resolve(eff);
            if (fs.existsSync(path.join(effDir, '.git'))) {
                return new GitStoreBackend(effDir, '.qa-tools');
            }
            return new FsStoreBackend(path.join(effDir, '.qa-tools'));
        }
    }

    try {
        const gitDir = path.join(xdgDir, '.git');
        if (fs.existsSync(path.resolve(gitDir)) || canExecGit()) {
            return new GitStoreBackend(xdgDir, '.');
        }
    } catch (err) {
        const msg = String(err);
        /* GitStoreBackend init failed — fall back to FsStoreBackend */
        rootLogger.warn('GitStoreBackend init failed, falling back to FsStoreBackend: ' + msg);
    }

    return new FsStoreBackend(xdgDir);
}

function canExecGit(): boolean {
    try {
        execFileSync(GIT_BIN, ['--version'], { stdio: 'ignore' });
        return true;
    } catch (err) {
        rootLogger.debug('store-backend: git not available: ' + String(err));
        return false;
    }
}
