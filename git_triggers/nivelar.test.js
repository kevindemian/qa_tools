jest.mock('../shared/prompt', () => ({
    prompt: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    printError: jest.fn(),
    Spinner: jest.fn().mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() })),
    withSpinner: jest.fn().mockImplementation(async (label, fn) => fn()),
}));

const prompt = require('../shared/prompt');
const { nivelarBranches } = require('./nivelar');

describe('nivelarBranches', () => {
    let mockGitlab;
    let pushHistory;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGitlab = {
            createMergeRequest: jest.fn(),
            getBranch: jest.fn().mockResolvedValue({ name: 'branch' }),
        };
        pushHistory = jest.fn();
    });

    it('cria dois MRs e chama pushHistory com ok', async () => {
        prompt.prompt.mockReturnValueOnce('main').mockReturnValueOnce('rel_cand').mockReturnValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockResolvedValueOnce({ web_url: 'https://mr1' })
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(prompt.info).toHaveBeenCalledWith('MR criado: https://mr1');
        expect(prompt.success).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining('main->rel_cand:ok'), 'ok');
    });

    it('continua para segundo MR quando primeiro falha', async () => {
        prompt.prompt.mockReturnValueOnce('main').mockReturnValueOnce('rel_cand').mockReturnValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('Conflict'))
            .mockResolvedValueOnce({ web_url: 'https://mr2' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(prompt.printError).toHaveBeenCalledTimes(1);
        expect(prompt.success).toHaveBeenCalledWith('Segundo MR criado: https://mr2');
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('registra erro quando ambos falham', async () => {
        prompt.prompt.mockReturnValueOnce('main').mockReturnValueOnce('rel_cand').mockReturnValueOnce('dev');
        mockGitlab.createMergeRequest
            .mockRejectedValueOnce(new Error('First fail'))
            .mockRejectedValueOnce(new Error('Second fail'));

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).toHaveBeenCalledTimes(2);
        expect(prompt.printError).toHaveBeenCalledTimes(2);
        expect(pushHistory).toHaveBeenCalledWith('nivelamento', expect.stringContaining(':error'), 'error');
    });

    it('aborta quando branch não existe', async () => {
        prompt.prompt.mockReturnValueOnce('main').mockReturnValueOnce('inexistente').mockReturnValueOnce('dev');
        mockGitlab.getBranch
            .mockResolvedValueOnce({ name: 'main' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ name: 'dev' });

        await nivelarBranches(mockGitlab, { pushHistory });

        expect(mockGitlab.createMergeRequest).not.toHaveBeenCalled();
        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('inexistente'));
    });

    it('passa parametros corretos para createMergeRequest', async () => {
        prompt.prompt.mockReturnValueOnce('feature-x').mockReturnValueOnce('staging').mockReturnValueOnce('dev');
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
