import fs from 'fs';
import { assessTestImpact } from './ai-test-impact';
import type { GitProvider } from '../shared/types';
import { llmPrompt } from '../shared/llm-client';

jest.mock('../shared/llm-client');

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn(),
}));

describe('assessTestImpact', () => {
    const mockProvider: GitProvider = {
        getDiff: jest.fn(),
    } as unknown as GitProvider;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return early when diff is empty', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('');
        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(result).toBe('Diff vazio — nenhuma alteração para analisar.');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('should call llmPrompt with diff and mapping titles', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('diff --git a/src/api.ts b/src/api.ts\n+new endpoint');
        (fs.readFileSync as jest.Mock).mockReturnValue(
            JSON.stringify([
                { title: 'Test login', key: 'TEST-1' },
                { title: 'Test register', key: 'TEST-2' },
            ]),
        );
        (llmPrompt as jest.Mock).mockResolvedValue('**Risco:** BAIXO. Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main', '/path/mapping.json');
        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            'fast',
            expect.any(String),
            expect.stringContaining('Test login'),
            'test-impact',
        );
        expect(result).toBe('**Risco:** BAIXO. Nenhum teste existente afetado.');
    });

    it('should work without mapping path', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('some diff');
        (llmPrompt as jest.Mock).mockResolvedValue('Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalled();
        expect(result).toBe('Nenhum teste existente afetado.');
    });

    it('should return empty on llm error', async () => {
        (mockProvider.getDiff as jest.Mock).mockResolvedValue('some diff');
        (llmPrompt as jest.Mock).mockRejectedValue(new Error('API error'));

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
    });
});
