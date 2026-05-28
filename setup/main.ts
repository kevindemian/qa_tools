import fs from 'fs';
import path from 'path';
import { ask, askConfirm, title, info, divider } from '../shared/prompt';
import { detectFramework, extractRepoFromGit } from './detector';
import { writeProjectsConfig, writeDotEnvExample, writePrePushHook as writeHookFile } from './config-writer';
import { generateGitHubActions } from './templates/github-ci';
import { generateGitLabCI } from './templates/gitlab-ci';
import { generatePrePushHook } from './templates/pre-push-hook';
import type { SetupContext, Framework, GitProvider } from './context';

function detectGitProvider(): GitProvider {
    try {
        const gitConfig = fs.readFileSync(process.cwd() + '/.git/config', 'utf8');
        if (gitConfig.includes('github.com')) return 'github';
        if (gitConfig.includes('gitlab.com')) return 'gitlab';
    } catch {
        // not a git repo
    }
    return 'github';
}

async function promptGitProvider(): Promise<GitProvider> {
    const answer = await ask('Git provider', { default: 'github', hint: 'github ou gitlab' });
    return answer.trim().toLowerCase() === 'gitlab' ? 'gitlab' : 'github';
}

async function promptProjectName(detected: string): Promise<string> {
    const answer = await ask('Project name', { default: detected });
    return answer.trim() || detected;
}

async function main(): Promise<void> {
    title('QA Tools — Auto Setup');

    const detection = detectFramework();

    info('Framework detectado: ' + detection.framework);
    info('Comando de teste: ' + detection.testCmd);

    const gitInfo = extractRepoFromGit();
    const projectName = await promptProjectName(gitInfo.repo || 'meu-projeto');
    const gitProvider = gitInfo.owner ? detectGitProvider() : await promptGitProvider();
    const repoOwner = gitInfo.owner || (await ask('Repo owner (user/org)', { default: '' }));
    const repoName = gitInfo.repo || projectName;

    const framework = (await ask('Test framework', { default: detection.framework })) as Framework;
    const testCmd = await ask('Test command', { default: detection.testCmd });
    const installCmd = await ask('Install command', { default: detection.installCmd });
    const ctrfReportPath = await ask('CTRF report path', { default: detection.ctrfReportPath });
    const nodeVersion = await ask('Node version', { default: detection.nodeVersion });

    divider();

    const features = {
        jiraIntegration: await askConfirm('Integrar com Jira (Test Execution, bugs)?', true),
        flakinessDashboard: await askConfirm('Gerar Flakiness Dashboard?', true),
        aiFailureAnalysis: await askConfirm('Análise de falhas com IA?', true),
        prePushHook: await askConfirm('Criar hook pre-push (executa testes antes do push)?', false),
    };

    const ctx: SetupContext = {
        projectName,
        framework,
        ctrfReportPath,
        nodeVersion,
        installCmd,
        testCmd,
        gitProvider,
        repoOwner,
        repoName,
        workflowDir: gitProvider === 'github' ? '.github/workflows' : '.gitlab-ci.yml',
        features,
    };

    divider();
    info('Gerando arquivos...\n');

    const created: string[] = [];
    const skipped: string[] = [];

    if (gitProvider === 'github') {
        const workflowDir = path.resolve(process.cwd(), '.github/workflows');
        fs.mkdirSync(workflowDir, { recursive: true });
        const wfPath = path.join(workflowDir, 'qa.yml');
        const yaml = generateGitHubActions(ctx);
        fs.writeFileSync(wfPath, yaml, 'utf8');
        created.push(wfPath);
    } else {
        const wfPath = path.resolve(process.cwd(), '.gitlab-ci.yml');
        const yaml = generateGitLabCI(ctx);
        if (fs.existsSync(wfPath)) {
            skipped.push(wfPath);
        } else {
            fs.writeFileSync(wfPath, yaml, 'utf8');
            created.push(wfPath);
        }
    }

    const configResult = writeProjectsConfig(ctx);
    created.push(...configResult.filesCreated);
    skipped.push(...configResult.filesSkipped);

    const envResult = writeDotEnvExample(ctx);
    created.push(...envResult.filesCreated);
    skipped.push(...envResult.filesSkipped);

    if (features.prePushHook) {
        const hookResult = writeHookFile(ctx);
        created.push(...hookResult.filesCreated);
        skipped.push(...hookResult.filesSkipped);
        const hookScript = generatePrePushHook(ctx);
        const hookDir = path.resolve(process.cwd(), '.git', 'hooks');
        fs.mkdirSync(hookDir, { recursive: true });
        const hookPath = path.join(hookDir, 'pre-push');
        if (!fs.existsSync(hookPath)) {
            fs.writeFileSync(hookPath, hookScript, 'utf8');
            fs.chmodSync(hookPath, 0o755);
            if (!created.includes(hookPath)) created.push(hookPath);
        } else if (!skipped.includes(hookPath)) {
            skipped.push(hookPath);
        }
    }

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
}

export default { main };
