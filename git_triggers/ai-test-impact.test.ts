import { nonNull } from '../shared/test-utils.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';
import fs from 'fs';
import { assessTestImpact } from './ai-test-impact.js';
import type { GitProvider } from '../shared/types.js';
import { llmPrompt } from '../shared/llm-client.js';

vi.mock('../shared/llm-client');

vi.mock('fs', () => ({
    default: { readFileSync: vi.fn() },
    readFileSync: vi.fn(),
}));

describe('AssessTestImpact', () => {
    const mockProvider: GitProvider = createMockGitProvider();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Should return early when diff is empty', async () => {
        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('');
        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');

        expect(result).toBe('Diff vazio — nenhuma alteração para analisar.');
        expect(llmPrompt).not.toHaveBeenCalled();
    });

    it('Should call llmPrompt with diff and mapping titles', async () => {
        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('diff --git a/src/api.ts b/src/api.ts\n+new endpoint');
        vi.spyOn(fs, 'readFileSync').mockReturnValue(
            JSON.stringify([
                { title: 'Test login', key: 'TEST-1' },
                { title: 'Test register', key: 'TEST-2' },
            ]),
        );
        vi.mocked(llmPrompt).mockResolvedValue('**Risco:** BAIXO. Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main', '/path/mapping.json');

        expect(mockProvider.getDiff).toHaveBeenCalledWith('feature/a', 'main');
        expect(llmPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'fast',
                callerId: 'test-impact',
            }),
        );
        expect(nonNull(vi.mocked(llmPrompt).mock.calls[0])[0].user).toEqual(expect.stringContaining('Test login'));
        expect(result).toBe('**Risco:** BAIXO. Nenhum teste existente afetado.');
    });

    it('Should work without mapping path', async () => {
        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('some diff');
        vi.mocked(llmPrompt).mockResolvedValue('Nenhum teste existente afetado.');

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');

        expect(llmPrompt).toHaveBeenCalled();
        expect(result).toBe('Nenhum teste existente afetado.');
    });

    it('Should return empty on llm error', async () => {
        vi.spyOn(mockProvider, 'getDiff').mockResolvedValue('some diff');
        vi.mocked(llmPrompt).mockRejectedValue(new Error('API error'));

        const result = await assessTestImpact(mockProvider, 'feature/a', 'main');

        expect(result).toBe('');
    });
});
