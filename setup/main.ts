import fs from 'fs';
import path from 'path';
import { ask, askConfirm, title, info, divider } from '../shared/prompt.js';
import { loadTypedState } from '../shared/state.js';
import { detectFramework, extractRepoFromGit } from './detector.js';
import {
    writeProjectsConfig,
    writeDotEnvExample,
    writePrePushHook as writeHookFile,
    writeFeaturesConfig,
} from './config-writer.js';
import { generateCIWorkflow, generateQaPostProcessAction } from './templates/github-ci.js';
import { generateQaPostProcessWorkflow } from './templates/qa-post-process-workflow.js';
import { injectPostProcessJob } from '../shared/ci-injector.js';
import { generateGitLabCI } from './templates/gitlab-ci.js';
import { generatePrePushHook } from './templates/pre-push-hook.js';
import type { SetupContext, Framework, GitProvider } from './context.js';
import { main as configureLlm } from '../scripts/smartwizard-llm.js';

function detectGitProvider(): GitProvider {
    try {
        const projectRoot = path.resolve(import.meta.dirname, '..');
        const gitConfig = fs.readFileSync(path.join(projectRoot, '.git/config'), 'utf8');
        if (gitConfig.includes('github.com')) return 'github';
        if (gitConfig.includes('gitlab.com')) return 'gitlab';
    } catch {
        /* not a git repo — default to github */
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

async function gatherSetupContext(): Promise<SetupContext> {
    const state = loadTypedState();
    const lastProject = state.lastProject || '';
    const detection = detectFramework();

    info('Framework detectado: ' + detection.framework);
    info('Comando de teste: ' + detection.testCmd);

    const gitInfo = extractRepoFromGit();
    const projectName = await promptProjectName(gitInfo.repo || 'meu-projeto', lastProject);
    const gitProvider = gitInfo.owner ? detectGitProvider() : await promptGitProvider();
    const repoOwner = gitInfo.owner || (await ask('Repo owner (user/org)', { default: '' }));
    const repoName = gitInfo.repo || projectName;

    const framework = (await ask('Test framework [' + detection.framework + ']', {
        default: detection.framework,
    })) as Framework;
    const testCmd = await ask('Test command [' + detection.testCmd + ']', { default: detection.testCmd });
    const installCmd = await ask('Install command [' + detection.installCmd + ']', { default: detection.installCmd });
    const testReportPath = await ask('Test report path [' + detection.ctrfReportPath + ']', {
        default: detection.ctrfReportPath,
        hint: 'Path to CTRF/JUnit/Mochawesome report files',
    });
    const artifactName = await ask('Artifact name [test-report]', {
        default: 'test-report',
        hint: 'Name for uploaded test report artifact (DataHub uses this)',
    });
    const nodeVersion = await ask('Node version [' + detection.nodeVersion + ']', { default: detection.nodeVersion });

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
        detection.ctrfSource === 'missing' &&
        (features.qualityGate || features.flakinessDashboard || features.aiFailureAnalysis)
    ) {
        info(
            '⚠️  Nenhum reporter CTRF detectado. O pipeline gerado usará o comando de teste existente,' +
                ' mas o PR report pode não ter dados de teste completos.',
        );
        info('   Considere adicionar um reporter CTRF ao seu framework de testes.');
        divider();
    }

    return {
        projectName,
        framework,
        testReportPath,
        artifactName,
        ctrfReportPath: testReportPath, // backward compatibility
        ctrfSource: detection.ctrfSource,
        nodeVersion,
        installCmd,
        testCmd,
        gitProvider,
        repoOwner,
        repoName,
        workflowDir: gitProvider === 'github' ? '.github/workflows' : '.gitlab-ci.yml',
        features,
    };
}

function addUnique(list: string[], value: string): void {
    if (!list.includes(value)) list.push(value);
}

function generateGitHubWorkflows(ctx: SetupContext): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];
    const workflowDir = path.resolve(process.cwd(), '.github/workflows');
    fs.mkdirSync(path.resolve(workflowDir), { recursive: true });
    const wfPath = path.join(workflowDir, 'ci.yml');
    const ppWfPath = path.join(workflowDir, 'qa-post-process.yml');
    const actionsDir = path.resolve(process.cwd(), '.github/actions/qa-post-process');
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

async function generateGitLabCIFile(ctx: SetupContext): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];
    const wfPath = path.resolve(process.cwd(), '.gitlab-ci.yml');
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

function generatePrePushHookFiles(ctx: SetupContext): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];
    const hookResult = writeHookFile(ctx);
    created.push(...hookResult.filesCreated);
    skipped.push(...hookResult.filesSkipped);
    const hookDir = path.resolve(process.cwd(), '.git', 'hooks');
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

async function generateConfigFiles(ctx: SetupContext): Promise<{ created: string[]; skipped: string[] }> {
    const created: string[] = [];
    const skipped: string[] = [];

    const providerResult =
        ctx.gitProvider === 'github' ? generateGitHubWorkflows(ctx) : await generateGitLabCIFile(ctx);
    created.push(...providerResult.created);
    skipped.push(...providerResult.skipped);

    const configResult = writeProjectsConfig(ctx);
    created.push(...configResult.filesCreated);
    skipped.push(...configResult.filesSkipped);

    const envResult = writeDotEnvExample(ctx);
    created.push(...envResult.filesCreated);
    skipped.push(...envResult.filesSkipped);

    const featuresResult = writeFeaturesConfig(ctx);
    created.push(...featuresResult.filesCreated);
    skipped.push(...featuresResult.filesSkipped);

    if (ctx.features.prePushHook) {
        const hookResult = generatePrePushHookFiles(ctx);
        created.push(...hookResult.created);
        skipped.push(...hookResult.skipped);
    }

    return { created, skipped };
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

async function main(): Promise<void> {
    title('QA Tools — Auto Setup');

    const ctx = await gatherSetupContext();

    divider();
    info('Gerando arquivos...\n');

    const { created, skipped } = await generateConfigFiles(ctx);
    printSetupSummary(created, skipped);

    divider();
    const configureLlmNow = await askConfirm('Configurar provedores LLM agora?', true);
    if (configureLlmNow) {
        await configureLlm();
    }
}

export { main };
