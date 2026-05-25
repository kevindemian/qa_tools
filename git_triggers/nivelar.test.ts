import * as prompt from '../shared/prompt';
import { nivelarBranches } from './nivelar';
import type { GitProvider } from '../shared/types';

jest.mock('../shared/prompt', () => ({
    ask: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    printError: jest.fn(),
    Spinner: jest.fn().mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
    withSpinner: jest.fn().mockImplementation(async (label: string, fn: () => Promise<unknown>) => fn()),
}));

describe('nivelarBranches', () => {
    let mockGitlab: {
        createMergeRequest: jest.Mock;
        getBranch: jest.Mock;
    };
    let pushHistory: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGitlab = {
            createMergeRequest: jest.fn(),
            getBranch: jest.fn().mockResolvedValue({ name: 'branch' }),
        };
        pushHistory = jest.fn();
    });

    it('cria dois MRs e chama pushHistory com ok', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockResolvedValueOnce({ web_url: 'https://mr1' })
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(jest.mocked(prompt.info)).toHaveBeenCalledWith('MR criado: https://mr1');
        expect(jest.mocked(prompt.success)).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining('main->rel_cand:ok'), 'ok');
    });

    it('continua para segundo MR quando primeiro falha', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('Conflict'))
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(jest.mocked(prompt.printError)).toHaveBeenCalledTimes(1);
        expect(jest.mocked(prompt.success)).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('registra erro quando ambos falham', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('First fail'))
            .mockRejectedValueOnce(new Error('Second fail'));

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(jest.mocked(prompt.printError)).toHaveBeenCalledTimes(2);
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('aborta quando branch não existe', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('inexistente')
            .mockResolvedValueOnce('dev');
        mockGitlab.getBranch
            .mockResolvedValueOnce({ name: 'main' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ name: 'dev' });

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
        expect(jest.mocked(prompt.warn)).toHaveBeenCalledWith(expect.stringContaining('inexistente'));
    });

    it('warn quando branches são iguais', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('dev');

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(jest.mocked(prompt.warn)).toHaveBeenCalledWith('Branches devem ser diferentes entre si.');
        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
    });

    it('warn quando branches são vazios', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(jest.mocked(prompt.warn)).toHaveBeenCalledWith('Todas as branches devem ser preenchidas.');
        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
    });

    it('warn quando todas as branches são inexistentes', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('rel_cand')
            .mockResolvedValueOnce('dev');
        mockGitlab.getBranch.mockResolvedValue(null);

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
        expect(jest.mocked(prompt.warn)).toHaveBeenCalledWith('Branch(es) não encontrada(s): main, rel_cand, dev');
    });

    it('passa parametros corretos para createMergeRequest', async () => {
        (prompt.ask as jest.Mock)
            .mockResolvedValueOnce('feature-x')
            .mockResolvedValueOnce('staging')
            .mockResolvedValueOnce('dev');
        mockGitlab.createMergeRequest.mockResolvedValue({ web_url: 'https://mr' });

        await nivelarBranches(mockGitlab as unknown as GitProvider, { pushHistory });

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
