/** History/Coverage dashboard — execution trends, flakiness analysis, health score, coverage gaps. */
import { info, warn, title, divider, tableView, printError, showSelect, withSpinner } from '../../shared/prompt.js';
import { loadMetrics, calculateFlakiness, getTrends, saveCoverageSnapshot } from '../../shared/metrics.js';
import { calculateHealthScore } from '../../shared/health-score.js';
import { analyzeCoverage } from '../coverage.js';
import { compareRuns } from '../../shared/run-comparison.js';
import type { CommandContext } from './context.js';

function _showRunHistory(store: ReturnType<typeof loadMetrics>): void {
    title('Histórico de execuções');
    const recent = store.runs.slice(-10).reverse();
    const rows = recent.map((r) => ({
        Data: r.timestamp.slice(0, 10),
        Projeto: r.project,
        Total: r.total,
        Pass: r.passed,
        Fail: r.failed,
        Rate: r.passed + r.failed > 0 ? `${Math.round((r.passed / (r.passed + r.failed)) * 100)}%` : '0%',
    }));
    tableView(rows, ['Data', 'Projeto', 'Total', 'Pass', 'Fail', 'Rate']);
}

async function _compareLastTwoRuns(store: ReturnType<typeof loadMetrics>): Promise<void> {
    if (store.runs.length < 2) return;
    divider();
    const lastTwo = store.runs.slice(-2);
    const analysis = await withSpinner('Comparando últimas execuções (IA)...', () =>
        compareRuns(
            lastTwo[0] as NonNullable<(typeof store)['runs'][0]>,
            lastTwo[1] as NonNullable<(typeof store)['runs'][0]>,
        ),
    );
    if (analysis) info('Análise comparativa: ' + analysis);
}

function _handleFlakySection(store: ReturnType<typeof loadMetrics>): void {
    const flaky = calculateFlakiness(store, 2);
    if (flaky.length === 0) return;
    divider();
    title('Testes com flakiness');
    const flakyRows = flaky.slice(0, 10).map((f) => ({
        Teste: f.title.slice(0, 60),
        Pass: f.passCount,
        Fail: f.failCount,
        Rate: `${Math.round(f.rate * 100)}%`,
    }));
    tableView(flakyRows, ['Teste', 'Pass', 'Fail', 'Rate']);
}

function _showTrends(store: ReturnType<typeof loadMetrics>): void {
    const trends = getTrends(store, 10);
    if (trends.length === 0) return;
    divider();
    title('Tendência');
    const trendRows = trends.map((t) => ({
        Data: t.label,
        Total: t.total,
        Falhas: t.failed,
        'Pass Rate': `${Math.round(t.passRate)}%`,
    }));
    tableView(trendRows, ['Data', 'Total', 'Falhas', 'Pass Rate']);
}

function _showHealthScore(store: ReturnType<typeof loadMetrics>): void {
    if (store.runs.length < 5) return;
    divider();
    const health = calculateHealthScore(store);
    const qcIcon = health.qualityGate === 'pass' ? '✅' : '❌';
    title('Test Suite Health — ' + health.overall + '/100 (' + health.grade.replace(/_/g, ' ') + ') ' + qcIcon);
    const dimEntries = Object.entries(health.dimensions) as Array<[string, { score: number; status: string }]>;
    const dimRows = (['passRate', 'flakyRate', 'coverage', 'suiteSpeed'] as const).map((dim) => {
        const entry = dimEntries.find(([k]) => k === dim);
        const dimData = entry?.[1];

        let dimLabel: string;
        if (dim === 'passRate') {
            dimLabel = 'Pass Rate';
        } else if (dim === 'flakyRate') {
            dimLabel = 'Flaky Rate';
        } else if (dim === 'coverage') {
            dimLabel = 'Coverage';
        } else {
            dimLabel = 'Suite Speed';
        }

        return {
            Dimensão: dimLabel,
            Score: dimData?.score ?? 0,
            Status: dimData?.status === 'pass' ? '✅' : '❌',
        };
    });
    tableView(dimRows, ['Dimensão', 'Score', 'Status']);
}

async function showHistory(): Promise<void> {
    const store = loadMetrics();
    if (store.runs.length === 0) {
        warn('Nenhuma execução registrada.');
        return;
    }
    _showRunHistory(store);
    await _compareLastTwoRuns(store);
    _handleFlakySection(store);
    _showTrends(store);
    _showHealthScore(store);
}

async function showCoverage(c: CommandContext): Promise<void> {
    title('Análise de cobertura');
    let result;
    try {
        result = await analyzeCoverage(c.jiraResource, c.ctx.project_name);
    } catch (err: unknown) {
        printError('Erro ao analisar cobertura', err);
        return;
    }

    saveCoverageSnapshot({
        timestamp: new Date().toISOString(),
        project: c.ctx.project_name,
        totalIssues: result.totalIssues,
        mappedIssues: result.mappedIssues,
        coveragePct: result.coveragePct,
    });

    tableView(
        [
            { Métrica: 'Total de issues', Valor: result.totalIssues },
            { Métrica: 'Com steps', Valor: result.mappedIssues },
            { Métrica: 'Total steps', Valor: result.totalSteps },
            { Métrica: 'Cobertura', Valor: `${result.coveragePct}%` },
        ],
        ['Métrica', 'Valor'],
    );

    if (result.unmappedSteps.length > 0) {
        divider();
        warn(`${result.unmappedSteps.length} issue(s) sem steps:`);
        info(result.unmappedSteps.join(', '));
    }

    const epics = Object.keys(result.gapsByEpic);
    if (epics.length > 0) {
        divider();
        title('Gaps por épico');
        for (const epic of epics) {
            const gaps: unknown = Reflect.get(result.gapsByEpic, epic);
            info(`${epic}: ${(Array.isArray(gaps) ? gaps : []).join(', ')}`);
        }
    }

    c.pushHistory('coverage-analysis', `${result.coveragePct}% coverage`, 'ok');
}

async function handler(c: CommandContext): Promise<boolean | void> {
    for (;;) {
        title('Histórico / Cobertura');
        const choice = await showSelect('Selecione uma opção', [
            { name: 'Mostrar histórico de execuções', value: 'a' },
            { name: 'Analisar cobertura', value: 'b' },
            { name: 'Voltar', value: '0' },
        ]);

        if (choice === '0') return;

        if (choice === 'a') {
            await showHistory();
        } else if (choice === 'b') {
            await showCoverage(c);
        }

        divider();
    }
}

export default { handler };
