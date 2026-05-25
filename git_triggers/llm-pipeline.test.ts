import { offerPipelineFailureAnalysis } from './llm-pipeline';
import { analyzeFailures } from '../shared/failure-analysis';

jest.mock('../shared/failure-analysis');

jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    print: jest.fn(),
    printError: jest.fn(),
    divider: jest.fn(),
}));

const mockConfirm = require('../shared/prompt').confirm as jest.Mock;
const mockAnalyzeFailures = analyzeFailures as jest.Mock;
const mockSuccess = require('../shared/prompt').success as jest.Mock;

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

    it('should call analyzeFailures and print success on analysis', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockResolvedValue('**Análise:** os testes falharam por timeout.');

        await offerPipelineFailureAnalysis(baseParsed);
        expect(mockAnalyzeFailures).toHaveBeenCalledWith(baseParsed.tests);
        expect(mockSuccess).toHaveBeenCalledWith('Análise de falhas (IA):');
    });

    it('should handle empty analysis response', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockResolvedValue('');

        await offerPipelineFailureAnalysis(baseParsed);
        expect(mockAnalyzeFailures).toHaveBeenCalled();
    });

    it('should handle analyzeFailures throwing', async () => {
        mockConfirm.mockReturnValue(true);
        mockAnalyzeFailures.mockRejectedValue(new Error('API error'));

        await expect(offerPipelineFailureAnalysis(baseParsed)).resolves.not.toThrow();
    });
});
