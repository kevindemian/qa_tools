/* eslint-disable no-restricted-syntax -- execSync used intentionally for git */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

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
        fs.mkdirSync(this.fullPath, { recursive: true });
        if (!fs.existsSync(path.join(this.gitWorkDir, '.git'))) {
            execSync(`git init "${this.gitWorkDir}"`, { stdio: 'ignore' });
            execSync(`git -C "${this.gitWorkDir}" config user.name "qa-tools"`, { stdio: 'ignore' });
            execSync(`git -C "${this.gitWorkDir}" config user.email "qa-tools@localhost"`, { stdio: 'ignore' });
        }
    }

    read(relPath: string): Buffer | null {
        const full = path.join(this.fullPath, relPath);
        try {
            return fs.existsSync(full) ? fs.readFileSync(full) : null;
        } catch {
            return null;
        }
    }

    write(relPath: string, data: Buffer): void {
        const full = path.join(this.fullPath, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, data);
    }

    exists(relPath: string): boolean {
        return fs.existsSync(path.join(this.fullPath, relPath));
    }

    flush(message: string): void {
        execSync(`git -C "${this.gitWorkDir}" add "${this.relStoreDir}"`, { stdio: 'ignore' });
        execSync(`git -C "${this.gitWorkDir}" -c core.hooksPath=/dev/null commit --allow-empty -m "${message}"`, {
            stdio: 'ignore',
        });
    }
}

export class FsStoreBackend implements StoreBackend {
    constructor(private readonly baseDir: string) {}

    init(): void {
        fs.mkdirSync(this.baseDir, { recursive: true });
    }

    read(relPath: string): Buffer | null {
        const full = path.join(this.baseDir, relPath);
        try {
            return fs.existsSync(full) ? fs.readFileSync(full) : null;
        } catch {
            return null;
        }
    }

    write(relPath: string, data: Buffer): void {
        const full = path.join(this.baseDir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, data);
    }

    exists(relPath: string): boolean {
        return fs.existsSync(path.join(this.baseDir, relPath));
    }

    flush(_message: string): void {
        /* no-op */
    }
}

export function detectProjectGitDir(startDir?: string): string | null {
    let dir = startDir ? path.resolve(startDir) : process.cwd();
    while (true) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

export function detectStoreBackend(projectDir?: string): StoreBackend {
    const xdgBase = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    const xdgDir = path.join(xdgBase, 'qa-tools');

    if (projectDir) {
        if (fs.existsSync(path.join(projectDir, '.git'))) {
            return new GitStoreBackend(projectDir, '.qa-tools');
        }
    }

    try {
        const gitDir = path.join(xdgDir, '.git');
        if (fs.existsSync(gitDir) || canExecSync()) {
            return new GitStoreBackend(xdgDir, '.');
        }
    } catch {
        /* fall through */
    }

    return new FsStoreBackend(xdgDir);
}

function canExecSync(): boolean {
    try {
        execSync('git --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}
