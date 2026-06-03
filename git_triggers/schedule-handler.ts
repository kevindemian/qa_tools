/** Scheduled tasks — run metrics, flakiness analysis, flaky auto-actions, and generate scheduled reports. */
import { print, success, warn, info, prompt, printError, withSpinner } from '../shared/prompt';
import type { GitProvider, StateContainer } from '../shared/types';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { calculateHealthScore } from '../shared/health-score';
import { aggregateDefectTrends, generateDefectTrendHtml } from '../shared/defect-trend';
import { calculateReleaseScore, generateReleaseScoreHtml } from '../shared/release-score';
import { computeAiEffectiveness, generateAiEffectivenessHtml } from '../shared/ai-effectiveness';
import { buildTraceabilityMatrix, generateTraceabilityHtml } from '../shared/traceability-matrix';
import { executeFlakyActions } from '../shared/flaky-auto-actions';
import { openWithFallback } from '../shared/open';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import { compareRuns } from '../shared/run-comparison';
import { analyzeBacklogHealth, generateBacklogHealthHtml } from '../shared/backlog-health';
import { aggregateDefectSeasonality, generateSeasonalityHtml } from '../shared/defect-seasonality';
import { detectSilentRegression, generateSilentRegressionHtml } from '../shared/silent-regression';
import { compareAiVsManual, generateAiComparisonHtml } from '../shared/ai-comparison';
import { computeCrossSquadBenchmark, generateBenchmarkHtml } from '../shared/cross-squad-benchmark';
import { buildDeveloperProfile, generateDeveloperProfileHtml } from '../shared/developer-profile';
import { analyzeSuiteOptimization, generateOptimizationHtml } from '../shared/suite-optimization';
import { buildIncidentReport, generateIncidentReportHtml } from '../shared/incident-report';
import { analyzePipelineImpact, generateImpactAlertHtml } from '../shared/impact-alert';
import { calculatePipelineCost, generatePipelineCostHtml } from '../shared/pipeline-cost';
import { calculateRequirementScores, generateRequirementScoreHtml } from '../shared/requirement-score';
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
        const newName = names[newIdx - 1] as string;
        setCurrentProjectName(newName);
        setProjectId(getProjects()[newName] as string);
        const newManager = createManagerForProject(newName, getProjects()[newName] as string);
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

export async function handleRunComparison(): Promise<void> {
    try {
        if (!currentProjectName) {
            warn('Nenhum projeto selecionado.');
            return;
        }
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        if (projectRuns.length < 2) {
            info('Menos de 2 execuções para comparar.');
            return;
        }
        const runA: import('../shared/metrics').MetricsRun | null = projectRuns[projectRuns.length - 2] ?? null;
        const runB: import('../shared/metrics').MetricsRun | null = projectRuns[projectRuns.length - 1] ?? null;
        if (!runA || !runB) {
            info('Dados insuficientes para comparação.');
            return;
        }
        const comparison = await compareRuns(runA, runB);
        const outPath = writeReport(
            'run-comparison-' + currentProjectName + '.html',
            '<html><body style="font-family:system-ui,sans-serif;padding:2rem">' +
                '<h1>Run Comparison: ' +
                currentProjectName +
                '</h1>' +
                '<p style="color:#6b7280">' +
                runA.timestamp.slice(0, 10) +
                ' vs ' +
                runB.timestamp.slice(0, 10) +
                '</p>' +
                '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1rem">' +
                comparison +
                '</div></body></html>',
        );
        success('Comparação de runs salva: ' + outPath);
        pushHistory(
            'run-comparison',
            currentProjectName + ' (' + runA.timestamp.slice(0, 10) + ' vs ' + runB.timestamp.slice(0, 10) + ')',
            'ok',
        );
    } catch (err) {
        printError('Falha ao comparar runs', err);
    }
}

export function generateWeeklyQualityReport(): void {
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

        const health = calculateHealthScore(store);
        const flaky = calculateFlakiness({ runs: projectRuns }, 2);
        const releaseScore = calculateReleaseScore(
            80,
            health.overall ?? 50,
            health.overall >= 70 ? 'pass' : 'fail',
            70,
            flaky.length > 0
                ? Math.min(100, Math.round((flaky.filter((f) => f.rate > 0.3).length / flaky.length) * 100))
                : 0,
        );
        const defects = aggregateDefectTrends(store.failureClassifications ?? []);
        const matrix = buildTraceabilityMatrix(store);
        const aiResult = computeAiEffectiveness({ records: [] });
        const backlog = analyzeBacklogHealth([]);

        /* Fase 2 dashboards */
        const seasonality = aggregateDefectSeasonality(store.failureClassifications ?? []);
        const testDurationMap: Record<string, number[]> = {};
        for (const run of store.runs) {
            for (const t of run.tests) {
                if (t.state === 'skipped') continue;
                if (!testDurationMap[t.title]) testDurationMap[t.title] = [];
                testDurationMap[t.title]?.push(t.duration);
            }
        }
        const regression = detectSilentRegression(testDurationMap);
        const devProfile = buildDeveloperProfile(
            (store.failureClassifications ?? []).map((fc) => ({
                testTitle: fc.testTitle,
                category: fc.category,
                timestamp: fc.timestamp,
            })),
        );
        const aiComparison = compareAiVsManual([]);
        const flatTests = store.runs.flatMap((r) =>
            r.tests.map((t) => ({ title: t.title, duration: t.duration, flakiness: 0 })),
        );
        const optimization = analyzeSuiteOptimization(flatTests);

        /* Cross-squad benchmark: aggregate health across all projects */
        const projectNames = [...new Set(store.runs.map((r) => r.project))];
        const projectBenchmarks = projectNames.map((name) => {
            const pRuns = store.runs.filter((r) => r.project === name);
            const pHealth = calculateHealthScore({ ...store, runs: pRuns });
            return {
                name,
                healthScore: pHealth.overall,
                grade: pHealth.grade,
                passRate: pHealth.dimensions.passRate.score,
                flakyRate: pHealth.dimensions.flakyRate.score,
                coveragePct: pHealth.dimensions.coverage.score,
                runCount: pRuns.length,
            };
        });
        const benchmark = computeCrossSquadBenchmark(projectBenchmarks);

        /* Fase 3 dashboards */
        const failRate =
            projectRuns.length > 0
                ? Math.round((projectRuns.filter((r) => r.failed > 0).length / projectRuns.length) * 100)
                : 0;

        const uncoveredEpics: string[] = matrix.nodes.filter((n) => n.coverage < 100).map((n) => n.epic);

        const incidentReport = buildIncidentReport(
            failRate,
            regression.regressions.length,
            seasonality.peakDay,
            uncoveredEpics,
            health.overall ?? 100,
        );

        const trendCategories = new Set<string>();
        for (const t of defects.trends ?? []) {
            for (const cat of Object.keys(t.categories)) {
                trendCategories.add(cat);
            }
        }

        const impactAlert = analyzePipelineImpact(
            health.dimensions.passRate.score,
            projectRuns.filter((r) => r.failed > 0).length,
            [...trendCategories].slice(0, 5),
            health.dimensions.coverage.score,
            uncoveredEpics,
        );

        const pipelineCost = calculatePipelineCost(projectRuns);
        const requirementScores = calculateRequirementScores([]);

        const sections: string[] = [];
        sections.push('<h2>Cross-Squad Benchmark</h2>' + generateBenchmarkHtml(benchmark));
        sections.push('<h2>Defect Seasonality</h2>' + generateSeasonalityHtml(seasonality));
        sections.push('<h2>Release Score</h2>' + generateReleaseScoreHtml(releaseScore));
        sections.push('<h2>Defect Trends</h2>' + generateDefectTrendHtml(defects));
        sections.push('<h2>Silent Regression</h2>' + generateSilentRegressionHtml(regression));
        sections.push('<h2>Traceability Matrix</h2>' + generateTraceabilityHtml(matrix));
        sections.push('<h2>AI Effectiveness</h2>' + generateAiEffectivenessHtml(aiResult));
        sections.push('<h2>AI Test Comparison</h2>' + generateAiComparisonHtml(aiComparison));
        sections.push('<h2>Developer Profile</h2>' + generateDeveloperProfileHtml(devProfile));
        sections.push('<h2>Suite Optimization</h2>' + generateOptimizationHtml(optimization));
        sections.push('<h2>Backlog Health</h2>' + generateBacklogHealthHtml(backlog));
        sections.push('<h2>Incident Investigation Report</h2>' + generateIncidentReportHtml(incidentReport));
        sections.push('<h2>Pipeline Impact Alert</h2>' + generateImpactAlertHtml(impactAlert));
        sections.push('<h2>Pipeline Cost Analytics</h2>' + generatePipelineCostHtml(pipelineCost));
        sections.push('<h2>Requirement Quality Score</h2>' + generateRequirementScoreHtml(requirementScores));

        const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Weekly Quality Report — ' +
            currentProjectName +
            '</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:2rem}section{border:1px solid #e5e7eb;border-radius:8px;padding:1.5rem;margin-bottom:1.5rem}</style></head><body>' +
            '<h1>Weekly Quality Report — ' +
            currentProjectName +
            '</h1><p style="color:#6b7280">Generated: ' +
            new Date().toISOString().slice(0, 10) +
            '</p>' +
            sections.join('') +
            '</body></html>';

        const outPath = writeReport('weekly-quality-' + currentProjectName + '.html', html);
        success('Weekly quality report saved: ' + outPath);
        pushHistory('weekly-quality-report', currentProjectName, 'ok');
    } catch (err) {
        printError('Falha ao gerar relatório semanal de qualidade', err);
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
                Config.get('jiraMode'),
            );
            await runFlakyAutoActionsForProject(currentProjectName, jiraResource);
        }
    } catch (err) {
        printError('Falha ao gerar dashboard de flaky', err);
    }
}
