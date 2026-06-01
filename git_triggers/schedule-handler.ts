/** Scheduled tasks — run metrics, flakiness analysis, flaky auto-actions, and generate scheduled reports. */
import { print, success, warn, info, prompt, printError, withSpinner } from '../shared/prompt';
import type { GitProvider, StateContainer } from '../shared/types';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { executeFlakyActions } from '../shared/flaky-auto-actions';
import { openWithFallback } from '../shared/open';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import Config from '../shared/config';
import JiraClient from '../shared/jira-client';
import { writeReport } from '../shared/temp-dir';
import {
    currentProvider,
    currentProjectName,
    pushHistory,
    displayProjects,
    displayRecentPipelines,
    createManagerForProject,
    getProviderForProject,
    setCurrentProjectName,
    setProjectId,
    setManager,
    getProjects,
} from './session-state';
import { update as updateState } from '../shared/state';

export async function handleListSchedules(m: GitProvider): Promise<void> {
    if (currentProvider !== 'gitlab') {
        warn('Opção não disponivel para GitHub.');
        return;
    }
    try {
        const schedules = await withSpinner('Buscando schedules...', () => m.getSchedules());
        if (schedules && schedules.length > 0) {
            info('Schedules encontrados:');
            schedules.forEach((s) => {
                const line =
                    '  ID: ' +
                    (s.id as string) +
                    '  ' +
                    ((s.description as string) || 'sem descrição') +
                    '  (proxima execução: ' +
                    ((s.next_run_at as string) || 'N/A') +
                    ')';
                print(line);
            });
            pushHistory('list-schedules', schedules.length + ' schedules', 'ok');
        } else {
            warn('Nenhum schedule encontrado.');
            pushHistory('list-schedules', 'vazio', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar schedules', err);
        pushHistory('list-schedules', 'erro', 'error');
    }
}

export async function handleRunSchedule(m: GitProvider): Promise<void> {
    if (currentProvider !== 'gitlab') {
        warn('Opção não disponivel para GitHub.');
        return;
    }
    const scheduleId = prompt('ID do schedule');
    try {
        const result = await withSpinner('Disparando schedule ' + scheduleId + '...', () => m.runSchedule(scheduleId));
        if (result) {
            success('Schedule disparado: ' + scheduleId);
            pushHistory('schedule-run', scheduleId, 'ok');
        }
    } catch (err) {
        printError('Erro ao disparar schedule', err);
        pushHistory('schedule-run', scheduleId, 'error');
    }
}

export async function handleChangeProject(names: string[]): Promise<void> {
    displayProjects();
    const newChoice = prompt('Escolha um projeto', { hint: '1-' + names.length });
    const newIdx = parseInt(newChoice, 10);
    if (!isNaN(newIdx) && newIdx >= 1 && newIdx <= names.length) {
        const newName = names[newIdx - 1]!;
        setCurrentProjectName(newName);
        setProjectId(getProjects()[newName]!);
        const newManager = createManagerForProject(newName, getProjects()[newName]!);
        setManager(newManager);
        updateState((s: StateContainer) => {
            s.lastProject = newName;
        });
        success('Projeto alterado para: ' + newName + ' (' + getProviderForProject(newName) + ')');
        await displayRecentPipelines(newManager);
        pushHistory('trocar-projeto', newName, 'ok');
    } else {
        warn('Opção inválida.');
    }
}

async function runFlakyAutoActionsForProject(projectName: string, jiraResource: JiraClient): Promise<void> {
    try {
        if (!Config.get('jiraBaseUrl') || !Config.get('jiraPersonalToken')) return;
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        if (projectRuns.length < 5) return;
        const actions = await executeFlakyActions({ runs: projectRuns }, jiraResource, projectName, {
            autoCreateBug: true,
            minTotalRuns: 10,
            dedupSearch: true,
        });
        const bugs = actions.filter((a) => a.action === 'create_bug' || a.action === 'reenable');
        if (bugs.length > 0) {
            success(bugs.length + ' flaky auto-action(s) executada(s) para ' + projectName);
        }
    } catch {
        info('Flaky auto-actions skipping (Jira config or insufficient data).');
    }
}

export async function handleFlakinessDashboard(): Promise<void> {
    try {
        if (!currentProjectName) {
            warn('Nenhum projeto selecionado.');
            return;
        }
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        if (projectRuns.length < 2) {
            warn('Menos de 2 execuções registradas para ' + currentProjectName + '. Execute pipelines primeiro.');
            return;
        }
        const flaky = calculateFlakiness({ runs: projectRuns }, 2);
        if (flaky.length === 0) {
            info('Nenhum teste flaky detectado em ' + currentProjectName + '.');
            return;
        }
        const html = generateFlakinessHtml(flaky, 'Flakiness — ' + currentProjectName);
        const outPath = writeReport('flakiness-' + currentProjectName + '.html', html);
        await openWithFallback(outPath, 'Dashboard de flaky', info);
        pushHistory(
            'flakiness',
            currentProjectName + ' (' + flaky.filter((f: { rate: number }) => f.rate > 0.3).length + ' >30%)',
            'ok',
        );
        if (Config.get('jiraBaseUrl') && Config.get('jiraPersonalToken')) {
            const jiraResource = new JiraClient(
                Config.get('jiraPersonalToken'),
                Config.get('jiraBaseUrl') + '/rest/api/2',
            );
            await runFlakyAutoActionsForProject(currentProjectName, jiraResource);
        }
    } catch (err) {
        printError('Falha ao gerar dashboard de flaky', err);
    }
}
