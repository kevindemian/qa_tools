import fs from 'fs';
import path from 'path';
import { ask, askConfirm, title, info, divider } from '../shared/prompt.js';
import { loadTypedState } from '../shared/state.js';
import { detectFramework, extractRepoFromGit } from './detector.js';
import { writeDotEnvExample, writePrePushHook as writeHookFile, writeFeaturesConfig } from './config-writer.js';
import { addProject } from '../shared/project-registry.js';
import { writeProjectEnvOverlay } from '../shared/env-loader.js';
import { projectEnvPath } from '../shared/project-paths.js';
import { generateCIWorkflow, generateQaPostProcessAction } from './templates/github-ci.js';
import { generateQaPostProcessWorkflow } from './templates/qa-post-process-workflow.js';
import { injectPostProcessJob } from '../shared/ci-injector.js';
import { generateGitLabCI } from './templates/gitlab-ci.js';
import { generatePrePushHook } from './templates/pre-push-hook.js';
import type { SetupContext, Framework, GitProvider } from './context.js';
import { main as configureLlm } from '../scripts/smartwizard-llm.js';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';

/** Parse `--dir <path>` from argv. Returns the resolved directory, or null when not provided. */
function parseCliDir(argv: string[]): string | null {
    for (const arg of argv) {
        if (arg === '--dir' || arg === '-d') continue;
        if (arg.startsWith('--dir=')) return path.resolve(arg.slice('--dir='.length));
        if (arg.startsWith('-d=')) return path.resolve(arg.slice('-d='.length));
    }
    const idx = argv.findIndex((a) => a === '--dir' || a === '-d');
    if (idx === -1) return null;
    const value = argv[idx + 1];
    if (!value) {
        throw new Error('Opção --dir requer um caminho (ex: --dir /caminho/do/projeto)');
    }
    return path.resolve(value);
}

function detectGitProvider(): GitProvider {
    try {
        const projectRoot = path.resolve(import.meta.dirname, '..');
        const gitConfig = fs.readFileSync(path.join(projectRoot, '.git/config'), 'utf8');
        if (gitConfig.includes('github.com')) return 'github';
        if (gitConfig.includes('gitlab.com')) return 'gitlab';
    } catch (err) {
        rootLogger.debug('detectGitProvider: not a git repo, defaulting to github: ' + getErrorMessage(err));
    }
    return 'github';
}

async function promptGitProvider(): Promise<GitProvider> {
    const def = 'github';
    const answer = await ask('Git provider [' + def + ']', { default: def, hint: 'github ou gitlab' });
    return answer.trim().toLowerCase() === 'gitlab' ? 'gitlab' : 'github';
}

async function promptProjectName(detected: string, existing?: string): Promise<string> {
    const def = existing || detected;
    const answer = await ask('Project name [' + def + ']', { default: def });
    return answer.trim() || def;
}

async function gatherSetupContext(baseDir: string): Promise<SetupContext> {
    const state = loadTypedState();
    const lastProject = state.lastProject || '';
    const packageJsonPath = path.join(baseDir, 'package.json');
    const detection = await detectFramework(packageJsonPath);

    info('Framework detectado: ' + detection.framework);
    info('Comando de teste: ' + detection.testCmd);

    const gitInfo = extractRepoFromGit(baseDir);
    const projectName = await promptProjectName(gitInfo.repo || 'meu-projeto', lastProject);
    const gitProvider = gitInfo.owner ? detectGitProvider() : await promptGitProvider();
    const repoOwner = gitInfo.owner || (await ask('Repo owner (user/org)', { default: '' }));
    const repoName = gitInfo.repo || projectName;

    const framework = (await ask('Test framework [' + detection.framework + ']', {
        default: detection.framework,
    })) as Framework;
    const testCmd = await ask('Test command [' + detection.testCmd + ']', { default: detection.testCmd });
    const installCmd = await ask('Install command [' + detection.installCmd + ']', { default: detection.installCmd });
    const testReportPath = await ask('Test report path [' + detection.testReportPath + ']', {
        default: detection.testReportPath,
        hint: 'Path to CTRF/JUnit/Mochawesome report files',
    });
    const artifactName = await ask('Artifact name [test-report]', {
        default: 'test-report',
        hint: 'Name for uploaded test report artifact (DataHub uses this)',
    });
    const nodeVersion = await ask('Node version [' + detection.nodeVersion + ']', { default: detection.nodeVersion });

    const jiraKey = (await ask('Jira project key (opcional)', { default: '' })).trim();

    divider();

    const prReport = await askConfirm('Habilitar PR Report (relatório pós-CI nos PRs)?', true);
    const defaultTarget = gitProvider === 'github' ? 'github-actions' : 'gitlab-ci';
    let prReportPublishTarget: string;
    if (prReport) {
        const answer = await ask('Target de publicação [' + defaultTarget + ']', {
            default: defaultTarget,
            hint: 'github-actions | gitlab-ci',
        });
        prReportPublishTarget = answer.trim().toLowerCase() || defaultTarget;
    } else {
        prReportPublishTarget = 'github-actions';
    }

    const features = {
        qualityGate: await askConfirm('Habilitar Quality Gate (bloqueio de PR por qualidade)?', true),
        flakinessDashboard: await askConfirm('Gerar Flakiness Dashboard?', true),
        aiFailureAnalysis: await askConfirm('Análise de falhas com IA?', true),
        prePushHook: await askConfirm('Criar hook pre-push (executa testes antes do push)?', false),
        prReport,
        prReportPublishTarget,
    };

    if (
        detection.testReportSource === 'missing' &&
        (features.qualityGate || features.flakinessDashboard || features.aiFailureAnalysis)
    ) {
        info(
            '⚠️  Nenhum reporter de teste detectado. O pipeline gerado usará o comando de teste existente,' +
                ' mas o PR report pode não ter dados de teste completos.',
        );
        info('   Considere adicionar um reporter (CTRF, JUnit, etc.) ao seu framework de testes.');
        divider();
    }

    return {
        projectName,
        framework,
        testReportPath,
        artifactName,
        testReportSource: detection.testReportSource,
        nodeVersion,
        installCmd,
        testCmd,
        gitProvider,
        repoOwner,
        repoName,
        jiraKey,
        workflowDir: gitProvider === 'github' ? '.github/workflows' : '.gitlab-ci.yml',
        features,
    };
}

function addUnique(list: string[], value: string): void {
    if (!list.includes(value)) list.push(value);
}

function generateGitHubWorkflows(ctx: SetupContext, baseDir: string): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];
    const workflowDir = path.resolve(baseDir, '.github/workflows');
    fs.mkdirSync(path.resolve(workflowDir), { recursive: true });
    const wfPath = path.join(workflowDir, 'ci.yml');
    const ppWfPath = path.join(workflowDir, 'qa-post-process.yml');
    const actionsDir = path.resolve(baseDir, '.github/actions/qa-post-process');
    fs.mkdirSync(path.resolve(actionsDir), { recursive: true });
    const actionPath = path.join(actionsDir, 'action.yml');

    if (ctx.features.prReport) {
        fs.writeFileSync(path.resolve(ppWfPath), generateQaPostProcessWorkflow(ctx), 'utf8');
        addUnique(created, ppWfPath);
        fs.writeFileSync(path.resolve(actionPath), generateQaPostProcessAction(), 'utf8');
        addUnique(created, actionPath);
    }

    if (fs.existsSync(path.resolve(wfPath))) {
        const existing = fs.readFileSync(path.resolve(wfPath), 'utf8');
        const updated = injectPostProcessJob(existing, ctx.projectName);
        if (updated !== existing) {
            fs.writeFileSync(path.resolve(wfPath), updated, 'utf8');
            info('Job post-process adicionado ao ci.yml existente (conteúdo preservado).');
            addUnique(created, wfPath);
        } else {
            info('ci.yml já contém post-process — sem alterações.');
            skipped.push(wfPath);
        }
    } else {
        fs.writeFileSync(path.resolve(wfPath), generateCIWorkflow(ctx), 'utf8');
        addUnique(created, wfPath);
    }

    return { created, skipped };
}

async function generateGitLabCIFile(
    ctx: SetupContext,
    baseDir: string,
): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];
    const wfPath = path.resolve(baseDir, '.gitlab-ci.yml');
    const yaml = generateGitLabCI(ctx);

    if (fs.existsSync(path.resolve(wfPath))) {
        const shouldOverwrite = await askConfirm('.gitlab-ci.yml já existe. Sobrescrever?', false);
        if (shouldOverwrite) {
            fs.writeFileSync(path.resolve(wfPath), yaml, 'utf8');
            created.push(wfPath);
        } else {
            skipped.push(wfPath);
        }
    } else {
        fs.writeFileSync(path.resolve(wfPath), yaml, 'utf8');
        created.push(wfPath);
    }

    return { created, skipped };
}

function generatePrePushHookFiles(ctx: SetupContext, baseDir: string): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];
    const hookResult = writeHookFile(ctx, baseDir);
    created.push(...hookResult.filesCreated);
    skipped.push(...hookResult.filesSkipped);
    const hookDir = path.resolve(baseDir, '.git', 'hooks');
    fs.mkdirSync(path.resolve(hookDir), { recursive: true });
    const hookPath = path.join(hookDir, 'pre-push');
    if (!fs.existsSync(path.resolve(hookPath))) {
        fs.writeFileSync(path.resolve(hookPath), generatePrePushHook(ctx), 'utf8');
        fs.chmodSync(path.resolve(hookPath), 0o700);
        addUnique(created, hookPath);
    } else if (!skipped.includes(hookPath)) {
        skipped.push(hookPath);
    }
    return { created, skipped };
}

async function generateConfigFiles(
    ctx: SetupContext,
    baseDir: string,
): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];

    const providerResult =
        ctx.gitProvider === 'github' ? generateGitHubWorkflows(ctx, baseDir) : await generateGitLabCIFile(ctx, baseDir);
    created.push(...providerResult.created);
    skipped.push(...providerResult.skipped);

    const entryResult = registerProject(ctx, baseDir);
    created.push(...entryResult.created);
    skipped.push(...entryResult.skipped);

    const envResult = writeDotEnvExample(ctx, baseDir);
    created.push(...envResult.filesCreated);
    skipped.push(...envResult.filesSkipped);

    const featuresResult = writeFeaturesConfig(ctx, baseDir);
    created.push(...featuresResult.filesCreated);
    skipped.push(...featuresResult.filesSkipped);

    if (ctx.features.prePushHook) {
        const hookResult = generatePrePushHookFiles(ctx, baseDir);
        created.push(...hookResult.created);
        skipped.push(...hookResult.skipped);
    }

    return { created, skipped };
}

/**
 * Register the project in the XDG registry (single source of truth, D2) and write its per-project
 * `.env` overlay (D-E1/D-E3). Replaces the legacy dual-write to `config/projects.json` (T1).
 * Idempotent: `addProject` upserts by name.
 */
function registerProject(ctx: SetupContext, baseDir: string): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];

    const features: string[] = [];
    if (ctx.features.qualityGate) features.push('qualityGate');
    if (ctx.features.flakinessDashboard) features.push('flakinessDashboard');
    if (ctx.features.aiFailureAnalysis) features.push('aiFailureAnalysis');
    if (ctx.features.prePushHook) features.push('prePushHook');
    if (ctx.features.prReport) features.push('prReport');

    const projectId = ctx.repoName;
    const entry: import('../shared/types/project.js').ProjectEntry = {
        name: ctx.projectName,
        dir: baseDir,
        provider: ctx.gitProvider,
        projectId,
        framework: ctx.framework,
        features,
    };
    if (ctx.jiraKey) entry.jiraKey = ctx.jiraKey;

    addProject(entry);
    created.push('registry:' + ctx.projectName);

    writeProjectEnvOverlay(ctx.projectName, entry);
    created.push(projectEnvPathSafe(ctx.projectName));

    return { created, skipped };
}

function projectEnvPathSafe(name: string): string {
    try {
        return projectEnvPath(name);
    } catch {
        return 'registry:' + name + '/.env';
    }
}

function printSetupSummary(created: string[], skipped: string[]): void {
    for (const f of created) {
        info('✅ Criado: ' + path.relative(process.cwd(), f));
    }
    for (const f of skipped) {
        info('⏭️  Ignorado (já existe): ' + path.relative(process.cwd(), f));
    }

    divider();
    info('Setup concluído!');
    info('Próximos passos:');
    info('1. Revise os arquivos gerados');
    if (created.length > 0) {
        info('2. git add . && git commit -m "chore: add QA Tools setup"');
    }
    info('3. Copie .env.example para .env e preencha as credenciais');
    info('4. Rode: npx tsx setup/main.ts para reconfigurar');
    info('');
    info('Dica: configure seus provedores LLM com:');
    info('  npx tsx scripts/smartwizard-llm.ts');
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
    title('QA Tools — Auto Setup');

    const dirArg = parseCliDir(args);
    const baseDir = dirArg ?? process.cwd();
    if (!fs.existsSync(baseDir)) {
        throw new Error('Diretório --dir inválido (não existe): ' + baseDir);
    }

    const ctx = await gatherSetupContext(baseDir);

    divider();
    info('Gerando arquivos...\n');

    const { created, skipped } = await generateConfigFiles(ctx, baseDir);
    printSetupSummary(created, skipped);

    divider();
    const configureLlmNow = await askConfirm('Configurar provedores LLM agora?', true);
    if (configureLlmNow) {
        await configureLlm();
    }
}

export { main, parseCliDir };
