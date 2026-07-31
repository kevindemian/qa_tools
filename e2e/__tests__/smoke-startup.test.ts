import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const MAX_STARTUP_TIME = 30000;

function spawnClean(args: string[], testEnv: Record<string, string>) {
    const { VITEST: _, NODE_ENV: _2, NODE_OPTIONS: _3, ...base } = process.env;
    return spawn(process.execPath, [TSX_BIN, ...args], {
        cwd: ROOT,
        env: { ...base, ...testEnv },
        stdio: 'pipe',
    });
}

function waitForOutput(
    child: ReturnType<typeof spawn>,
    pattern: string,
    timeoutMs: number,
): Promise<{ output: string; code: number | null }> {
    return new Promise((resolve) => {
        let output = '';
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                child.kill();
                resolve({ output, code: null });
            }
        }, timeoutMs);
        child.stdout?.on('data', (d: Buffer) => {
            output += d.toString();
            if (!resolved && output.includes(pattern)) {
                resolved = true;
                clearTimeout(timer);
                child.kill();
                resolve({ output, code: null });
            }
        });
        child.stderr?.on('data', (d: Buffer) => {
            output += d.toString();
            if (!resolved && output.includes(pattern)) {
                resolved = true;
                clearTimeout(timer);
                child.kill();
                resolve({ output, code: null });
            }
        });
        child.on('exit', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ output, code });
            }
        });
    });
}

describe('Smoke-startup', () => {
    it('jira_management não crasha com JIRA/XRAY vars vazias', async () => {
        expect.hasAssertions();

        const child = spawnClean(['jira_management/main.ts'], {
            JIRA_BASE_URL: '',
            JIRA_PERSONAL_TOKEN: '',
            XRAY_BASE_URL: '',
            CI: 'true',
            AUTO_CONFIRM: 'true',
            SKIP_FIRST_RUN: 'true',
        });

        const { output } = await waitForOutput(child, 'QA Tools', MAX_STARTUP_TIME);

        expect(output).toContain('QA Tools');
        expect(output).not.toContain('Erro inesperado');
    }, 45000);

    it('entry-menu não crasha com JIRA/XRAY vars vazias', async () => {
        expect.hasAssertions();

        const child = spawnClean(['shared/ui/entry-menu.ts'], {
            JIRA_BASE_URL: '',
            JIRA_PERSONAL_TOKEN: '',
            XRAY_BASE_URL: '',
            CI: 'true',
            AUTO_CONFIRM: 'true',
            SKIP_FIRST_RUN: 'true',
        });

        const { output } = await waitForOutput(child, '', MAX_STARTUP_TIME);

        expect(output).not.toContain('Erro inesperado');
    }, 45000);
});
