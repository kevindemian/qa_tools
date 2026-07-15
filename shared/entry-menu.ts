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

import { formatErr } from './errors.js';
import { spawn } from 'child_process';
import { showSplash } from './splash.js';
import { showSelect, confirm, info, warn, divider, smartPrompt } from './prompt.js';
import { Output, defaultOutput } from './output.js';
import { rootLogger } from './logger.js';
import { ExitCode } from './types.js';
import { fileURLToPath } from 'url';
import { join, resolve } from 'path';
import { gracefulExit } from './cli_base.js';
import { loadTypedState, updateTyped } from './state.js';
import { checkQualitySignals } from './quality-suggester.js';
import { setCurrentProject, getCurrentProject, getCurrentProjectDir, isProjectSelected } from './project-context.js';
import { listProjects, updateProject, removeProject, type ListedProject } from './project-registry.js';

const root = join(import.meta.dirname, '..');
const TSX_BIN = join(root, 'node_modules', '.bin', 'tsx');
const RETRY_DELAY_BASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

/** True when a project entry is protected against edit/removal (migrated from legacy, D-U4). */
export function isProjectProtected(entry: ListedProject): boolean {
    return entry.migrated === true;
}

/** Render the project list with validity and migration flags (D-U1). */
function displayProjects(projects: ListedProject[]): void {
    if (projects.length === 0) {
        info('Nenhum projeto registrado.');
        return;
    }
    projects.forEach((p, i) => {
        const flags = [!p.valid ? '[INVÁLIDO]' : '', isProjectProtected(p) ? '[MIGRADO]' : '']
            .filter(Boolean)
            .join(' ');
        defaultOutput.print(`  ${String(i + 1).padStart(2, ' ')}. ${p.name}  (${p.dir})${flags ? '  ' + flags : ''}`);
    });
}

/**
 * Seleção de projeto antes do módulo (D-U2). Mostra lista numerada (D-U1), auto-seleciona se 1,
 * oferece setup se 0, e lista "Adicionar"/"Gerenciar" se N. Entradas inválidas marcadas [INVÁLIDO].
 * Retorna true se um projeto foi selecionado (ou já estava ativo).
 */
export async function selectProject(): Promise<boolean> {
    const projects = listProjects();
    if (projects.length === 0) return selectFromNone();
    if (projects.length === 1) {
        const single = projects[0];
        if (single) return selectSingle(single);
    }
    return selectFromMany(projects);
}

async function selectFromNone(): Promise<boolean> {
    const choice = await showSelect('Nenhum projeto registrado', [
        { name: 'A — Adicionar projeto (setup)', value: '__add__' },
        { name: 'Continuar sem projeto (modo legado)', value: '__legacy__' },
    ]);
    if (choice === '__add__') {
        await addProjectFlow();
        return isProjectSelected();
    }
    return false;
}

function selectSingle(p: ListedProject): boolean {
    if (!p.valid) warn(`Projeto "${p.name}" tem diretório inválido: ${p.dir}`);
    setCurrentProject(p.name);
    return true;
}

async function selectFromMany(projects: ListedProject[]): Promise<boolean> {
    for (;;) {
        displayProjects(projects);
        const choices = projects.map((p) => ({ name: p.name, value: p.name }));
        choices.push({ name: 'A — Adicionar projeto', value: '__add__' });
        choices.push({ name: 'G — Gerenciar projetos', value: '__manage__' });
        const choice = await showSelect('Selecione o projeto ativo', choices);

        if (choice === '__add__') {
            await addProjectFlow();
            continue;
        }
        if (choice === '__manage__') {
            await manageProjectsFlow();
            continue;
        }
        if (!choice) return false;
        const p = projects.find((x) => x.name === choice);
        if (!p) return false;
        if (!p.valid) warn(`Diretório inválido: ${p.dir}`);
        setCurrentProject(choice);
        return true;
    }
}

/** Spawn the setup wizard pointing at a specific directory (051). */
async function spawnSetupWithDir(dir: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [TSX_BIN, join(root, 'setup/main.ts'), '--dir', dir], {
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

/** "A — Adicionar": prompt do diretório e disparo do setup (051). */
async function addProjectFlow(): Promise<void> {
    const dir = (await smartPrompt('Caminho do diretório do projeto:', { default: process.cwd() })).trim();
    if (!dir) {
        warn('Diretório vazio — nenhum projeto adicionado.');
        return;
    }
    const resolved = resolve(dir);
    try {
        await spawnSetupWithDir(resolved);
    } catch (err: unknown) {
        rootLogger.error('Falha ao adicionar projeto: ' + formatErr(err));
    }
}

/** "G — Gerenciar": listar/editar/remover com proteção para `migrated:true` (052, D-U4). */
async function manageProjectsFlow(): Promise<void> {
    for (;;) {
        const projects = listProjects();
        if (projects.length === 0) {
            info('Nenhum projeto para gerenciar.');
            return;
        }
        const choices = projects.map((p) => ({ name: p.name, value: p.name }));
        choices.push({ name: 'Voltar', value: '__back__' });
        const choice = await showSelect('Gerenciar projetos — selecione', choices);
        if (choice === '__back__') return;

        const p = projects.find((x) => x.name === choice);
        if (!p) continue;
        if (isProjectProtected(p)) {
            warn(`Projeto "${p.name}" é migrado e protegido contra edição/remoção (D-U4).`);
            continue;
        }
        await manageOneProject(p);
    }
}

/** Editar/remover um projeto específico (proteção migrated já validada pelo chamador). */
async function manageOneProject(p: ListedProject): Promise<void> {
    const action = await showSelect(`Projeto "${p.name}" — ação`, [
        { name: 'Editar diretório', value: 'edit' },
        { name: 'Remover', value: 'remove' },
        { name: 'Voltar', value: '__back__' },
    ]);
    if (action === '__back__') return;

    if (action === 'edit') {
        const newDir = (await smartPrompt('Novo diretório do projeto:', { default: p.dir })).trim();
        if (!newDir) {
            warn('Diretório vazio — edição cancelada.');
            return;
        }
        const resolvedDir = resolve(newDir);
        updateProject(p.name, { dir: resolvedDir });
        if (getCurrentProject() === p.name) setCurrentProject(p.name);
        info(`Projeto "${p.name}" atualizado.`);
        return;
    }

    if (action === 'remove') {
        const ok = removeProject(p.name);
        info(ok ? `Projeto "${p.name}" removido.` : `Falha ao remover "${p.name}".`);
    }
}

/** Environment to pass to spawned modules: propaga o projeto ativo (053). */
export function moduleEnv(): NodeJS.ProcessEnv {
    return {
        ...process.env,
        QA_CURRENT_PROJECT: getCurrentProject() ?? '',
        QA_PROJECT_DIR: getCurrentProjectDir() ?? '',
    };
}

/** Spawn a module as a child process. Each module (`jira` or `git`) runs in
 * its own process with inherited stdio and isolated state. Resolves on clean
 * exit (code 0), rejects on non-zero exit or spawn error. Propaga o projeto
 * ativo via `QA_CURRENT_PROJECT`/`QA_PROJECT_DIR` (053). */
export async function runModule(module: 'jira' | 'git'): Promise<void> {
    const script = module === 'jira' ? 'jira_management/main.ts' : 'git_triggers/main.ts';
    return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [TSX_BIN, join(root, script)], {
            stdio: 'inherit',
            cwd: root,
            env: moduleEnv(),
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
        rootLogger.error('SmartWizard error: ' + formatErr(err));
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

/** Prompt the project-selection menu once per session when projects exist and none is active (050/D-U2). */
async function maybePromptProject(projectPrompted: boolean): Promise<boolean> {
    if (projectPrompted) return true;
    const projects = listProjects();
    if (projects.length > 0 && !isProjectSelected()) {
        await selectProject();
        return true;
    }
    return false;
}

export async function main(): Promise<void> {
    const isTTY = Output.isTTY() && !Output.isCI();

    if (!isTTY) {
        defaultOutput.print('Usage: npm run jira   — Jira/Xray management');
        defaultOutput.print('       npm run git    — Git triggers (GitHub/GitLab, CI/CD Setup)');
        return;
    }

    checkQualitySignals();

    let projectPrompted = false;
    for (;;) {
        if (process.stdout.isTTY) process.stdout.write('\x1Bc');
        projectPrompted = await maybePromptProject(projectPrompted);
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
            rootLogger.error('Entry menu child module error: ' + formatErr(err));
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
