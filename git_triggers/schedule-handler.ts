import { print, success, warn, info, prompt, printError, withSpinner } from '../shared/prompt';
import type { GitProvider, StateContainer } from '../shared/types';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
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
        const newName = names[newIdx - 1];
        setCurrentProjectName(newName);
        setProjectId(getProjects()[newName]);
        const newManager = createManagerForProject(newName, getProjects()[newName]);
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

export function handleFlakinessDashboard(): void {
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
    success('Dashboard gerado: ' + outPath);
    pushHistory(
        'flakiness',
        currentProjectName + ' (' + flaky.filter((f: { rate: number }) => f.rate > 0.3).length + ' >30%)',
        'ok',
    );
}
