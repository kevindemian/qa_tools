#!/usr/bin/env tsx
import { spawn } from 'child_process';
import { showSplash } from './splash';
import { showSelect } from './prompt';
import { Output, defaultOutput } from './output';
import { join } from 'path';

const root = join(__dirname, '..');

async function runModule(module: 'jira' | 'git'): Promise<void> {
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

async function main(): Promise<void> {
    const isTTY = Output.isTTY() && !Output.isCI();

    if (!isTTY) {
        defaultOutput.print('Usage: npm run jira   — Jira/Xray management');
        defaultOutput.print('       npm run git    — Git triggers (GitHub/GitLab)');
        return;
    }

    while (true) {
        // eslint-disable-next-line no-console
        console.clear();
        await showSplash();

        const choice = showSelect('      Selecione o módulo', [
            { name: '      Jira Management  (Testes, Releases, Config)', value: 'jira' },
            { name: '      Git Triggers     (Pipelines, PR/MR, CI/CD)', value: 'git' },
            { type: 'separator', line: '        ' },
            { name: '      /exit  Sair', value: 'exit' },
        ]);

        if (choice === 'exit') break;
        if (choice !== 'jira' && choice !== 'git') continue;

        try {
            await runModule(choice);
            // child exited with code 0 → loop back to entry menu
        } catch {
            break; // fatal error → exit
        }
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console -- entry point error
    console.error('Erro: ' + String(err));
    process.exit(1);
});
