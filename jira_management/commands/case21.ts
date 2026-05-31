/** Gap Analysis handler — "Analyze coverage gaps" command.
 *  Runs coverage gap analysis, displays CLI table, prompts for test creation, offers HTML export and AI gen.
 *  Supports --ci-gate flag: saves snapshot, compares with previous, fails if gap increased. */
import { info, warn, error, title, divider, tableView, printError, withSpinner, askConfirm } from '../../shared/prompt';
import { analyzeCoverageGaps } from '../../shared/coverage-gap';
import { openWithFallback } from '../../shared/open';
import { generateCoverageGapHtml } from '../../shared/generate-coverage-gap-html';
import { recordAiGeneration } from '../../shared/ai-feedback';
import { loadMetrics, saveCoverageSnapshot } from '../../shared/metrics';
import { rootLogger } from '../../shared/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context';
import type { AiGenerationRecord, CoverageGapResult } from '../../shared/types';

function checkCiGateFlag(): boolean {
    return process.argv.slice(2).some((a) => a === '--ci-gate');
}

function handlerCiGate(result: CoverageGapResult, project: string): boolean {
    const currentGap = result.totals.gap;
    const coveragePct = result.totals.rawCoveragePct;

    saveCoverageSnapshot({
        timestamp: new Date().toISOString(),
        project,
        totalIssues: result.totals.totalIssues,
        mappedIssues: result.totals.covered,
        coveragePct,
    });

    const store = loadMetrics();
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
        const epic = result.byEpic[epicKey];
        if (epic) {
            info(epicKey + ' (' + epic.epicSummary.slice(0, 40) + ') — ' + epic.rawPct + '%');
        }
    }
}

async function _handleAiGeneration(result: CoverageGapResult): Promise<void> {
    if (result.totals.gap === 0) return;
    const useAi = await askConfirm('Usar IA para gerar testes para gaps?');
    if (!useAi) return;
    const issuesSemTeste = result.items.filter((i) => !i.hasTest);
    const gapIssues = issuesSemTeste.slice(0, 5);
    for (const issue of gapIssues) {
        info('Issue: ' + issue.issueKey + ' — ' + issue.summary);
    }
    if (gapIssues.length < issuesSemTeste.length) {
        info('... e mais ' + (issuesSemTeste.length - 5) + ' issue(s).');
    }
    info('Acesse a opção 18 (Gerar testes via IA) e use os summaries acima como user stories.');
    const genRecord: AiGenerationRecord = {
        id: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        promptVersion: 'v2',
        userStory: 'Coverage gap analysis: ' + result.totals.gap + ' uncovered issues',
        acceptanceCriteria: 'Generate tests for uncovered issues identified by gap analysis',
        generatedTests: gapIssues.map((i) => ({ title: i.summary, preConditions: [], stepCount: 0 })),
        preconditionMatches: [],
    };
    recordAiGeneration(genRecord);
}

async function _handleHtmlExport(result: CoverageGapResult, c: CommandContext): Promise<void> {
    const exportHtml = await askConfirm('Gerar relatório HTML?');
    if (!exportHtml) return;
    try {
        const html = generateCoverageGapHtml(result, 'Coverage Gap Report — ' + c.ctx.project_name);
        const filePath = path.join(process.cwd(), 'coverage-gap-report.html');
        fs.writeFileSync(filePath, html, 'utf8');
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

    await _handleAiGeneration(result);
    await _handleHtmlExport(result, c);

    c.pushHistory(
        'coverage-gap-analysis',
        result.totals.rawCoveragePct + '% coverage, ' + result.totals.gap + ' gaps',
        'ok',
    );
}

export default { handler };
