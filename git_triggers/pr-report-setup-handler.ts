import fs from 'node:fs';
import path from 'node:path';
import { getPrReportConfig, setPrReportConfig } from '../shared/feature-config.js';
import { confirm as promptConfirm, prompt as ask, info, success, warn, title, divider } from '../shared/ui/prompt.js';
import { pushHistory } from './session-state.js';
import { getCurrentProject } from '../shared/project-context.js';
import { generatePostProcessWorkflowYaml, injectPostProcessJob } from '../shared/ci/ci-injector.js';

export function handlePrReportReconfig(): void {
    title('Configuração do PR Report');

    const projectName = getCurrentProject() ?? '';
    if (!projectName) {
        info('Nenhum projeto selecionado. Use "Trocar de projeto" primeiro.');
        return;
    }

    const currentConfig = getPrReportConfig(projectName);
    const currentEnabled = currentConfig.enabled;
    const currentTarget = currentConfig.publishTarget;

    info('Configuração atual:');
    info('  Habilitado: ' + (currentEnabled ? 'Sim' : 'Não'));
    info('  Target:     ' + currentTarget);
    divider();

    const enabled = promptConfirm('Habilitar PR Report?', currentEnabled);
    const publishTarget = enabled
        ? ask('Target de publicação [' + currentTarget + ']', {
              default: currentTarget,
              hint: 'github-actions | gitlab-ci',
          })
              .trim()
              .toLowerCase() || currentTarget
        : currentTarget;

    const validatedTarget =
        publishTarget === 'github-actions' || publishTarget === 'gitlab-ci' ? publishTarget : 'github-actions';

    const skipAi = enabled
        ? promptConfirm('Pular análise de falhas (AI)?', currentConfig.skipAi ?? false)
        : (currentConfig.skipAi ?? false);
    const skipQuality = enabled
        ? promptConfirm('Pular quality gate?', currentConfig.skipQuality ?? false)
        : (currentConfig.skipQuality ?? false);
    const skipFlaky = enabled
        ? promptConfirm('Pular dashboard de flaky?', currentConfig.skipFlaky ?? false)
        : (currentConfig.skipFlaky ?? false);

    setPrReportConfig(projectName, {
        enabled,
        publishTarget: validatedTarget,
        skipAi,
        skipQuality,
        skipFlaky,
    });
    success('Configuração do PR Report salva em config/features.json.');

    /* ── Generate CI files (only when enabled + github-actions) ────────────── */

    if (enabled && validatedTarget === 'github-actions') {
        _generateCiFiles(projectName);
    } else if (enabled && validatedTarget !== 'github-actions') {
        info('Target diferente de GitHub Actions — CI files não gerados.');
    } else {
        info('PR Report desabilitado — CI files mantidos como estão.');
    }

    pushHistory(
        'pr-report-reconfig',
        'PR Report: ' + (enabled ? 'ativado' : 'desativado') + ', target: ' + validatedTarget,
        'ok',
    );
}

/* ── Internal: CI file generation ──────────────────────────────────────── */

function _generateCiFiles(projectName: string): void {
    const workflowDir = path.resolve(process.cwd(), '.github/workflows');
    const ppWfPath = path.join(workflowDir, 'qa-post-process.yml');
    const ciPath = path.join(workflowDir, 'ci.yml');

    // 1. Generate reusable workflow
    fs.mkdirSync(path.resolve(workflowDir), { recursive: true });
    const yaml = generatePostProcessWorkflowYaml({ projectName });
    fs.writeFileSync(path.resolve(ppWfPath), yaml, 'utf8');
    success('Workflow gerado: .github/workflows/qa-post-process.yml');

    // 2. Inject post-process job into ci.yml (preserving existing content)
    if (fs.existsSync(path.resolve(ciPath))) {
        const existing = fs.readFileSync(path.resolve(ciPath), 'utf8');
        const updated = injectPostProcessJob(existing, projectName);
        if (updated !== existing) {
            fs.writeFileSync(path.resolve(ciPath), updated, 'utf8');
            success('Job post-process injetado em ci.yml (conteúdo existente preservado).');
        } else {
            info('ci.yml já contém job post-process — sem alterações.');
        }
    } else {
        warn(
            'ci.yml não encontrado em .github/workflows/. Execute o Setup Wizard completo ou crie o workflow manualmente.',
        );
    }
}
