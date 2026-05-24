import { buildSplashLines, showSplash, checkJiraStatus, __setFigletDep, __setGradientDep } from './splash';

describe('buildSplashLines', () => {
    it('formats logo lines with help hint', () => {
        const lines = buildSplashLines('QA TOOLS\n======');
        const output = lines.join('\n');
        expect(output).toContain('QA TOOLS');
        expect(output).toContain('/help');
        expect(output).toContain('Gestão');
    });

    it('includes statePath when provided', () => {
        const lines = buildSplashLines('QA TOOLS', '/path/to/state.json');
        const output = lines.join('\n');
        expect(output).toContain('/path/to/state.json');
    });

    it('omits statePath when not provided', () => {
        const lines = buildSplashLines('QA TOOLS');
        const output = lines.join('\n');
        expect(output).not.toContain('State:');
    });

    it('handles empty logo gracefully', () => {
        const lines = buildSplashLines('');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toBe('');
    });

    it('skips blank logo lines', () => {
        const lines = buildSplashLines('\n\n');
        const output = lines.join('\n');
        expect(output).toContain('Gestão');
    });

    it('includes status checks when provided', () => {
        const lines = buildSplashLines('QA TOOLS', undefined, [
            { label: 'Jira API', status: 'ok', detail: 'online' },
            { label: 'Token', status: 'info', detail: 'não configurado' },
        ]);
        const output = lines.join('\n');
        expect(output).toContain('Jira API');
        expect(output).toContain('Token');
        expect(output).toContain('online');
    });
});

jest.mock('./output', () => ({
    Output: { isTTY: jest.fn().mockReturnValue(true), isCI: jest.fn().mockReturnValue(false) },
    defaultOutput: { box: jest.fn(), print: jest.fn() },
}));

describe('checkJiraStatus', () => {
    it('returns info when URL is empty', async () => {
        const result = await checkJiraStatus('', '');
        expect(result.status).toBe('info');
        expect(result.detail).toContain('não configurado');
    });

    it('returns info when token is empty', async () => {
        const result = await checkJiraStatus('https://jira.example.com', '');
        expect(result.status).toBe('info');
        expect(result.detail).toContain('não configurado');
    });
});

describe('showSplash', () => {
    const mockFiglet = { textSync: jest.fn().mockReturnValue('QA TOOLS\n======') };
    const mockGradientColor = jest.fn((text: string) => text);
    const mockGradient = jest.fn(() => mockGradientColor);
    let outputMod: { Output: { isTTY: jest.Mock }; defaultOutput: { box: jest.Mock; print: jest.Mock } };

    beforeEach(() => {
        outputMod = require('./output') as typeof outputMod;
        outputMod.Output.isTTY.mockReturnValue(true);
        __setFigletDep(mockFiglet);
        __setGradientDep({ default: mockGradient });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('renders splash with figlet and gradient', async () => {
        await expect(showSplash()).resolves.not.toThrow();
        expect(mockFiglet.textSync).toHaveBeenCalledWith('QA TOOLS', { font: 'ANSI Shadow' });
        expect(mockGradient).toHaveBeenCalledWith(['#58a6ff', '#bc8cff']);
    });

    it('includes statePath when provided', async () => {
        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalled();
        const [lines] = outputMod.defaultOutput.box.mock.calls[0];
        expect(lines.join('\n')).toContain('/tmp/state.json');
    });

    it('shows token status check without jiraBaseUrl', async () => {
        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalled();
        const [lines] = outputMod.defaultOutput.box.mock.calls[0];
        expect(lines.join('\n')).toContain('Token');
    });

    it('handles figlet textSync failure', async () => {
        mockFiglet.textSync.mockImplementationOnce(() => {
            throw new Error('no TTY');
        });
        await expect(showSplash()).resolves.not.toThrow();
    });

    it('handles gradient failure', async () => {
        mockGradient.mockImplementationOnce(() => {
            throw new Error('fail');
        });
        await expect(showSplash()).resolves.not.toThrow();
    });

    it('prints plain text when not TTY', async () => {
        outputMod.Output.isTTY.mockReturnValue(false);
        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });
});
