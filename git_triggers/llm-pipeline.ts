import { confirm, info, warn, success, printError, divider, print } from '../shared/prompt';
import { analyzeFailures } from '../shared/failure-analysis';
import type { ParseResult } from '../shared/result_parser';
import { rootLogger } from '../shared/logger';

export async function offerPipelineFailureAnalysis(parsed: ParseResult): Promise<void> {
    const failed = parsed.tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) {
        info('Nenhuma falha para analisar.');
        return;
    }

    if (!confirm('Analisar ' + failed.length + ' falha(s) com IA?', false)) return;

    try {
        const analysis = await analyzeFailures(parsed.tests);
        if (!analysis) {
            warn('Análise IA retornou vazia (verifique chaves LLM).');
            return;
        }

        success('Análise de falhas (IA):');
        divider();
        print(analysis);
        divider();
    } catch (err) {
        printError('Falha ao analisar com IA', err);
        rootLogger.error('LLM pipeline analysis error: ' + (err as Error).message);
    }
}
