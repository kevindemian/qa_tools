import fs from 'fs';
import path from 'path';
import { ask, askConfirm, info, printError, title, withSpinner } from '../../shared/prompt';
import type { ParseResult } from '../../shared/result_parser';
import { writeReport } from '../../shared/temp-dir';
import { parseTestResultsFile } from '../../shared/result_parser';
import { generateHtmlReport } from '../../shared/report-generator';
import { analyzeFailuresWithReport } from '../../shared/failure-analysis';
import { collectAutomated, interactiveBugReportFlow } from '../../shared/bug-report';
import { openWithOsOrFallback } from '../../shared/open';
import type { CommandContext } from './context';

function injectAnalysisSection(html: string, analysis: string): string {
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd === -1) return html;
    const section = `<div class="chart-box"><h2>Failure Analysis</h2><pre style="white-space:pre-wrap;font-size:0.85rem">${analysis.replace(/</g, '&lt;')}</pre></div>`;
    return html.slice(0, bodyEnd) + section + html.slice(bodyEnd);
}

async function _writeReportFile(html: string, projectName: string): Promise<string> {
    const defaultName = `report-${projectName}-${Date.now()}.html`;
    const outPath = await ask('Caminho de saída do HTML', { default: '' });
    if (outPath.trim()) {
        const resolvedPath = path.resolve(outPath.trim());
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, html, 'utf8');
        return resolvedPath;
    }
    return writeReport(defaultName, html);
}

async function _addAiAnalysis(html: string, tests: ParseResult['tests']): Promise<string> {
    const analysis = await withSpinner('Analisando falhas com IA...', () => analyzeFailuresWithReport(tests));
    return analysis.content ? injectAnalysisSection(html, analysis.content) : html;
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const filePath = await ask('Caminho do arquivo de resultados JSON', {
        hint: 'ex: cypress/reports/ctrf-report.json',
    });
    if (!filePath.trim()) {
        printError('Relatório HTML', new Error('Caminho do arquivo vazio.'));
        return;
    }

    title('Analisando relatório...');
    const result = parseTestResultsFile(filePath.trim());
    if (result.error) {
        printError('Erro ao ler relatório', new Error(result.error));
        return;
    }

    let html = generateHtmlReport(result.tests, {
        title: `Relatório - ${c.ctx.project_name}`,
        generatedAt: new Date().toISOString(),
        source: 'Relatório HTML',
    });

    if (result.stats.failed > 0 && (await askConfirm('Incluir análise das falhas (IA)?', true))) {
        html = await _addAiAnalysis(html, result.tests);
    }

    const resolvedPath = await _writeReportFile(html, c.ctx.project_name);

    info(`Relatório HTML gerado: ${resolvedPath}`);
    void openWithOsOrFallback(resolvedPath);
    c.pushHistory(
        'html-report',
        `${result.stats.total} testes (${result.stats.passed} pass, ${result.stats.failed} fail)`,
        'ok',
    );

    if (
        result.stats.failed > 0 &&
        (await askConfirm('Deseja criar um relatório de bug (Bug Report) no Jira para as falhas?', false))
    ) {
        const automatedReport = collectAutomated(result);
        await interactiveBugReportFlow(c.jiraResource, c.ctx.project_name, automatedReport, c.linkManager);
    }
}

export default { handler };
