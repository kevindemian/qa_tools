import { getPrReportConfig, setPrReportConfig } from '../shared/feature-config.js';
import { confirm as promptConfirm, prompt as ask, info, success, title, divider } from '../shared/prompt.js';
import { pushHistory, currentProjectName } from './session-state.js';

export function handlePrReportReconfig(): void {
    title('Configuração do PR Report');

    const projectName = currentProjectName;
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

    pushHistory(
        'pr-report-reconfig',
        'PR Report: ' + (enabled ? 'ativado' : 'desativado') + ', target: ' + validatedTarget,
        'ok',
    );
}
