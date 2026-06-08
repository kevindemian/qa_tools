import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STARTUP_TIMEOUT = 12000;

describe('smoke-startup', () => {
    it('jira_management não crasha com JIRA/XRAY vars vazias', async () => {
        const child = spawn('npx', ['tsx', 'jira_management/main.ts'], {
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

        if (result.code !== null) {
            expect(result.code).toBe(0);
        }
        expect(output).toContain('QA Tools');
        expect(output).not.toContain('Erro inesperado');
    }, 20000);

    it('entry-menu não crasha com JIRA/XRAY vars vazias', async () => {
        const child = spawn('npx', ['tsx', 'shared/entry-menu.ts'], {
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

        if (result.code !== null) {
            expect(result.code).toBe(0);
        }
        expect(output).not.toContain('Erro inesperado');
    }, 20000);
});
