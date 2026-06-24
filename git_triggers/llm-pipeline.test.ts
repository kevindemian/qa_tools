import { confirm, success } from '../shared/prompt.js';
import { analyzeFailuresWithReport } from '../shared/failure-analysis.js';
import type { analyzeFailuresWithReport as AnalyzeFailuresFn } from '../shared/failure-analysis.js';
import type {
    confirm as ConfirmFn,
    info as InfoFn,
    warn as WarnFn,
    success as SuccessFn,
    print as PrintFn,
    printError as PrintErrorFn,
    divider as DividerFn,
} from '../shared/prompt.js';
import { offerPipelineFailureAnalysis } from './llm-pipeline.js';

vi.mock('../shared/temp-dir.js', () => ({
    writeReport: vi.fn(() => '/tmp/report.html'),
}));

vi.mock('../shared/failure-analysis', () => ({
    analyzeFailuresWithReport:
        vi.fn<(...args: Parameters<typeof AnalyzeFailuresFn>) => ReturnType<typeof AnalyzeFailuresFn>>(),
}));

vi.mock('../shared/prompt', () => ({
    confirm: vi.fn<(...args: Parameters<typeof ConfirmFn>) => ReturnType<typeof ConfirmFn>>(),
    info: vi.fn<(...args: Parameters<typeof InfoFn>) => ReturnType<typeof InfoFn>>(),
    warn: vi.fn<(...args: Parameters<typeof WarnFn>) => ReturnType<typeof WarnFn>>(),
    success: vi.fn<(...args: Parameters<typeof SuccessFn>) => ReturnType<typeof SuccessFn>>(),
    print: vi.fn<(...args: Parameters<typeof PrintFn>) => ReturnType<typeof PrintFn>>(),
    printError: vi.fn<(...args: Parameters<typeof PrintErrorFn>) => ReturnType<typeof PrintErrorFn>>(),
    divider: vi.fn<(...args: Parameters<typeof DividerFn>) => ReturnType<typeof DividerFn>>(),
}));

const mockConfirm = vi.mocked(confirm);
const mockAnalyzeFailures = vi.mocked(analyzeFailuresWithReport);
const mockSuccess = vi.mocked(success);

const mockReport = {
    content: '**Analysis:** tests failed due to timeout.',
    htmlReport: '<html>report</html>',
    confidence: 'high' as const,
    fallbackUsed: false,
};

describe('OfferPipelineFailureAnalysis', () => {
    const baseParsed = {
        stats: { passed: 10, failed: 2, skipped: 1, total: 13, duration: 1000 },
        tests: [
            { title: 'test A', state: 'passed' as const, duration: 100 },
            { title: 'test B', state: 'failed' as const, duration: 200 },
            { title: 'test C', state: 'failed' as const, duration: 300 },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should skip analysis when no failed tests', async () => {
        const parsed = {
            stats: { passed: 10, failed: 0, skipped: 0, total: 10, duration: 500 },
            tests: [{ title: 'test A', state: 'passed' as const, duration: 100 }],
        };

        await offerPipelineFailureAnalysis(parsed);

        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('should skip analysis when user declines', async () => {
        mockConfirm.mockReturnValue(false);
        await offerPipelineFailureAnalysis(baseParsed);

        expect(mockConfirm).toHaveBeenCalledWith('Analisar 2 falha(s) com IA?', false);
        expect(mockAnalyzeFailures).not.toHaveBeenCalled();
    });

    it('should call analyzeFailuresWithReport and print success on analysis', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockResolvedValue(mockReport);

        await offerPipelineFailureAnalysis(baseParsed);

        expect(mockAnalyzeFailures).toHaveBeenCalledWith(baseParsed.tests);
        expect(mockSuccess).toHaveBeenCalledWith('Análise de falhas (IA):');
    });

    it('should handle empty analysis response', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockResolvedValue({ ...mockReport, content: '' });

        await offerPipelineFailureAnalysis(baseParsed);

        expect(mockAnalyzeFailures).toHaveBeenCalled();
    });

    it('should handle analyzeFailuresWithReport throwing', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockRejectedValue(new Error('API error'));

        await expect(offerPipelineFailureAnalysis(baseParsed)).resolves.not.toThrow();
    });
});
