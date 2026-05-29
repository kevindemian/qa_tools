/** Gap Analysis handler — "Analyze coverage gaps" command.
 *  Runs coverage gap analysis, displays CLI table, prompts for test creation, offers HTML export and AI gen. */
import { info, warn, title, divider, tableView, printError, withSpinner, askConfirm } from '../../shared/prompt';
import { analyzeCoverageGaps } from '../../shared/coverage-gap';
import { generateCoverageGapHtml } from '../../shared/generate-coverage-gap-html';
import { recordAiGeneration } from '../../shared/ai-feedback';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context';
import type { AiGenerationRecord } from '../../shared/types';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Análise de gaps de cobertura');

    let result;
    try {
        result = await withSpinner('Analisando gaps de cobertura...', () =>
            analyzeCoverageGaps(c.jiraResource, c.ctx.project_name),
        );
    } catch (err: unknown) {
        printError('Erro ao analisar gaps de cobertura', err);
        return false;
    }

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

    if (result.gateConfig.failingEpics.length > 0) {
        divider();
        warn('Épicos abaixo do threshold de ' + result.gateConfig.minCoveragePct + '%:');
        for (const epicKey of result.gateConfig.failingEpics) {
            const epic = result.byEpic[epicKey];
            if (epic) {
                info(epicKey + ' (' + epic.epicSummary.slice(0, 40) + ') — ' + epic.rawPct + '%');
            }
        }
    }

    divider();
    const createTests = await askConfirm('Criar teste(s) para gap(s)?');
    if (createTests) {
        info('Funcionalidade de criação de testes será implementada em breve.');
    }

    if (result.totals.gap > 0) {
        const useAi = await askConfirm('Usar IA para gerar testes para gaps?');
        if (useAi) {
            const gapIssues = result.items.filter((i) => !i.hasTest).slice(0, 5);
            for (const issue of gapIssues) {
                info('Issue: ' + issue.issueKey + ' — ' + issue.summary);
            }
            if (gapIssues.length > result.items.filter((i) => !i.hasTest).length) {
                info('... e mais ' + (result.items.filter((i) => !i.hasTest).length - 5) + ' issue(s).');
            }
            info('Acesse a opção 18 (Gerar testes via IA) e use os summaries acima como user stories.');
            const genRecord: AiGenerationRecord = {
                id: crypto.randomUUID(),
                generatedAt: new Date().toISOString(),
                promptVersion: 'v2',
                userStory: 'Coverage gap analysis: ' + result.totals.gap + ' uncovered issues',
                acceptanceCriteria: 'Generate tests for uncovered issues identified by gap analysis',
                generatedTests: gapIssues.map((i) => ({
                    title: i.summary,
                    preConditions: [],
                    stepCount: 0,
                })),
                preconditionMatches: [],
            };
            recordAiGeneration(genRecord);
        }
    }

    const exportHtml = await askConfirm('Gerar relatório HTML?');
    if (exportHtml) {
        try {
            const html = generateCoverageGapHtml(result, 'Coverage Gap Report — ' + c.ctx.project_name);
            const outDir = process.cwd();
            const filePath = path.join(outDir, 'coverage-gap-report.html');
            fs.writeFileSync(filePath, html, 'utf8');
            info('Relatório salvo em: ' + filePath);
        } catch (err: unknown) {
            printError('Erro ao gerar relatório HTML', err);
        }
    }

    c.pushHistory(
        'coverage-gap-analysis',
        result.totals.rawCoveragePct + '% coverage, ' + result.totals.gap + ' gaps',
        'ok',
    );
}

export default { handler };
