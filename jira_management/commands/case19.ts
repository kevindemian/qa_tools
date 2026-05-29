/** History/Coverage dashboard — execution trends, flakiness analysis, health score, coverage gaps. */
import {
    info,
    warn,
    title,
    divider,
    tableView,
    printError,
    showSelect,
    withSpinner,
    askConfirm,
} from '../../shared/prompt';
import { loadMetrics, calculateFlakiness, getTrends, saveCoverageSnapshot } from '../../shared/metrics';
import { calculateHealthScore } from '../../shared/health-score';
import { executeFlakyActions } from '../../shared/flaky-auto-actions';
import { analyzeCoverage } from '../coverage';
import { compareRuns } from '../../shared/run-comparison';
import type { CommandContext } from './context';

async function showHistory(c: CommandContext): Promise<void> {
    const store = loadMetrics();
    if (store.runs.length === 0) {
        warn('Nenhuma execução registrada.');
        return;
    }

    title('Histórico de execuções');
    const recent = store.runs.slice(-10).reverse();
    const rows = recent.map((r) => ({
        Data: r.timestamp.slice(0, 10),
        Projeto: r.project,
        Total: r.total,
        Pass: r.passed,
        Fail: r.failed,
        Rate: r.total > 0 ? `${Math.round((r.passed / r.total) * 100)}%` : '0%',
    }));
    tableView(rows, ['Data', 'Projeto', 'Total', 'Pass', 'Fail', 'Rate']);

    if (store.runs.length >= 2) {
        divider();
        const lastTwo = store.runs.slice(-2);
        const analysis = await withSpinner('Comparando últimas execuções (IA)...', () =>
            compareRuns(lastTwo[0]!, lastTwo[1]!),
        );
        if (analysis) {
            info('Análise comparativa: ' + analysis);
        }
    }

    const flaky = calculateFlakiness(store, 2);
    if (flaky.length > 0) {
        divider();
        title('Testes com flakiness');
        const flakyRows = flaky.slice(0, 10).map((f) => ({
            Teste: f.title.slice(0, 60),
            Pass: f.passCount,
            Fail: f.failCount,
            Rate: `${Math.round(f.rate * 100)}%`,
        }));
        tableView(flakyRows, ['Teste', 'Pass', 'Fail', 'Rate']);
        if (await askConfirm('Aplicar auto-actions (criar bugs) para testes flaky?', false)) {
            try {
                const actions = await executeFlakyActions(store, c.jiraResource, c.ctx.project_name, {
                    autoCreateBug: true,
                    minTotalRuns: 5,
                    dedupSearch: true,
                });
                const bugs = actions.filter((a) => a.action === 'create_bug' || a.action === 'reenable');
                info(bugs.length + ' auto-action(s) executada(s) para testes flaky.');
            } catch (err: unknown) {
                printError('Erro ao executar auto-actions', err);
            }
        }
    }

    const trends = getTrends(store, 10);
    if (trends.length > 0) {
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

    if (store.runs.length >= 5) {
        divider();
        const health = calculateHealthScore(store);
        const qcIcon = health.qualityGate === 'pass' ? '✅' : '❌';
        title('Test Suite Health — ' + health.overall + '/100 (' + health.grade.replace(/_/g, ' ') + ') ' + qcIcon);
        const dimRows = [
            {
                Dimensão: 'Pass Rate',
                Score: health.dimensions.passRate.score,
                Status: health.dimensions.passRate.status === 'pass' ? '✅' : '❌',
            },
            {
                Dimensão: 'Flaky Rate',
                Score: health.dimensions.flakyRate.score,
                Status: health.dimensions.flakyRate.status === 'pass' ? '✅' : '❌',
            },
            {
                Dimensão: 'Coverage',
                Score: health.dimensions.coverage.score,
                Status: health.dimensions.coverage.status === 'pass' ? '✅' : '❌',
            },
            {
                Dimensão: 'Suite Speed',
                Score: health.dimensions.suiteSpeed.score,
                Status: health.dimensions.suiteSpeed.status === 'pass' ? '✅' : '❌',
            },
        ];
        tableView(dimRows, ['Dimensão', 'Score', 'Status']);
    }
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
            info(`${epic}: ${(result.gapsByEpic[epic] ?? []).join(', ')}`);
        }
    }

    c.pushHistory('coverage-analysis', `${result.coveragePct}% coverage`, 'ok');
}

async function handler(c: CommandContext): Promise<boolean | void> {
    while (true) {
        title('Histórico / Cobertura');
        const choice = await showSelect('Selecione uma opção', [
            { name: 'Mostrar histórico de execuções', value: 'a' },
            { name: 'Analisar cobertura', value: 'b' },
            { name: 'Voltar', value: '0' },
        ]);

        if (choice === '0') return;

        if (choice === 'a') {
            await showHistory(c);
        } else if (choice === 'b') {
            await showCoverage(c);
        }

        divider();
    }
}

export default { handler };
