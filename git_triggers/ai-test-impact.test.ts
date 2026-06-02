import { nonNull } from '../shared/test-utils';
import { createMockGitProvider } from '../shared/test-utils/factories';
import fs from 'fs';
import { assessTestImpact } from './ai-test-impact';
import type { GitProvider } from '../shared/types';
import { llmPrompt } from '../shared/llm-client';

jest.mock('../shared/llm-client');

jest.mock('fs', () => ({
    ...jest.requireActual<typeof import('fs')>('fs'),
    readFileSync: jest.fn(),
}));

describe('assessTestImpact', () => {
    const mockProvider: GitProvider = createMockGitProvider();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return early when diff is empty', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('');
        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(result).toBe('Diff vazio — nenhuma alteração para analisar.');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('should call llmPrompt with diff and mapping titles', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('diff --git a/src/api.ts b/src/api.ts\n+new endpoint');
        jest.mocked(fs.readFileSync).mockReturnValue(
            JSON.stringify([
                { title: 'Test login', key: 'TEST-1' },
                { title: 'Test register', key: 'TEST-2' },
            ]),
        );
        jest.mocked(llmPrompt).mockResolvedValue('**Risco:** BAIXO. Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main', '/path/mapping.json');
        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'fast',
                callerId: 'test-impact',
            }),
        );
        expect(nonNull(jest.mocked(llmPrompt).mock.calls[0])[0].user).toEqual(expect.stringContaining('Test login'));
        expect(result).toBe('**Risco:** BAIXO. Nenhum teste existente afetado.');
    });

    it('should work without mapping path', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('some diff');
        jest.mocked(llmPrompt).mockResolvedValue('Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalled();
        expect(result).toBe('Nenhum teste existente afetado.');
    });

    it('should return empty on llm error', async () => {
        jest.mocked(mockProvider.getDiff).mockResolvedValue('some diff');
        jest.mocked(llmPrompt).mockRejectedValue(new Error('API error'));

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');
        expect(result).toBe('');
    });
});
