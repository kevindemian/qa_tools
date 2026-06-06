/** Entry-point module selector for the QA Tools CLI.
 * Displays a splash screen and lets the user choose between
 * Jira Management and Git Triggers. Each module is spawned as a
 * child process via `tsx` for clean state isolation.
 * Falls back to usage instructions in non-TTY/CI environments. */

import { spawn } from 'child_process';
import { showSplash } from './splash.js';
import { showSelect } from './prompt.js';
import { Output, defaultOutput } from './output.js';
import { rootLogger } from './logger.js';
import { ExitCode } from './types.js';
import { fileURLToPath } from 'url';
import { join, resolve } from 'path';
import { gracefulExit } from './cli_base.js';

const root = join(import.meta.dirname, '..');

/** Spawn a module as a child process. Each module (`jira` or `git`) runs in
 * its own process with inherited stdio and isolated state. Resolves on clean
 * exit (code 0), rejects on non-zero exit or spawn error. */
export async function runModule(module: 'jira' | 'git'): Promise<void> {
    const script = module === 'jira' ? 'jira_management/main.ts' : 'git_triggers/main.ts';
    return new Promise<void>((resolve, reject) => {
        const child = spawn('npx', ['tsx', join(root, script)], {
            stdio: 'inherit',
            cwd: root,
        });
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Processo encerrou com código ${code}`));
        });
        child.on('error', reject);
    });
}

export async function main(): Promise<void> {
    const isTTY = Output.isTTY() && !Output.isCI();

    if (!isTTY) {
        defaultOutput.print('Usage: npm run jira   — Jira/Xray management');
        defaultOutput.print('       npm run git    — Git triggers (GitHub/GitLab, CI/CD Setup)');
        return;
    }

    while (true) {
        if (process.stdout.isTTY) process.stdout.write('\x1Bc');
        await showSplash();

        const choice = await showSelect('      Selecione o módulo', [
            { name: '      Jira Management  (Testes, Releases, Config)', value: 'jira' },
            { name: '      Git Triggers     (Pipelines, PR/MR, CI/CD, Setup)', value: 'git' },
            { type: 'separator', line: '        ' },
            { name: '      Setup Wizard  (Configurar projeto)', value: 'setup' },
            { type: 'separator', line: '        ' },
            { name: '      /exit  Sair', value: 'exit' },
        ]);

        if (choice === 'exit') break;
        if (choice === 'setup') {
            await new Promise<void>((resolve, reject) => {
                const child = spawn('npx', ['tsx', join(root, 'setup/main.ts')], {
                    stdio: 'inherit',
                    cwd: root,
                });
                child.on('exit', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Setup encerrou com código ' + code));
                });
                child.on('error', reject);
            });
            continue;
        }
        if (choice !== 'jira' && choice !== 'git') continue;

        try {
            await runModule(choice);
            // child exited with code 0 → loop back to entry menu
        } catch (err: unknown) {
            rootLogger.error('Entry menu child module error: ' + (err as Error).message);
            break;
        }
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        rootLogger.error('Entry menu fatal: ' + String(err));
        gracefulExit(ExitCode.ERROR);
    });
}
