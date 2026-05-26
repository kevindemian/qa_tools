import { confirm, info, warn, success, printError, divider, print } from '../shared/prompt';
import { writeReport } from '../shared/temp-dir';
import { analyzeFailuresWithReport } from '../shared/failure-analysis';
import type { ParseResult } from '../shared/result_parser';
import type { AnalysisReport } from '../shared/failure-analysis';
import { rootLogger } from '../shared/logger';

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

    try {
        const analysis = await analyzeFailuresWithReport(parsed.tests);
        if (!analysis.content) {
            warn('Análise IA retornou vazia (verifique chaves LLM).');
            return;
        }

        if (analysis.fallbackUsed) {
            warn('Análise IA com qualidade reduzida — validação estrutural falhou, usou fallback.');
        }

        const confidenceBadge =
            analysis.confidence === 'high'
                ? ''
                : analysis.confidence === 'medium'
                  ? ' (confiança média)'
                  : ' (confiança baixa)';
        success('Análise de falhas (IA)' + confidenceBadge + ':');
        divider();
        print(analysis.content);
        divider();

        if (analysis.htmlReport) {
            const reportPath = writeReport('failure-analysis-' + Date.now() + '.html', analysis.htmlReport);
            info('Relatório HTML salvo em: ' + reportPath);
        }

        if (onAnalysis) {
            await onAnalysis(analysis);
        }
    } catch (err) {
        printError('Falha ao analisar com IA', err);
        rootLogger.error('LLM pipeline analysis error: ' + (err as Error).message);
    }
}
