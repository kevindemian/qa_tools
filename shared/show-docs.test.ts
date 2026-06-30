import { nonNull } from './test-utils.js';

const {
    mockReaddirSync,
    mockReadFileSync,
    mockMkdirSync,
    mockWriteFileSync,
    mockJoin,
    mockPrintError,
    mockWarn,
    mockInfo,
    mockDivider,
    mockOpenWithFallback,
    mockGetDocsOutputDir,
    mockMdToHtml,
    mockBuildHtmlPage,
} = vi.hoisted(() => ({
    mockReaddirSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockJoin: vi.fn((...args: string[]) => args.join('/')),
    mockPrintError: vi.fn<(label: string, error: Error) => void>(),
    mockWarn: vi.fn<(message: string) => void>(),
    mockInfo: vi.fn<(message: string) => void>(),
    mockDivider: vi.fn<() => void>(),
    mockOpenWithFallback: vi.fn<(path: string, label: string, callback?: (err: Error | null) => void) => void>(),
    mockGetDocsOutputDir: vi.fn<() => string | null>(),
    mockMdToHtml: vi.fn((content: string) => '<html>' + content + '</html>'),
    mockBuildHtmlPage: vi.fn((opts: object) => '<!DOCTYPE html>' + JSON.stringify(opts)),
}));

vi.mock('fs', () => ({
    default: {
        readdirSync: mockReaddirSync,
        readFileSync: mockReadFileSync,
        mkdirSync: mockMkdirSync,
        writeFileSync: mockWriteFileSync,
    },
}));

vi.mock('path', () => ({
    default: { join: mockJoin },
}));

vi.mock('./prompt', () => ({
    printError: mockPrintError,
    warn: mockWarn,
    info: mockInfo,
    divider: mockDivider,
}));

vi.mock('./open', () => ({
    openWithFallback: mockOpenWithFallback,
    getDocsOutputDir: mockGetDocsOutputDir,
}));

vi.mock('./markdown', () => ({
    mdToHtml: mockMdToHtml,
}));

vi.mock('./html-factory', () => ({
    buildHtmlPage: mockBuildHtmlPage,
}));

async function loadModule() {
    return import('./show-docs.js');
}

describe('Show Docs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('ShowDocs', () => {
        it('converts docs to html and opens index in browser', async () => {
            expect.hasAssertions();

            mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
            mockReaddirSync.mockReturnValue(['01-intro.md', '02-setup.md', '03-advanced.md']);
            mockReadFileSync.mockImplementation((...args: unknown[]) => {
                const filePath = args[0] as string;
                if (filePath.includes('01-intro')) return '# Intro';
                if (filePath.includes('02-setup')) return '# Setup';
                if (filePath.includes('03-advanced')) return '# Advanced';
                return '';
            });

            const { showDocs } = await loadModule();
            await showDocs();

            expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/docs', { recursive: true });
            expect(mockWriteFileSync).toHaveBeenCalledTimes(4);
            expect(mockOpenWithFallback).toHaveBeenCalledWith('/tmp/docs/index.html', 'Documentação', mockInfo);
        });

        it('prints error when docs dir not found', async () => {
            expect.hasAssertions();

            mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
            mockReaddirSync.mockImplementation(() => {
                throw new Error('ENOENT');
            });

            const { showDocs } = await loadModule();
            await showDocs();

            expect(mockPrintError).toHaveBeenCalledWith('Documentação', expect.any(Error));
            expect(nonNull(mockPrintError.mock.calls[0])[1].message).toContain('Diretório docs/ não encontrado');
            expect(mockOpenWithFallback).not.toHaveBeenCalled();
        });

        it('warns and returns when no docs match pattern', async () => {
            expect.hasAssertions();

            mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
            mockReaddirSync.mockReturnValue(['readme.md', 'notes.txt']);

            const { showDocs } = await loadModule();
            await showDocs();

            expect(mockWarn).toHaveBeenCalledWith('Nenhum documento encontrado em docs/.');
            expect(mockDivider).toHaveBeenCalledWith();
            expect(mockOpenWithFallback).not.toHaveBeenCalled();
        });

        it('skips files that fail to read and continues', async () => {
            expect.hasAssertions();

            mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
            mockReaddirSync.mockReturnValue(['01-good.md', '02-bad.md', '03-good.md']);
            mockReadFileSync.mockImplementation((...args: unknown[]) => {
                const filePath = args[0] as string;
                if (filePath.includes('02-bad')) throw new Error('Read error');
                if (filePath.includes('01-good')) return '# Good 1';
                if (filePath.includes('03-good')) return '# Good 3';
                return '';
            });

            const { showDocs } = await loadModule();
            await showDocs();

            expect(mockPrintError).toHaveBeenCalledWith('Erro ao ler 02-bad.md', expect.any(Error));
            expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
        });

        it('prints error when getDocsOutputDir returns null', async () => {
            expect.hasAssertions();

            mockGetDocsOutputDir.mockReturnValue(null);
            mockReaddirSync.mockReturnValue(['01-intro.md']);

            const { showDocs } = await loadModule();
            await showDocs();

            expect(mockPrintError).toHaveBeenCalledWith('Documentação', expect.any(Error));
            expect(nonNull(mockPrintError.mock.calls[0])[1].message).toContain('Não foi possível determinar');
            expect(mockOpenWithFallback).not.toHaveBeenCalled();
        });
    });
});
