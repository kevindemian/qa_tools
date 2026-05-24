import { buildSplashLines, showSplash, __setFigletDep, __setGradientDep } from './splash';

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
});

jest.mock('./output', () => ({
    defaultOutput: {
        box: jest.fn(),
    },
}));

describe('showSplash', () => {
    const mockFiglet = { textSync: jest.fn().mockReturnValue('QA TOOLS\n======') };
    const mockGradientColor = jest.fn((text: string) => text);
    const mockGradient = jest.fn(() => mockGradientColor);

    beforeEach(() => {
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
        const output = require('./output');
        expect(output.defaultOutput.box).toHaveBeenCalled();
        const [lines] = output.defaultOutput.box.mock.calls[0];
        expect(lines.join('\n')).toContain('/tmp/state.json');
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
});
