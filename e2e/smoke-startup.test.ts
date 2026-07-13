import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const STARTUP_TIMEOUT = 12000;

describe('Smoke-startup', () => {
    it('jira_management não crasha com JIRA/XRAY vars vazias', async () => {
        expect.hasAssertions();

        const child = spawn(process.execPath, [TSX_BIN, 'jira_management/main.ts'], {
            cwd: ROOT,
            env: {
                ...process.env,
                JIRA_BASE_URL: '',
                JIRA_PERSONAL_TOKEN: '',
                XRAY_BASE_URL: '',
                CI: 'true',
                AUTO_CONFIRM: 'true',
                SKIP_FIRST_RUN: 'true',
            },
            stdio: 'pipe',
        });

        let output = '';
        child.stdout.on('data', (d: Buffer) => {
            output += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
            output += d.toString();
        });

        const result = await new Promise<{ code: number | null }>((resolve) => {
            const timer = setTimeout(() => {
                child.kill();
                resolve({ code: null });
            }, STARTUP_TIMEOUT);
            child.on('exit', (code) => {
                clearTimeout(timer);
                resolve({ code });
            });
        });

        expect(result.code).toBe(result.code !== null ? 0 : result.code);

        expect(output).toContain('QA Tools');
        expect(output).not.toContain('Erro inesperado');
    }, 20000);

    it('entry-menu não crasha com JIRA/XRAY vars vazias', async () => {
        expect.hasAssertions();

        const child = spawn(process.execPath, [TSX_BIN, 'shared/entry-menu.ts'], {
            cwd: ROOT,
            env: {
                ...process.env,
                JIRA_BASE_URL: '',
                JIRA_PERSONAL_TOKEN: '',
                XRAY_BASE_URL: '',
                CI: 'true',
                AUTO_CONFIRM: 'true',
                SKIP_FIRST_RUN: 'true',
            },
            stdio: 'pipe',
        });

        let output = '';
        child.stdout.on('data', (d: Buffer) => {
            output += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
            output += d.toString();
        });

        const result = await new Promise<{ code: number | null }>((resolve) => {
            const timer = setTimeout(() => {
                child.kill();
                resolve({ code: null });
            }, STARTUP_TIMEOUT);
            child.on('exit', (code) => {
                clearTimeout(timer);
                resolve({ code });
            });
        });

        expect(result.code).toBe(result.code !== null ? 0 : result.code);

        expect(output).not.toContain('Erro inesperado');
    }, 20000);
});
