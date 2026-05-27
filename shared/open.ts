import { spawn } from 'child_process';
import { platform } from 'os';

interface OsOpenCommand {
    cmd: string;
    args: string[];
}

function getOsOpenCommand(target: string): OsOpenCommand | null {
    switch (platform()) {
        case 'darwin':
            return { cmd: 'open', args: [target] };
        case 'win32':
            return { cmd: 'cmd', args: ['/c', 'start', '', target] };
        case 'linux':
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
            if (code === 0) {
                resolve(true);
            } else {
                fallbackViewer?.();
                resolve(false);
            }
        });
        child.unref();
    });
}
