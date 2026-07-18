/**
 * Integração real de offerPipelineFailureAnalysis.
 *
 * Fronteiras externas (únicas mockadas):
 *   - `readline-sync` (lib de terceiros que lê o TTY interativo)
 *   - `analyzeFailuresWithReport` (chamada LLM externa)
 *
 * Tudo mais roda REAL e integrado:
 *   - confirm/info/success/warn/print/divider (prompt real, saída silenciada via config quiet)
 *   - writeReport (I/O de disco REAL, direcionado a um temp dir via QA_TOOLS_REPORTS_DIR)
 *   - o side effect é validado no disco (o arquivo HTML existe de fato).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readlineSync } from '../../shared/deps.js';
import Config from '../../shared/config-accessor.js';
import { analyzeFailuresWithReport } from '../../shared/validation/failure-analysis.js';
import type { analyzeFailuresWithReport as AnalyzeFailuresFn } from '../../shared/validation/failure-analysis.js';
import type { AnalysisReport } from '../../shared/validation/failure-analysis.js';
import { offerPipelineFailureAnalysis } from '../llm-pipeline.js';

vi.mock('../../shared/validation/failure-analysis.js', () => ({
    analyzeFailuresWithReport:
        vi.fn<(...args: Parameters<typeof AnalyzeFailuresFn>) => ReturnType<typeof AnalyzeFailuresFn>>(),
}));

const mockAnalyzeFailures = vi.mocked(analyzeFailuresWithReport);

let reportsDir: string;
let originalStdinTTY: unknown;

const baseReport: AnalysisReport = {
    content: '**Analysis:** tests failed due to timeout.',
    htmlReport: '<html>report</html>',
    confidence: 'high',
    fallbackUsed: false,
};

const baseParsed = {
    stats: { passed: 10, failed: 2, skipped: 1, total: 13, duration: 1000 },
    tests: [
        { title: 'test A', state: 'passed' as const, duration: 100 },
        { title: 'test B', state: 'failed' as const, duration: 200 },
        { title: 'test C', state: 'failed' as const, duration: 300 },
    ],
};

/** Simula o operador respondendo ao confirm interativo (fronteira TTY). */
function answerConfirm(yes: boolean): void {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.spyOn(readlineSync, 'question').mockReturnValue(yes ? 'y' : 'n');
}

function findWrittenReport(): string | null {
    if (!existsSync(reportsDir)) return null;
    for (const dateDir of readdirSync(reportsDir)) {
        const full = join(reportsDir, dateDir);
        for (const f of readdirSync(full)) {
            if (f.startsWith('failure-analysis-') && f.endsWith('.html')) return join(full, f);
        }
    }
    return null;
}

describe('OfferPipelineFailureAnalysis — integração real', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reportsDir = mkdtempSync(join(tmpdir(), 'llm-pipeline-reports-'));
        Config.set('QA_TOOLS_REPORTS_DIR', reportsDir);
        Config.set('quiet', true);
        originalStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    });

    afterEach(() => {
        rmSync(reportsDir, { recursive: true, force: true });
        if (originalStdinTTY) {
            Object.defineProperty(process.stdin, 'isTTY', originalStdinTTY as PropertyDescriptor);
        }
        vi.restoreAllMocks();
    });

    it('não chama a análise quando não há testes falhos', async () => {
        expect.assertions(1);

        const parsed = {
            stats: { passed: 10, failed: 0, skipped: 0, total: 10, duration: 500 },
            tests: [{ title: 'test A', state: 'passed' as const, duration: 100 }],
        };

        await offerPipelineFailureAnalysis(parsed);

        expect(mockAnalyzeFailures).not.toHaveBeenCalled();
    });

    it('não chama a análise quando o operador recusa o confirm (TTY real)', async () => {
        expect.assertions(1);

        answerConfirm(false);

        await offerPipelineFailureAnalysis(baseParsed);

        expect(mockAnalyzeFailures).not.toHaveBeenCalled();
    });

    it('efeito colateral real: escreve o relatório HTML no disco quando há htmlReport', async () => {
        expect.assertions(3);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue(baseReport);

        await offerPipelineFailureAnalysis(baseParsed);

        expect(mockAnalyzeFailures).toHaveBeenCalledWith(baseParsed.tests);

        const written = findWrittenReport();

        expect(written).not.toBeNull();
        expect(readFileSync(written as string, 'utf8')).toBe('<html>report</html>');
    });

    it('não escreve arquivo quando análise retorna conteúdo vazio', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue({ ...baseReport, content: '' });

        await offerPipelineFailureAnalysis(baseParsed);

        expect(findWrittenReport()).toBeNull();
    });

    it('não escreve arquivo quando htmlReport está ausente, mas conclui sem erro', async () => {
        expect.assertions(1);

        answerConfirm(true);
        const noHtml: AnalysisReport = {
            content: baseReport.content,
            confidence: baseReport.confidence,
            fallbackUsed: baseReport.fallbackUsed,
        };
        mockAnalyzeFailures.mockResolvedValue(noHtml);

        await offerPipelineFailureAnalysis(baseParsed);

        expect(findWrittenReport()).toBeNull();
    });

    it('efeito colateral: invoca onAnalysis com o report exato após escrever o arquivo', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue(baseReport);
        const received: AnalysisReport[] = [];

        await offerPipelineFailureAnalysis(baseParsed, (r) => {
            received.push(r);
            return Promise.resolve();
        });

        expect(received).toStrictEqual([baseReport]);
    });

    it('não invoca onAnalysis quando o conteúdo da análise é vazio', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue({ ...baseReport, content: '' });
        const onAnalysis = vi.fn().mockResolvedValue(undefined);

        await offerPipelineFailureAnalysis(baseParsed, onAnalysis);

        expect(onAnalysis).not.toHaveBeenCalled();
    });

    it('processa confidence=medium sem lançar (badge de confiança média)', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue({ ...baseReport, confidence: 'medium' });
        const onAnalysis = vi.fn().mockResolvedValue(undefined);

        await offerPipelineFailureAnalysis(baseParsed, onAnalysis);

        expect(onAnalysis).toHaveBeenCalledWith({ ...baseReport, confidence: 'medium' });
    });

    it('processa confidence=low sem lançar (badge de confiança baixa)', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue({ ...baseReport, confidence: 'low' });
        const onAnalysis = vi.fn().mockResolvedValue(undefined);

        await offerPipelineFailureAnalysis(baseParsed, onAnalysis);

        expect(onAnalysis).toHaveBeenCalledWith({ ...baseReport, confidence: 'low' });
    });

    it('processa fallbackUsed=true escrevendo o relatório mesmo com qualidade reduzida', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue({ ...baseReport, fallbackUsed: true });

        await offerPipelineFailureAnalysis(baseParsed);

        expect(findWrittenReport()).not.toBeNull();
    });

    it('tratamento de erro: não relança quando a análise LLM rejeita (degradação explícita via log)', async () => {
        expect.assertions(2);

        answerConfirm(true);
        mockAnalyzeFailures.mockRejectedValue(new Error('API error'));

        await expect(offerPipelineFailureAnalysis(baseParsed)).resolves.not.toThrow();
        expect(findWrittenReport()).toBeNull();
    });

    it('tratamento de erro: propaga rejeição do onAnalysis (não engole callback do consumidor)', async () => {
        expect.assertions(1);

        answerConfirm(true);
        mockAnalyzeFailures.mockResolvedValue(baseReport);

        await expect(
            offerPipelineFailureAnalysis(baseParsed, () => {
                throw new Error('consumer callback failed');
            }),
        ).rejects.toThrow('consumer callback failed');
    });
});
