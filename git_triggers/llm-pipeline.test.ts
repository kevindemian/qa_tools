import { confirm, success } from '../shared/prompt';
import { analyzeFailuresWithReport } from '../shared/failure-analysis';
import type { analyzeFailuresWithReport as AnalyzeFailuresFn } from '../shared/failure-analysis';
import type {
    confirm as ConfirmFn,
    info as InfoFn,
    warn as WarnFn,
    success as SuccessFn,
    print as PrintFn,
    printError as PrintErrorFn,
    divider as DividerFn,
} from '../shared/prompt';
import { offerPipelineFailureAnalysis } from './llm-pipeline';

jest.mock('../shared/failure-analysis', () => ({
    analyzeFailuresWithReport: jest.fn<ReturnType<typeof AnalyzeFailuresFn>, Parameters<typeof AnalyzeFailuresFn>>(),
}));

jest.mock('../shared/prompt', () => ({
    confirm: jest.fn<ReturnType<typeof ConfirmFn>, Parameters<typeof ConfirmFn>>(),
    info: jest.fn<ReturnType<typeof InfoFn>, Parameters<typeof InfoFn>>(),
    warn: jest.fn<ReturnType<typeof WarnFn>, Parameters<typeof WarnFn>>(),
    success: jest.fn<ReturnType<typeof SuccessFn>, Parameters<typeof SuccessFn>>(),
    print: jest.fn<ReturnType<typeof PrintFn>, Parameters<typeof PrintFn>>(),
    printError: jest.fn<ReturnType<typeof PrintErrorFn>, Parameters<typeof PrintErrorFn>>(),
    divider: jest.fn<ReturnType<typeof DividerFn>, Parameters<typeof DividerFn>>(),
}));

const mockConfirm = jest.mocked(confirm);
const mockAnalyzeFailures = jest.mocked(analyzeFailuresWithReport);
const mockSuccess = jest.mocked(success);

const mockReport = {
    content: '**Analysis:** tests failed due to timeout.',
    htmlReport: '<html>report</html>',
    confidence: 'high' as const,
    fallbackUsed: false,
};

describe('offerPipelineFailureAnalysis', () => {
    const baseParsed = {
        stats: { passed: 10, failed: 2, skipped: 1, total: 13, duration: 1000 },
        tests: [
            { title: 'test A', state: 'passed' as const, duration: 100 },
            { title: 'test B', state: 'failed' as const, duration: 200 },
            { title: 'test C', state: 'failed' as const, duration: 300 },
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();
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
