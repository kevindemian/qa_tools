/** Gap Analysis handler — "Analyze coverage gaps" command.
 *  Runs coverage gap analysis, displays CLI table, prompts for test creation, offers HTML export and AI gen.
 *  Supports --ci-gate flag: saves snapshot, compares with previous, fails if gap increased. */
import {
    info,
    warn,
    error,
    title,
    divider,
    tableView,
    printError,
    withSpinner,
    askConfirm,
} from '../../shared/prompt.js';
import { analyzeCoverageGaps } from '../../shared/coverage-gap.js';
import { openWithFallback } from '../../shared/open.js';
import { generateCoverageGapHtml } from '../../shared/generate-coverage-gap-html.js';
import { getDataHub } from '../../shared/data-hub/global-hub.js';
import { rootLogger } from '../../shared/logger.js';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context.js';
import type { CoverageGapResult } from '../../shared/types.js';
import case18Handler from './case18.js';

function checkCiGateFlag(): boolean {
    return process.argv.slice(2).some((a) => a === '--ci-gate');
}

function handlerCiGate(result: CoverageGapResult, project: string): boolean {
    const currentGap = result.totals.gap;
    const coveragePct = result.totals.rawCoveragePct;

    const hub = getDataHub();
    hub.saveCoverageSnapshot({
        timestamp: new Date().toISOString(),
        project,
        totalIssues: result.totals.totalIssues,
        mappedIssues: result.totals.covered,
        coveragePct,
    });

    const store = hub.loadMetricsStore();
    const history = (store.coverageHistory ?? []).filter((s) => s.project === project);
    const previous = history.length >= 2 ? history[history.length - 2] : null;

    if (previous) {
        const prevGap = previous.totalIssues - previous.mappedIssues;
        const diff = currentGap - prevGap;
        if (diff > 0) {
            error('[CI GATE] Coverage gap increased by ' + diff + ' issue(s): ' + prevGap + ' → ' + currentGap);
            error('[CI GATE] Coverage: ' + previous.coveragePct + '% → ' + coveragePct + '%');
            rootLogger.error('[CI GATE] Coverage gap increased — setting failure exit');
            return false;
        }
        if (diff < 0) {
            info(
                '[CI GATE] Coverage gap decreased by ' + Math.abs(diff) + ' issue(s): ' + prevGap + ' → ' + currentGap,
            );
        } else {
            info('[CI GATE] Coverage gap unchanged: ' + currentGap + ' issue(s)');
        }
    }

    info(
        '[CI GATE] Coverage: ' +
            coveragePct +
            '% · ' +
            currentGap +
            ' gap(s) · ' +
            result.totals.totalIssues +
            ' issues',
    );
    return true;
}

function _showCoverageSummary(result: CoverageGapResult): void {
    divider();
    info('Resumo de cobertura:');
    tableView(
        [
            { Métrica: 'Total de issues', Valor: result.totals.totalIssues },
            { Métrica: 'Cobertas', Valor: result.totals.covered },
            { Métrica: 'Gaps', Valor: result.totals.gap },
            { Métrica: 'Cobertura raw', Valor: result.totals.rawCoveragePct + '%' },
            { Métrica: 'Cobertura ponderada', Valor: result.totals.weightedCoveragePct + '%' },
        ],
        ['Métrica', 'Valor'],
    );

    if (result.totals.gap > 0) {
        divider();
        warn(result.totals.gap + ' issue(s) sem teste de cobertura:');
        const gapRows = result.items
            .filter((i) => !i.hasTest)
            .slice(0, 20)
            .map((i) => ({
                Chave: i.issueKey,
                Resumo: i.summary.slice(0, 50),
                Tipo: i.type,
                Prioridade: i.priority,
                Peso: i.coverageWeight,
                'Link Épico': i.epicKey || '—',
            }));
        tableView(gapRows, ['Chave', 'Resumo', 'Tipo', 'Prioridade', 'Peso', 'Link Épico']);
    }
}

function _showFailingEpics(result: CoverageGapResult): void {
    if (result.gateConfig.failingEpics.length === 0) return;
    divider();
    warn('Épicos abaixo do threshold de ' + result.gateConfig.minCoveragePct + '%:');
    for (const epicKey of result.gateConfig.failingEpics) {
        const epic: unknown = Reflect.get(result.byEpic, epicKey);
        if (epic !== undefined && epic !== null && typeof epic === 'object') {
            const e = epic as { epicSummary: string; rawPct: number };
            info(epicKey + ' (' + e.epicSummary.slice(0, 40) + ') — ' + e.rawPct + '%');
        }
    }
}

async function _handleAiGeneration(result: CoverageGapResult, c: CommandContext): Promise<void> {
    if (result.totals.gap === 0) return;
    const useAi = await askConfirm('Deseja gerar testes via IA para os gaps encontrados?');
    if (!useAi) return;
    const issuesSemTeste = result.items.filter((i) => !i.hasTest);
    const gapIssues = issuesSemTeste.slice(0, 5);
    for (const issue of gapIssues) {
        info('Issue: ' + issue.issueKey + ' — ' + issue.summary);
    }
    if (gapIssues.length < issuesSemTeste.length) {
        info('... e mais ' + (issuesSemTeste.length - 5) + ' issue(s).');
    }
    info('Delegando para o gerador de testes via IA (case18)...');
    await case18Handler.handler(c);
}

async function _handleHtmlExport(result: CoverageGapResult, c: CommandContext): Promise<void> {
    const exportHtml = await askConfirm('Gerar relatório HTML?');
    if (!exportHtml) return;
    try {
        const html = generateCoverageGapHtml(result, 'Coverage Gap Report — ' + c.ctx.project_name);
        const filePath = path.join(process.cwd(), 'coverage-gap-report.html');
        fs.writeFileSync(path.resolve(filePath), html, 'utf8');
        await openWithFallback(filePath, 'Relatório de cobertura', info);
    } catch (err: unknown) {
        printError('Erro ao gerar relatório HTML', err);
    }
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const isCiGate = checkCiGateFlag();

    let result;
    try {
        result = await withSpinner('Analisando gaps de cobertura...', () =>
            analyzeCoverageGaps(c.jiraResource, c.ctx.project_name),
        );
    } catch (err: unknown) {
        printError('Erro ao analisar gaps de cobertura', err);
        return false;
    }

    if (isCiGate) {
        return handlerCiGate(result, c.ctx.project_name);
    }

    title('Análise de gaps de cobertura');
    _showCoverageSummary(result);
    _showFailingEpics(result);

    divider();
    const createTests = await askConfirm('Criar teste(s) para gap(s)?');
    if (createTests) {
        info('Funcionalidade de criação de testes será implementada em breve.');
    }

    await _handleAiGeneration(result, c);
    await _handleHtmlExport(result, c);

    c.pushHistory(
        'coverage-gap-analysis',
        result.totals.rawCoveragePct + '% coverage, ' + result.totals.gap + ' gaps',
        'ok',
    );
}

export default { handler };
