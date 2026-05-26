import fs from 'fs';
import path from 'path';
import { ask, askConfirm, info, printError, title, withSpinner } from '../../shared/prompt';
import { parseCypressResults } from '../../shared/result_parser';
import { generateHtmlReport } from '../../shared/report-generator';
import { analyzeFailures } from '../../shared/failure-analysis';
import type { CommandContext } from './context';

function injectAnalysisSection(html: string, analysis: string): string {
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd === -1) return html;
    const section = `<div class="chart-box"><h2>Failure Analysis</h2><pre style="white-space:pre-wrap;font-size:0.85rem">${analysis.replace(/</g, '&lt;')}</pre></div>`;
    return html.slice(0, bodyEnd) + section + html.slice(bodyEnd);
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const filePath = await ask('Caminho do arquivo mochawesome JSON', {
        hint: 'ex: cypress/reports/mochawesome.json',
    });
    if (!filePath.trim()) {
        printError('Relatório HTML', new Error('Caminho do arquivo vazio.'));
        return;
    }

    title('Analisando relatório...');
    const result = parseCypressResults(filePath.trim());
    if (result.error) {
        printError('Erro ao ler relatório', new Error(result.error));
        return;
    }

    let html = generateHtmlReport(result.tests, {
        title: `Relatório - ${c.ctx.project_name}`,
    });

    if (result.stats.failed > 0 && (await askConfirm('Incluir análise das falhas (IA)?', true))) {
        const analysis = await withSpinner('Analisando falhas com IA...', () => analyzeFailures(result.tests));
        if (analysis) {
            html = injectAnalysisSection(html, analysis);
        }
    }

    const defaultName = `report-${c.ctx.project_name}-${Date.now()}.html`;
    const outPath = await ask('Caminho de saída do HTML', { default: defaultName });
    const resolvedPath = path.resolve(outPath.trim() || defaultName);

    fs.writeFileSync(resolvedPath, html, 'utf8');

    info(`Relatório HTML gerado: ${resolvedPath}`);
    c.pushHistory(
        'html-report',
        `${result.stats.total} testes (${result.stats.passed} pass, ${result.stats.failed} fail)`,
        'ok',
    );
}

export default { handler };
