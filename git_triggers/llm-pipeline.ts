/** LLM pipeline failure analysis — offer to analyze failures and generate a report. */
import { formatErr } from '../shared/errors.js';
import { confirm, info, warn, success, printError, divider, print } from '../shared/ui/prompt.js';
import { writeReport } from '../shared/infra/temp-dir.js';
import { analyzeFailuresWithReport } from '../shared/validation/failure-analysis.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { AnalysisReport } from '../shared/validation/failure-analysis.js';
import { rootLogger } from '../shared/logger.js';

export async function offerPipelineFailureAnalysis(
    parsed: ParseResult,
    onAnalysis?: (report: AnalysisReport) => Promise<void>,
): Promise<void> {
    const failed = parsed.tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) {
        info('Nenhuma falha para analisar.');
        return;
    }

    if (!confirm('Analisar ' + failed.length + ' falha(s) com IA?', false)) return;

    let analysis: AnalysisReport;
    try {
        analysis = await analyzeFailuresWithReport(parsed.tests);
    } catch (err) {
        // Falha da análise LLM (fronteira externa): degradação explícita e logada.
        // O catch cobre APENAS a chamada de análise — não mascara erros de outras origens.
        printError('Falha ao analisar com IA', err);
        rootLogger.error('LLM pipeline analysis error: ' + formatErr(err));
        return;
    }

    if (!analysis.content) {
        warn('Análise IA retornou vazia (verifique chaves LLM).');
        return;
    }

    if (analysis.fallbackUsed) {
        warn('Análise IA com qualidade reduzida — validação estrutural falhou, usou fallback.');
    }

    let confidenceBadge: string;
    if (analysis.confidence === 'high') {
        confidenceBadge = '';
    } else if (analysis.confidence === 'medium') {
        confidenceBadge = ' (confiança média)';
    } else {
        confidenceBadge = ' (confiança baixa)';
    }
    success('Análise de falhas (IA)' + confidenceBadge + ':');
    divider();
    print(analysis.content);
    divider();

    if (analysis.htmlReport) {
        const reportPath = writeReport('failure-analysis-' + Date.now() + '.html', analysis.htmlReport);
        info('Relatório HTML salvo em: ' + reportPath);
    }

    // Callback do consumidor FORA do catch de análise: erros do consumidor devem
    // propagar (§25 ZERO SILENCING), nunca serem mascarados como "falha de IA".
    if (onAnalysis) {
        await onAnalysis(analysis);
    }
}
