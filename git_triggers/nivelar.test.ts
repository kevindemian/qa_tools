import * as prompt from '../shared/prompt.js';
import type { Mock, Mocked } from 'vitest';
import { nivelarBranches } from './nivelar.js';
import type { GitProvider } from '../shared/types.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';

vi.mock('../shared/prompt', async () => ({
    ask: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    printError: vi.fn(),
    Spinner: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
    withSpinner: vi.fn().mockImplementation(async (_label: string, fn: () => Promise<void>) => fn()),
}));

describe('nivelarBranches', () => {
    let mockGitlab: Mocked<GitProvider>;
    let pushHistory: Mock;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGitlab = createMockGitProvider();
        mockGitlab.getBranch.mockResolvedValue({ name: 'branch' });

        pushHistory = vi.fn();
    });

    it('cria dois MRs e chama pushHistory com ok', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockResolvedValueOnce({ web_url: 'https://mr1' })
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(vi.mocked(prompt.info)).toHaveBeenCalledWith('MR criado: https://mr1');
        expect(vi.mocked(prompt.success)).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining('main->rel_cand:ok'), 'ok');
    });

    it('continua para segundo MR quando primeiro falha', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('Conflict'))
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(vi.mocked(prompt.printError)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(prompt.success)).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('registra erro quando ambos falham', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('First fail'))
            .mockRejectedValueOnce(new Error('Second fail'));

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(vi.mocked(prompt.printError)).toHaveBeenCalledTimes(2);
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('aborta quando branch não existe', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('inexistente')
            .mockResolvedValueOnce('dev');
        mockGitlab.getBranch
            .mockResolvedValueOnce({ name: 'main' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ name: 'dev' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
        expect(vi.mocked(prompt.warn)).toHaveBeenCalledWith(expect.stringContaining('inexistente'));
    });

    it('warn quando branches são iguais', async () => {
        vi.mocked(prompt.ask).mockResolvedValueOnce('main').mockResolvedValueOnce('main').mockResolvedValueOnce('dev');

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(vi.mocked(prompt.warn)).toHaveBeenCalledWith('Branches devem ser diferentes entre si.');
        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
    });

    it('warn quando branches são vazios', async () => {
        vi.mocked(prompt.ask).mockResolvedValueOnce('').mockResolvedValueOnce('rel_cand').mockResolvedValueOnce('dev');

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(vi.mocked(prompt.warn)).toHaveBeenCalledWith('Todas as branches devem ser preenchidas.');
        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
    });

    it('warn quando todas as branches são inexistentes', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.getBranch.mockResolvedValue(null);

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
        expect(vi.mocked(prompt.warn)).toHaveBeenCalledWith('Branch(es) não encontrada(s): main, rel_cand, dev');
    });

    it('passa parametros corretos para createMergeRequest', async () => {
        vi.mocked(prompt.ask)
            .mockResolvedValueOnce('feature-x')
            .mockResolvedValueOnce('staging')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest.mockResolvedValue({ web_url: 'https://mr' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenNthCalledWith(
            1,
            'feature-x',
            'staging',
            'chore: nivelamento feature-x -> staging',
            'Nivelamento automatico de branches: feature-x -> staging',
        );
        expect(mockGitlab.createMergeRequest).toHaveBeenNthCalledWith(
            2,
            'staging',
            'dev',
            'chore: nivelamento staging -> dev',
            'Nivelamento automatico de branches: staging -> dev',
        );
    });
});
