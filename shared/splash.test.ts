import { nonNull } from './test-utils.js';
import type { Mock } from 'vitest';
import http from 'http';
import {
    buildSplashLines,
    showSplash,
    checkJiraStatus,
    __setFigletDep,
    __setGradientDep,
    __setHttpsDep,
    __setHttpDep,
} from './splash.js';

describe('BuildSplashLines', () => {
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

    it('renders error status with red dot', () => {
        const lines = buildSplashLines('QA TOOLS', undefined, [
            { label: 'Jira API', status: 'error', detail: 'offline' },
        ]);
        const output = lines.join('\n');

        expect(output).toContain('Jira API');
        expect(output).toContain('offline');
    });
});

vi.mock('gradient-string', () => ({ default: undefined }));

vi.mock('./output', () => ({
    Output: { isTTY: vi.fn().mockReturnValue(true), isCI: vi.fn().mockReturnValue(false) },
    defaultOutput: { box: vi.fn(), print: vi.fn() },
}));

describe('CheckJiraStatus', () => {
    it('returns info when URL is empty', async () => {expect.hasAssertions();

        const result = await checkJiraStatus('', '');

        expect(result.status).toBe('info');
        expect(result.detail).toContain('não configurado');
    });

    it('returns info when token is empty', async () => {expect.hasAssertions();

        const result = await checkJiraStatus('https://jira.example.com', '');

        expect(result.status).toBe('info');
        expect(result.detail).toContain('não configurado');
    });

    describe('HTTP request paths', () => {
        let server: http.Server;
        let port: number;

        beforeAll(async () => {
            __setHttpDep(http);
            __setHttpsDep(await import('https'));
            server = http.createServer((_req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({}));
            });
            await new Promise<void>((resolve) => {
                server.listen(0, () => {
                    port = (server.address() as { port: number }).port;
                    resolve();
                });
            });
        });

        afterAll(async () => {
            await new Promise<void>((resolve, _reject) => server.close((err) => (err ? _reject(err) : resolve())));
        });

        it('returns ok when HTTP request succeeds', async () => {expect.hasAssertions();

            const result = await checkJiraStatus(`http://localhost:${port}`, 'valid-token');

            expect(result.status).toBe('ok');
            expect(result.detail).toContain('online');
        });

        it('returns error on connection failure', async () => {expect.hasAssertions();

            const result = await checkJiraStatus('http://localhost:49872', 'valid-token');

            expect(result.status).toBe('error');
        });

        it('returns error on timeout', async () => {expect.hasAssertions();

            const mockReq = { on: vi.fn(), setTimeout: vi.fn(), destroy: vi.fn() };
            mockReq.setTimeout.mockImplementation((_ms: number, handler: () => void) => {
                handler();
                return mockReq;
            });
            __setHttpDep({ get: vi.fn(() => mockReq) });
            const result = await checkJiraStatus('http://localhost:1', 'valid-token');

            expect(result.status).toBe('error');
            expect(mockReq.destroy).toHaveBeenCalledWith();

            __setHttpDep(http);
        });

        it('succeeds with explicit server mode', async () => {expect.hasAssertions();

            const result = await checkJiraStatus(`http://localhost:${port}`, 'valid-token', 'server');

            expect(result.status).toBe('ok');
            expect(result.detail).toContain('online');
        });

        it('succeeds with explicit cloud mode', async () => {expect.hasAssertions();

            const result = await checkJiraStatus(`http://localhost:${port}`, 'email:apiToken', 'cloud');

            expect(result.status).toBe('ok');
            expect(result.detail).toContain('online');
        });

        it('falls back to server mode when mode is not provided', async () => {expect.hasAssertions();

            const result = await checkJiraStatus(`http://localhost:${port}`, 'valid-token');

            expect(result.status).toBe('ok');
            expect(result.detail).toContain('online');
        });

        it('handles https dynamic import fallback failure', async () => {expect.hasAssertions();

            __setHttpsDep(undefined);
            const result = await checkJiraStatus('https://jira.example.com', 'valid-token');

            expect(result.status).toBe('error');

            __setHttpsDep(await import('https'));
        });

        it('handles http dynamic import fallback failure', async () => {expect.hasAssertions();

            __setHttpDep(undefined);
            const result = await checkJiraStatus('http://localhost:49873', 'valid-token');

            expect(result.status).toBe('error');

            __setHttpDep(http);
        });
    });
});

describe('ShowSplash', () => {
    const mockFiglet = { textSync: vi.fn().mockReturnValue('QA TOOLS\n======') };
    const mockGradientColor = vi.fn((text: string) => text);
    const mockGradient = vi.fn(() => mockGradientColor);
    let outputMod: {
        Output: { isTTY: Mock<(...args: []) => boolean>; isCI: Mock<(...args: []) => boolean> };
        defaultOutput: { box: Mock<(...args: [string[]]) => void>; print: Mock };
    };

    const mockHttpsModule = {
        get(_url: string, _opts: unknown, cb: (res: { resume: () => void }) => void) {
            cb({ resume: () => {} });
            return { on: () => {}, setTimeout: () => {}, destroy: () => {} };
        },
    };

    beforeEach(async () => {
        outputMod = await vi.importMock<typeof outputMod>('./output');
        outputMod.Output.isTTY.mockReturnValue(true);
        outputMod.Output.isCI.mockReturnValue(false);
        __setFigletDep(mockFiglet);
        __setGradientDep({ default: mockGradient });
        __setHttpDep(http);
        __setHttpsDep(mockHttpsModule);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders splash with figlet and gradient', async () => {expect.hasAssertions();
        await expect(showSplash()).resolves.not.toThrow();
        expect(mockFiglet.textSync).toHaveBeenCalledWith('QA TOOLS', { font: 'ANSI Shadow' });
        expect(mockGradient).toHaveBeenCalledWith(['#58a6ff', '#bc8cff']);
    });

    it('includes statePath when provided', async () => {expect.hasAssertions();
        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalledWith();

        const outputLines = nonNull(outputMod.defaultOutput.box.mock.calls[0])[0];

        expect(outputLines.join('\n')).toContain('/tmp/state.json');
    });

    it('shows token status check without jiraBaseUrl', async () => {expect.hasAssertions();
        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalledWith();

        const outputLines = nonNull(outputMod.defaultOutput.box.mock.calls[0])[0];

        expect(outputLines.join('\n')).toContain('Token');
    });

    it('handles figlet textSync failure', async () => {expect.hasAssertions();

        mockFiglet.textSync.mockImplementationOnce(() => {
            throw new Error('no TTY');
        });

        await expect(showSplash()).resolves.not.toThrow();
    });

    it('handles gradient failure', async () => {expect.hasAssertions();

        mockGradient.mockImplementationOnce(() => {
            throw new Error('fail');
        });

        await expect(showSplash()).resolves.not.toThrow();
    });

    it('prints plain text when not TTY', async () => {expect.hasAssertions();

        outputMod.Output.isTTY.mockReturnValue(false);

        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });

    it('prints plain text in CI mode', async () => {expect.hasAssertions();

        outputMod.Output.isTTY.mockReturnValue(true);
        outputMod.Output.isCI.mockReturnValue(true);

        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });

    it('uses plain text header when not TTY with jiraBaseUrl', async () => {expect.hasAssertions();

        outputMod.Output.isTTY.mockReturnValue(false);

        await expect(showSplash(undefined, 'https://jira.example.com', 'token123')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });

    it('prints statePath in fallback when figlet fails', async () => {expect.hasAssertions();

        mockFiglet.textSync.mockImplementationOnce(() => {
            throw new Error('no TTY');
        });

        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('/tmp/state.json'));
    });

    it('handles figlet dynamic import failure in ensureDeps', async () => {expect.hasAssertions();

        __setFigletDep(undefined);

        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });

    it('handles gradient dynamic import failure in ensureDeps', async () => {expect.hasAssertions();

        __setGradientDep(undefined);

        await expect(showSplash('/tmp/state.json')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('QA Tools'));
    });

    it('calls checkJiraStatus with fallback empty token', async () => {expect.hasAssertions();
        await expect(showSplash(undefined, 'https://jira.example.com')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalledWith();

        const outputLines = nonNull(outputMod.defaultOutput.box.mock.calls[0])[0];

        expect(outputLines.join('\n')).toContain('Token');
    });

    it('passes jiraMode to checkJiraStatus', async () => {expect.hasAssertions();

        outputMod.Output.isTTY.mockReturnValue(true);
        __setFigletDep(mockFiglet);
        __setGradientDep({ default: mockGradient });

        await expect(showSplash(undefined, 'https://jira.example.com', 'token123', 'cloud')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalledWith();

        const outputLines = nonNull(outputMod.defaultOutput.box.mock.calls[0])[0];

        expect(outputLines.join('\n')).toContain('Jira API');
    });

    it('includes jiraBaseUrl and token check in TTY mode', async () => {expect.hasAssertions();

        outputMod.Output.isTTY.mockReturnValue(true);
        __setFigletDep(mockFiglet);
        __setGradientDep({ default: mockGradient });

        await expect(showSplash(undefined, 'https://jira.example.com', 'token123')).resolves.not.toThrow();
        expect(outputMod.defaultOutput.box).toHaveBeenCalledWith();

        const outputLines = nonNull(outputMod.defaultOutput.box.mock.calls[0])[0];

        expect(outputLines.join('\n')).toContain('Jira API');
        expect(outputLines.join('\n')).toContain('Token');
    });
});
