/** Scheduled tasks — run metrics, flakiness analysis, flaky auto-actions, and generate scheduled reports. */
import { print, success, warn, info, prompt, printError, withSpinner } from '../shared/prompt.js';
import type { GitProvider, StateContainer } from '../shared/types.js';
import { loadMetrics, calculateFlakiness } from '../shared/metrics.js';
import { calculateHealthScore } from '../shared/health-score.js';
import { aggregateDefectTrends, generateDefectTrendHtml } from '../shared/defect-trend.js';
import { calculateReleaseScore, generateReleaseScoreHtml } from '../shared/release-score.js';
import { computeAiEffectiveness, generateAiEffectivenessHtml } from '../shared/ai-effectiveness.js';
import { buildTraceabilityMatrix, generateTraceabilityHtml } from '../shared/traceability-matrix.js';

import { openWithFallback } from '../shared/open.js';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard.js';
import { analyzeBacklogHealth, generateBacklogHealthHtml } from '../shared/backlog-health.js';
import { aggregateDefectSeasonality, generateSeasonalityHtml } from '../shared/defect-seasonality.js';
import { detectSilentRegression, generateSilentRegressionHtml } from '../shared/silent-regression.js';
import { compareAiVsManual, generateAiComparisonHtml } from '../shared/ai-comparison.js';
import { computeCrossSquadBenchmark, generateBenchmarkHtml } from '../shared/cross-squad-benchmark.js';
import { buildDeveloperProfile, generateDeveloperProfileHtml } from '../shared/developer-profile.js';
import { analyzeSuiteOptimization, generateOptimizationHtml } from '../shared/suite-optimization.js';
import { buildIncidentReport, generateIncidentReportHtml } from '../shared/incident-report.js';
import { analyzePipelineImpact, generateImpactAlertHtml } from '../shared/impact-alert.js';
import { calculatePipelineCost, generatePipelineCostHtml } from '../shared/pipeline-cost.js';
import { calculateRequirementScores, generateRequirementScoreHtml } from '../shared/requirement-score.js';
import { generateGitMetricsRuns, generateGitFailureClassifications } from '../shared/git-metrics-adapter.js';
import { runQualityGate, formatQualityGateText } from '../shared/quality-gate.js';

import { writeReport } from '../shared/temp-dir.js';
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
} from './session-state.js';
import { update as updateState } from '../shared/state.js';

export async function handleListSchedules(m: GitProvider): Promise<void> {
    if (currentProvider !== 'gitlab') {
        warn('Opção não disponivel para GitHub.');
        return;
    }
    try {
        const schedules = await withSpinner('Buscando schedules...', () => m.getSchedules());
        if (schedules.length > 0) {
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
        await withSpinner('Disparando schedule ' + scheduleId + '...', () => m.runSchedule(scheduleId));
        success('Schedule disparado: ' + scheduleId);
        pushHistory('schedule-run', scheduleId, 'ok');
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
            s['lastProject'] = newName;
        });
        success('Projeto alterado para: ' + newName + ' (' + getProviderForProject(newName) + ')');
        await displayRecentPipelines(newManager);
        pushHistory('trocar-projeto', newName, 'ok');
    } else {
        warn('Opção inválida.');
    }
}

export function generateWeeklyQualityReport(): void {
    try {
        if (!currentProjectName) {
            warn('Nenhum projeto selecionado.');
            return;
        }
        const store = loadMetrics();
        let projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        let failureClassifications = store.failureClassifications ?? [];
        let usingGitFallback = false;

        if (projectRuns.length < 2) {
            info('Sem dados de pipeline — tentando fallback para git history...');
            const gitRuns = generateGitMetricsRuns({ projectName: currentProjectName });
            if (gitRuns.length >= 2) {
                projectRuns = gitRuns;
                failureClassifications = generateGitFailureClassifications({ projectName: currentProjectName });
                usingGitFallback = true;
                info('Usando ' + gitRuns.length + ' runs derivados do git history.');
            } else {
                warn('Menos de 2 execuções registradas. Execute pipelines primeiro.');
                return;
            }
        }

        const effectiveStore = usingGitFallback ? { ...store, runs: projectRuns, failureClassifications } : store;

        const health = calculateHealthScore(effectiveStore);
        const flaky = calculateFlakiness({ runs: projectRuns }, 2);
        const releaseScore = calculateReleaseScore(
            80,
            health.overall,
            health.overall >= 70 ? 'pass' : 'fail',
            70,
            flaky.length > 0
                ? Math.min(100, Math.round((flaky.filter((f) => f.rate > 0.3).length / flaky.length) * 100))
                : 0,
        );
        const defects = aggregateDefectTrends(failureClassifications);
        const matrix = buildTraceabilityMatrix(effectiveStore);
        const aiResult = computeAiEffectiveness({ records: [] });
        const backlog = analyzeBacklogHealth([]);

        /* Fase 2 dashboards */
        const seasonality = aggregateDefectSeasonality(failureClassifications);
        const testDurationMap: Record<string, number[]> = {};
        for (const run of effectiveStore.runs) {
            for (const t of run.tests) {
                if (t.state === 'skipped') continue;
                if (!testDurationMap[t.title]) testDurationMap[t.title] = [];
                testDurationMap[t.title]?.push(t.duration);
            }
        }
        const regression = detectSilentRegression(testDurationMap);
        const devProfile = buildDeveloperProfile(
            failureClassifications.map((fc) => ({
                testTitle: fc.testTitle,
                category: fc.category,
                timestamp: fc.timestamp,
            })),
        );
        const aiComparison = compareAiVsManual([]);
        const flatTests = projectRuns.flatMap((r) =>
            r.tests.map((t) => ({ title: t.title, duration: t.duration, flakiness: 0 })),
        );
        const optimization = analyzeSuiteOptimization(flatTests);

        /* Cross-squad benchmark: aggregate health across all projects */
        const projectNames = [...new Set(effectiveStore.runs.map((r) => r.project))];
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

        const uncoveredEpics: string[] = matrix.nodes.reduce((acc: string[], n) => {
            if (n.coverage < 100) acc.push(n.epic);
            return acc;
        }, []);

        const incidentReport = buildIncidentReport(
            failRate,
            regression.regressions.length,
            seasonality.peakDay,
            uncoveredEpics,
            health.overall,
        );

        const trendCategories = new Set<string>();
        for (const t of defects.trends) {
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
        const qualityGate = runQualityGate({ project: currentProjectName });
        sections.push('<h2>Quality Gate</h2><pre>' + formatQualityGateText(qualityGate) + '</pre>');
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
    } catch (err) {
        printError('Falha ao gerar dashboard de flaky', err);
    }
}
