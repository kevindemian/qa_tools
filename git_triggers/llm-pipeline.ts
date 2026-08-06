/** LLM pipeline failure analysis — offer to analyze failures and generate a report. */
import { formatErr } from '../shared/errors.js';
import { confirm, info, warn, success, printError, divider, print } from '../shared/ui/prompt.js';
import { writeReport } from '../shared/infra/temp-dir.js';
import { analyzeFailuresWithReport } from '../shared/validation/failure-analysis.js';
import type { AnalysisReport } from '../shared/validation/failure-analysis.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { DataHub } from '../shared/types/data-hub.js';
import { isDataHubInitialized, getDataHub } from '../shared/data-hub/global-hub.js';
import { createDataHubFromParseResult } from '../shared/data-hub/factory.js';
import { getCurrentProject } from '../shared/project-context.js';
import { rootLogger } from '../shared/logger.js';

export interface OfferPipelineFailureAnalysisOptions {
    /** Hub que reflete o parse sendo analisado (SSOT F0-T8). Obrigatório quando o hub global não está inicializado. */
    dataHub?: DataHub;
    /** Callback do consumidor — executado FORA do catch de análise (§25: erros do consumidor propagam). */
    onAnalysis?: (report: AnalysisReport) => Promise<void>;
}

async function _runAnalysis(hub: DataHub, onAnalysis?: (report: AnalysisReport) => Promise<void>): Promise<void> {
    let analysis: AnalysisReport;
    try {
        analysis = await analyzeFailuresWithReport(hub);
    } catch (err) {
        // Falha da análise LLM / contrato do hub (fronteira externa): degradação
        // explícita e logada. Não mascara erros de outras origens.
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

function _resolveAnalysisRepo(): string {
    return getCurrentProject() ?? process.env['GITHUB_REPOSITORY'] ?? '';
}

export async function offerPipelineFailureAnalysis(
    parsed: ParseResult,
    options?: OfferPipelineFailureAnalysisOptions,
): Promise<void> {
    const failed = parsed.tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) {
        info('Nenhuma falha para analisar.');
        return;
    }

    if (!confirm('Analisar ' + failed.length + ' falha(s) com IA?', false)) return;

    let hub = options?.dataHub ?? (isDataHubInitialized() ? getDataHub() : undefined);
    if (!hub) {
        // Nenhum hub disponível (nem explícito, nem global): constrói um hub
        // dedicado que reflete o parse coletado (defensivo F0-T8). Sem isso, a
        // análise rodaria contra um hub sem o run atual ou nem rodaria — ambos
        // violariam o §25 (perda de capacidade silenciosa).
        try {
            hub = createDataHubFromParseResult(parsed, _resolveAnalysisRepo());
        } catch (err) {
            printError('Falha ao preparar o DataHub para análise', err);
            rootLogger.error('offerPipelineFailureAnalysis: falha ao criar hub dedicado: ' + formatErr(err));
            return;
        }
    }

    await _runAnalysis(hub, options?.onAnalysis);
}
