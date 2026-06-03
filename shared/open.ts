/** OS-aware file opener: macOS `open`, Windows `start`, Linux `xdg-open` (with WSL fallback). */
import { spawn, spawnSync, execFileSync } from 'child_process';
import { platform } from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import Config from './config';

interface OsOpenCommand {
    cmd: string;
    args: string[];
}

let _wslCached: boolean | null = null;

/** Reset cached WSL detection state. Used in tests to avoid cross-test leakage. */
export function __resetWslCache(): void {
    _wslCached = null;
}

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

/** Get a writable Windows temp directory under WSL (`/mnt/c/...`). */
export function getWinTempDir(): string | null {
    if (process.env.TEMP && process.env.TEMP.startsWith('/')) return process.env.TEMP;
    if (process.env.TMP && process.env.TMP.startsWith('/')) return process.env.TMP;
    try {
        const raw = execFileSync('cmd.exe', ['/c', 'echo', '%TEMP%'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        if (!raw) return null;
        return raw
            .replace(/\\/g, '/')
            .replace(/^([A-Za-z]):/, (_m: string, letter: string) => '/mnt/' + letter.toLowerCase());
    } catch {
        return null;
    }
}

/** Get the output directory for generated docs (WSL-aware). */
export function getDocsOutputDir(): string | null {
    if (isWsl()) {
        const winTemp = getWinTempDir();
        if (!winTemp) return null;
        return join(winTemp, 'qa_tools_docs');
    }
    const envDir = Config.get('QA_TOOLS_TEMP_DIR');
    const root = envDir ? resolve(envDir) : resolve(__dirname, '..', 'temp');
    return join(root, 'docs');
}

/** Convert a Unix path to Windows path using wslpath. Uses spawnSync with argument array to prevent shell injection (C13-1). */
function toWinPath(target: string): string | null {
    try {
        const result = spawnSync('wslpath', ['-w', target], { encoding: 'utf8' });
        if (result.status === 0) {
            const wp = (result.stdout ?? '').trim();
            if (/^[A-Za-z]:\\/.test(wp)) return wp;
        }
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
        const result2 = spawnSync('wslpath', ['-w', dest], { encoding: 'utf8' });
        if (result2.status === 0) {
            const wp = (result2.stdout ?? '').trim();
            return /^[A-Za-z]:\\/.test(wp) ? wp : null;
        }
        return null;
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

/** Open a file/URL with the OS default handler. Falls back to `fallbackViewer` when no OS command works. */
export async function openWithOsOrFallback(target: string, fallbackViewer?: () => void): Promise<boolean> {
    if (!target || target === 'undefined') {
        fallbackViewer?.();
        return false;
    }
    const command = getOsOpenCommand(target);
    if (!command) {
        fallbackViewer?.();
        return false;
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

/**
 * Open a file with a 3-level fallback chain:
 *   1. Browser/file handler (`openWithOsOrFallback` on the file)
 *   2. File manager (`openWithOsOrFallback` on the parent directory)
 *   3. Print the file path via `logInfo`
 *
 * @param filePath  Absolute path to the file to open.
 * @param label     Human-readable label for log messages (e.g. "Relatório", "Documentação").
 * @param logInfo   Info-logger function from prompt (injected to avoid direct dependency).
 */
export async function openWithFallback(filePath: string, label: string, logInfo: (msg: string) => void): Promise<void> {
    if (!filePath) {
        logInfo(label + ' não encontrado');
        return;
    }
    const opened = await openWithOsOrFallback(filePath);
    if (opened) {
        logInfo(label + ' aberto no navegador');
        return;
    }
    const parentDir = dirname(filePath);
    const dirOpened = await openWithOsOrFallback(parentDir);
    if (dirOpened) {
        logInfo(label + ' salvo. Navegador indisponível, pasta aberta no gerenciador de arquivos.');
        return;
    }
    logInfo(label + ' salvo em: ' + filePath);
}
