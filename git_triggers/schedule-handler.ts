/** Scheduled tasks — run metrics, flakiness analysis, flaky auto-actions, and generate scheduled reports. */
import { print, success, warn, info, prompt, printError, withSpinner } from '../shared/ui/prompt.js';
import type { GitProvider, StateContainer } from '../shared/types.js';
import { calcFlakinessEntries } from '../shared/data-hub/compute/flakiness-entries.js';
import { calcRunFailureRate } from '../shared/data-hub/compute/run-failure-rate.js';
import { calculateHealthScore } from '../shared/quality/health-score.js';
import { generateDefectTrendHtml } from '../shared/quality/defect-trend.js';
import { generateReleaseScoreHtml } from '../shared/quality/release-score-renderer.js';
import { generateAiEffectivenessHtml } from '../shared/report/ai-effectiveness.js';
import { generateTraceabilityHtml } from '../shared/report/traceability-matrix.js';

import { openWithFallback } from '../shared/open.js';
import { generateFlakinessHtml } from '../shared/report/flakiness-dashboard.js';
import { buildHtmlPage } from '../shared/report/html-factory.js';
import { generateBacklogHealthHtml } from '../shared/report/backlog-health.js';
import { generateSeasonalityHtml } from '../shared/quality/defect-seasonality.js';
import { generateSilentRegressionHtml } from '../shared/quality/silent-regression.js';
import { generateAiComparisonHtml } from '../shared/report/ai-comparison.js';
import { generateBenchmarkHtml } from '../shared/quality/cross-squad-benchmark.js';
import { generateDeveloperProfileHtml } from '../shared/quality/developer-profile.js';
import { generateOptimizationHtml } from '../shared/quality/suite-optimization.js';
import { buildIncidentReport, generateIncidentReportHtml } from '../shared/report/incident-report.js';
import { analyzePipelineImpact, generateImpactAlertHtml } from '../shared/report/impact-alert.js';
import { generatePipelineCostHtml } from '../shared/quality/pipeline-cost.js';
import { calculateRequirementScores, generateRequirementScoreHtml } from '../shared/quality/requirement-score.js';
import { runQualityGate, formatQualityGateText } from '../shared/quality/quality-gate.js';

import { writeReport } from '../shared/infra/temp-dir.js';
import {
    currentProvider,
    pushHistory,
    displayProjects,
    displayRecentPipelines,
    createManagerForProject,
    getProviderForProject,
    setProjectId,
    setManager,
    getProjects,
    getDataHub,
} from './session-state.js';
import { getCurrentProject, setCurrentProject } from '../shared/project-context.js';
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
        setCurrentProject(newName);
        setProjectId(Reflect.get(getProjects(), newName));
        const newManager = createManagerForProject(newName, Reflect.get(getProjects(), newName));
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

function extractTrendCategories(trends: { categories: Record<string, number> }[]): string[] {
    const categories = new Set<string>();
    for (const t of trends) {
        for (const cat of Object.keys(t.categories)) {
            categories.add(cat);
        }
    }
    return [...categories];
}

export function generateWeeklyQualityReport(): void {
    try {
        if (!getCurrentProject()) {
            warn('Nenhum projeto selecionado.');
            return;
        }
        const dataHub = getDataHub();
        const projectRuns = (dataHub.computed.metricsRuns ?? []).filter(
            (r) => r.project === (getCurrentProject() ?? ''),
        );
        if (projectRuns.length < 2) {
            warn(
                'Menos de 2 execuções registradas para ' +
                    (getCurrentProject() ?? '') +
                    '. Execute pipelines primeiro.',
            );
            return;
        }

        const health = calculateHealthScore({ dataHub });
        const releaseScore = dataHub.computed.releaseScore;
        const defects = dataHub.computed.defectAggregation;
        const matrix = dataHub.computed.traceabilityTree;
        const backlog = dataHub.computed.backlogHealth;

        if (defects == null) {
            throw new Error('Invariant violated: hub.computed.defectAggregation is undefined.');
        }
        if (matrix == null) {
            throw new Error('Invariant violated: hub.computed.traceabilityTree is undefined.');
        }
        if (backlog == null) {
            throw new Error('Invariant violated: hub.computed.backlogHealth is undefined.');
        }

        const aiRecords = dataHub.raw.aiRecords ?? null;
        const aiResult = dataHub.computed.aiMetrics;
        const requirementScores = calculateRequirementScores(aiRecords ?? undefined);

        const seasonality = dataHub.computed.seasonalityAggregation;
        const regression = dataHub.computed.regressionDetection;
        const devProfile = dataHub.computed.developerProfile;
        const aiComparison = dataHub.computed.aiComparison;
        const optimization = dataHub.computed.optimizationActions;
        const benchmark = dataHub.computed.crossSquad;
        const coverageGap = dataHub.computed.coverageGap;

        if (seasonality == null) {
            throw new Error('Invariant violated: hub.computed.seasonalityAggregation is undefined.');
        }
        if (regression == null) {
            throw new Error('Invariant violated: hub.computed.regressionDetection is undefined.');
        }
        if (optimization == null) {
            throw new Error('Invariant violated: hub.computed.optimizationActions is undefined.');
        }
        if (benchmark == null) {
            throw new Error('Invariant violated: hub.computed.crossSquad is undefined.');
        }

        const failRate = calcRunFailureRate(projectRuns);

        const uncoveredEpics: string[] = [...(coverageGap?.gateConfig.failingEpics ?? [])];
        if (uncoveredEpics.length === 0) {
            matrix.nodes.forEach((n) => {
                if (n.coverage < 100) uncoveredEpics.push(n.epic);
            });
        }

        const incidentReport = buildIncidentReport(
            failRate,
            regression.regressions.length,
            seasonality.peakDay,
            uncoveredEpics,
            health.overall,
            coverageGap,
        );

        const trendCategories = extractTrendCategories(defects.trends);

        const impactAlert = analyzePipelineImpact(
            health.dimensions.passRate.score,
            projectRuns.filter((r) => r.failed > 0).length,
            trendCategories.slice(0, 5),
            health.dimensions.coverage.score,
            uncoveredEpics,
            coverageGap,
        );

        const pipelineCost = dataHub.computed.pipelineCostResult;

        const sections: string[] = [];
        const qgDataHub = getDataHub();
        const qualityGate = runQualityGate({
            project: getCurrentProject() ?? '',
            dataHub: qgDataHub,
        });
        const timestamp = new Date().toISOString();
        sections.push(
            '<div data-section="quality-gate"><h2>Quality Gate</h2><pre>' +
                formatQualityGateText(qualityGate) +
                '</pre></div>',
        );
        sections.push(
            '<div data-section="cross-squad-benchmark"><h2>Cross-Squad Benchmark</h2>' +
                generateBenchmarkHtml(benchmark) +
                '</div>',
        );
        sections.push(
            '<div data-section="defect-seasonality"><h2>Defect Seasonality</h2>' +
                generateSeasonalityHtml(seasonality) +
                '</div>',
        );
        sections.push(
            '<div data-section="release-score"><h2>Release Score</h2>' +
                generateReleaseScoreHtml(releaseScore) +
                '</div>',
        );
        sections.push(
            '<div data-section="defect-trends"><h2>Defect Trends</h2>' + generateDefectTrendHtml(defects) + '</div>',
        );
        sections.push(
            '<div data-section="silent-regression"><h2>Silent Regression</h2>' +
                generateSilentRegressionHtml(regression) +
                '</div>',
        );
        sections.push(
            '<div data-section="traceability"><h2>Traceability Matrix</h2>' +
                generateTraceabilityHtml(matrix) +
                '</div>',
        );
        sections.push(
            '<div data-section="ai-effectiveness"><h2>AI Effectiveness</h2>' +
                generateAiEffectivenessHtml(aiResult) +
                '</div>',
        );
        sections.push(
            '<div data-section="ai-comparison"><h2>AI Test Comparison</h2>' +
                generateAiComparisonHtml(aiComparison) +
                '</div>',
        );
        sections.push(
            '<div data-section="developer-profile"><h2>Developer Profile</h2>' +
                generateDeveloperProfileHtml(devProfile) +
                '</div>',
        );
        sections.push(
            '<div data-section="suite-optimization"><h2>Suite Optimization</h2>' +
                generateOptimizationHtml(optimization) +
                '</div>',
        );
        sections.push(
            '<div data-section="backlog-health"><h2>Backlog Health</h2>' +
                generateBacklogHealthHtml(backlog) +
                '</div>',
        );
        sections.push(
            '<div data-section="incident-report"><h2>Incident Investigation Report</h2>' +
                generateIncidentReportHtml(incidentReport) +
                '</div>',
        );
        sections.push(
            '<div data-section="impact-alert"><h2>Pipeline Impact Alert</h2>' +
                generateImpactAlertHtml(impactAlert) +
                '</div>',
        );
        sections.push(
            '<div data-section="pipeline-cost"><h2>Pipeline Cost Analytics</h2>' +
                generatePipelineCostHtml(pipelineCost) +
                '</div>',
        );
        sections.push(
            '<div data-section="requirement-score"><h2>Requirement Quality Score</h2>' +
                generateRequirementScoreHtml(requirementScores) +
                '</div>',
        );

        const bodyContent =
            '<h1>Weekly Quality Report — ' +
            (getCurrentProject() ?? '') +
            '</h1>' +
            '<div data-part="timestamp" data-dashboard="weekly-quality-report">' +
            timestamp.slice(0, 10) +
            '</div>' +
            sections.join('');

        const html = buildHtmlPage({
            title: 'Weekly Quality Report — ' + (getCurrentProject() ?? ''),
            styles: '',
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Weekly Quality Report',
        });

        const outPath = writeReport('weekly-quality-' + (getCurrentProject() ?? '') + '.html', html);
        success('Weekly quality report saved: ' + outPath);
        pushHistory('weekly-quality-report', getCurrentProject() ?? '', 'ok');
    } catch (err) {
        printError('Falha ao gerar relatório semanal de qualidade', err);
    }
}

export async function handleFlakinessDashboard(): Promise<void> {
    try {
        if (!getCurrentProject()) {
            warn('Nenhum projeto selecionado.');
            return;
        }
        const hub = getDataHub();
        const projectRuns = (hub.computed.metricsRuns ?? []).filter((r) => r.project === (getCurrentProject() ?? ''));
        if (projectRuns.length < 2) {
            warn(
                'Menos de 2 execuções registradas para ' +
                    (getCurrentProject() ?? '') +
                    '. Execute pipelines primeiro.',
            );
            return;
        }
        const flaky = calcFlakinessEntries(projectRuns, 2);
        if (flaky.length === 0) {
            info('Nenhum teste flaky detectado em ' + (getCurrentProject() ?? '') + '.');
            return;
        }
        const html = generateFlakinessHtml(flaky, 'Flakiness — ' + (getCurrentProject() ?? ''), { dataHub: hub });
        const outPath = writeReport('flakiness-' + (getCurrentProject() ?? '') + '.html', html);
        await openWithFallback(outPath, 'Dashboard de flaky', info);
        pushHistory(
            'flakiness',
            (getCurrentProject() ?? '') + ' (' + flaky.filter((f: { rate: number }) => f.rate > 0.3).length + ' >30%)',
            'ok',
        );
    } catch (err) {
        printError('Falha ao gerar dashboard de flaky', err);
    }
}
