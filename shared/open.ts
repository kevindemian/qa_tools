import { spawn, execSync } from 'child_process';
import { platform } from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { basename, join, resolve } from 'path';

interface OsOpenCommand {
    cmd: string;
    args: string[];
}

let _wslCached: boolean | null = null;

function isWsl(): boolean {
    if (_wslCached !== null) return _wslCached;
    try {
        const version = readFileSync('/proc/version', 'utf8');
        _wslCached = /microsoft|wsl/i.test(version);
    } catch {
        _wslCached = false;
    }
    return _wslCached;
}

export function getWinTempDir(): string | null {
    if (process.env.TEMP && process.env.TEMP.startsWith('/')) return process.env.TEMP;
    if (process.env.TMP && process.env.TMP.startsWith('/')) return process.env.TMP;
    try {
        const raw = execSync('cmd.exe /c echo %TEMP%', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (!raw) return null;
        return raw.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_m, letter) => '/mnt/' + letter.toLowerCase());
    } catch {
        return null;
    }
}

export function getDocsOutputDir(): string | null {
    if (isWsl()) {
        const winTemp = getWinTempDir();
        if (!winTemp) return null;
        return join(winTemp, 'qa_tools_docs');
    }
    const envDir = process.env.QA_TOOLS_TEMP_DIR;
    const root = envDir ? resolve(envDir) : resolve(__dirname, '..', 'temp');
    return join(root, 'docs');
}

function toWinPath(target: string): string | null {
    try {
        const wp = execSync(`wslpath -w "${target}"`, { encoding: 'utf8' }).trim();
        if (/^[A-Za-z]:\\/.test(wp)) return wp;
    } catch {
        /* wslpath failed */
    }

    const tmpRoot = getWinTempDir();
    if (!tmpRoot) return null;

    try {
        const content = readFileSync(target);
        const dir = join(tmpRoot, 'qa_tools_docs');
        mkdirSync(dir, { recursive: true });
        const dest = join(dir, basename(target));
        writeFileSync(dest, content);
        const wp = execSync(`wslpath -w "${dest}"`, { encoding: 'utf8' }).trim();
        return /^[A-Za-z]:\\/.test(wp) ? wp : null;
    } catch {
        return null;
    }
}

/** @internal Not part of public API. Used internally by `openWithOsOrFallback`. */
export function getOsOpenCommand(target: string): OsOpenCommand | null {
    switch (platform()) {
        case 'darwin':
            return { cmd: 'open', args: [target] };
        case 'win32':
            return { cmd: 'cmd', args: ['/c', 'start', '', target] };
        case 'linux':
            if (isWsl()) {
                const wp = toWinPath(target);
                if (wp) return { cmd: 'cmd.exe', args: ['/c', 'start', '', wp] };
            }
            return { cmd: 'xdg-open', args: [target] };
        default:
            return null;
    }
}

export function openWithOsOrFallback(target: string, fallbackViewer?: () => void): Promise<boolean> {
    const command = getOsOpenCommand(target);
    if (!command) {
        fallbackViewer?.();
        return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
        const child = spawn(command.cmd, command.args, {
            stdio: 'ignore',
            detached: true,
        });
        if (!child) {
            fallbackViewer?.();
            resolve(false);
            return;
        }
        child.on('error', () => {
            fallbackViewer?.();
            resolve(false);
        });
        child.on('exit', (code) => {
            child.unref();
            if (code === 0) {
                resolve(true);
            } else {
                fallbackViewer?.();
                resolve(false);
            }
        });
    });
}
