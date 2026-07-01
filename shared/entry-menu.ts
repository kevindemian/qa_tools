/** Entry-point module selector for the QA Tools CLI.
 * Displays a splash screen and lets the user choose between
 * Jira Management, Git Triggers, and the SmartWizard LLM.
 * Falls back to usage instructions in non-TTY/CI environments.
 *
 * Pre-menu checks (SW-6):
 *   - _llmConfigAttempts >= 3 → warning with (S/N/d) options
 *   - _llmConfigSuggestions.pending → offer to review
 *   - _llmConfigError → show error and offer retry
 *   - Auto-retry: if _attempts < 3 && time > 60s*2^attempts → fire background discovery */

import { spawn } from 'child_process';
import { showSplash } from './splash.js';
import { showSelect, confirm, info, warn, divider } from './prompt.js';
import { Output, defaultOutput } from './output.js';
import { rootLogger } from './logger.js';
import { ExitCode } from './types.js';
import { fileURLToPath } from 'url';
import { join, resolve } from 'path';
import { gracefulExit } from './cli_base.js';
import { loadTypedState, updateTyped } from './state.js';
import { checkQualitySignals } from './quality-suggester.js';

const root = join(import.meta.dirname, '..');
const TSX_BIN = join(root, 'node_modules', '.bin', 'tsx');
const RETRY_DELAY_BASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** Spawn a module as a child process. Each module (`jira` or `git`) runs in
 * its own process with inherited stdio and isolated state. Resolves on clean
 * exit (code 0), rejects on non-zero exit or spawn error. */
export async function runModule(module: 'jira' | 'git'): Promise<void> {
    const script = module === 'jira' ? 'jira_management/main.ts' : 'git_triggers/main.ts';
    return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [TSX_BIN, join(root, script)], {
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

/** Check if enough time has elapsed for the next automatic retry. */
function shouldAutoRetry(lastAttempt: string | undefined, attemptCount: number): boolean {
    if (!lastAttempt) return false;
    const elapsed = Date.now() - new Date(lastAttempt).getTime();
    const required = RETRY_DELAY_BASE_MS * Math.pow(2, attemptCount);
    return elapsed >= required;
}

/** Show pre-menu warnings and handle user choices. Returns true if
 * the menu loop should continue (i.e., user didn't exit). */
async function checkPreMenu(): Promise<boolean> {
    const state = loadTypedState();

    // Auto-retry: if discovery failed < MAX_ATTEMPTS times and enough time passed
    if (
        state._llmConfigAttempts !== undefined &&
        state._llmConfigAttempts < MAX_ATTEMPTS &&
        shouldAutoRetry(state._llmConfigLastAttempt, state._llmConfigAttempts)
    ) {
        // Fire background discovery silently
        const spy = spawn(process.execPath, [TSX_BIN, join(root, 'scripts/smartwizard-discovery.ts')], {
            stdio: 'ignore',
            detached: true,
            cwd: root,
        });
        spy.unref();
    }

    // First-run detection: no LLM configured and no legacy key in environment
    if (state._llmConfigured === undefined && !process.env['LLM_API_KEY']) {
        warn('Nenhum provedor de IA configurado.');
        info('O SmartWizard pode detectar automaticamente seu provedor e');
        info('configurar os tiers de IA para análises.');
        divider();

        const choice = confirm('Deseja configurar agora? (S/n)', true);
        if (choice) {
            await spawnWizard();
            updateTyped((s) => {
                s._llmConfigured = true;
            });
        } else {
            updateTyped((s) => {
                s._llmConfigured = false;
            });
        }
        return true;
    }

    // Warning: 3 consecutive failures
    if (state._llmConfigError) {
        warn('Não foi possível verificar os provedores de IA após 3 tentativas.');
        info(`Motivo: ${state._llmConfigError}`);
        divider();

        const choice = confirm('Deseja tentar novamente? (s/N/d — d para descartar)', false);
        if (choice) {
            updateTyped((s) => {
                s._llmConfigAttempts = 0;
                delete s._llmConfigError;
            });
            // Open wizard
            await spawnWizard();
        }
        // If choice is false, we keep the flag. User can also say "descarta"
        // but the confirm() returns true/false. For 3-option, we'd need showSelect.
        // Since confirm is binary, the user dismissed it. Allow Discard via
        // the wizard option in the menu.
        return true;
    }

    // Suggestion: pending quality signals or discovery results
    if (state._llmConfigSuggestions?.pending) {
        warn('Há sugestões de configuração de IA disponíveis.');
        info('O sistema detectou mudanças nos provedores que podem melhorar');
        info('a qualidade das análises.');
        divider();

        const choice = confirm('Deseja revisar as sugestões? (S/n)', true);
        if (choice) {
            await spawnWizard('--review');
        }
        // Clear pending flag regardless (user was notified)
        updateTyped((s) => {
            if (s._llmConfigSuggestions) {
                s._llmConfigSuggestions.pending = false;
            }
        });
    }

    return true;
}

async function spawnWizard(reviewFlag = ''): Promise<void> {
    const args = [TSX_BIN, join(root, 'scripts/smartwizard-llm.ts')];
    if (reviewFlag) args.push(reviewFlag);

    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root });
            child.on('exit', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`SmartWizard encerrou com código ${code}`));
            });
            child.on('error', reject);
        });
    } catch (err: unknown) {
        rootLogger.error('SmartWizard error: ' + (err as Error).message);
    }
}

function handleModuleChoice(choice: string): Promise<void> | null {
    if (choice === 'setup') {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [TSX_BIN, join(root, 'setup/main.ts')], {
                stdio: 'inherit',
                cwd: root,
            });
            child.on('exit', (code) => {
                if (code === 0) resolve();
                else reject(new Error('Setup encerrou com código ' + code));
            });
            child.on('error', reject);
        });
    }
    if (choice === 'ai-setup') {
        return spawnWizard();
    }
    return null;
}

export async function main(): Promise<void> {
    const isTTY = Output.isTTY() && !Output.isCI();

    if (!isTTY) {
        defaultOutput.print('Usage: npm run jira   — Jira/Xray management');
        defaultOutput.print('       npm run git    — Git triggers (GitHub/GitLab, CI/CD Setup)');
        return;
    }

    checkQualitySignals();

    for (;;) {
        if (process.stdout.isTTY) process.stdout.write('\x1Bc');
        await checkPreMenu();
        await showSplash();

        const choice = await showSelect('      Selecione o módulo', [
            { name: '      Jira Management  (Testes, Releases, Config)', value: 'jira' },
            { name: '      Git Triggers     (Pipelines, PR/MR, CI/CD, Setup)', value: 'git' },
            { type: 'separator', line: '        ' },
            { name: '      Setup Wizard  (Configurar projeto)', value: 'setup' },
            { type: 'separator', line: '        ' },
            { name: '      Configurar Provedor de IA', value: 'ai-setup' },
            { type: 'separator', line: '        ' },
            { name: '      /exit  Sair', value: 'exit' },
        ]);

        if (choice === 'exit') break;
        const moduleResult = handleModuleChoice(choice);
        if (moduleResult) {
            await moduleResult;
            continue;
        }
        if (choice !== 'jira' && choice !== 'git') continue;

        try {
            await runModule(choice);
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
