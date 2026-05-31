import { jest } from '@jest/globals';

const mockReaddirSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockJoin = jest.fn((...args: string[]) => args.join('/'));

const mockPrintError = jest.fn();
const mockWarn = jest.fn();
const mockInfo = jest.fn();
const mockDivider = jest.fn();

const mockOpenWithFallback = jest.fn();
const mockGetDocsOutputDir = jest.fn();

const mockMdToHtml = jest.fn((content: string) => '<html>' + content + '</html>');

const mockBuildHtmlPage = jest.fn((opts: object) => '<!DOCTYPE html>' + JSON.stringify(opts));

jest.mock('fs', () => ({
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
}));

jest.mock('path', () => ({
    join: mockJoin,
}));

jest.mock('./prompt', () => ({
    printError: mockPrintError,
    warn: mockWarn,
    info: mockInfo,
    divider: mockDivider,
}));

jest.mock('./open', () => ({
    openWithFallback: mockOpenWithFallback,
    getDocsOutputDir: mockGetDocsOutputDir,
}));

jest.mock('./markdown', () => ({
    mdToHtml: mockMdToHtml,
}));

jest.mock('./html-factory', () => ({
    buildHtmlPage: mockBuildHtmlPage,
}));

function loadModule() {
    return require('./show-docs') as typeof import('./show-docs');
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('showDocs', () => {
    it('converts docs to html and opens index in browser', async () => {
        mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
        mockReaddirSync.mockReturnValue(['01-intro.md', '02-setup.md', '03-advanced.md']);
        mockReadFileSync.mockImplementation((...args: unknown[]) => {
            const filePath = args[0] as string;
            if (filePath.includes('01-intro')) return '# Intro';
            if (filePath.includes('02-setup')) return '# Setup';
            if (filePath.includes('03-advanced')) return '# Advanced';
            return '';
        });

        const { showDocs } = loadModule();
        await showDocs();

        expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/docs', { recursive: true });
        expect(mockWriteFileSync).toHaveBeenCalledTimes(4);
        expect(mockOpenWithFallback).toHaveBeenCalledWith('/tmp/docs/index.html', 'Documentação', mockInfo);
    });

    it('prints error when docs dir not found', async () => {
        mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
        mockReaddirSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const { showDocs } = loadModule();
        await showDocs();

        expect(mockPrintError).toHaveBeenCalledWith(
            'Documentação',
            expect.objectContaining({ message: expect.stringContaining('Diretório docs/ não encontrado') }),
        );
        expect(mockOpenWithFallback).not.toHaveBeenCalled();
    });

    it('warns and returns when no docs match pattern', async () => {
        mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
        mockReaddirSync.mockReturnValue(['readme.md', 'notes.txt']);

        const { showDocs } = loadModule();
        await showDocs();

        expect(mockWarn).toHaveBeenCalledWith('Nenhum documento encontrado em docs/.');
        expect(mockDivider).toHaveBeenCalled();
        expect(mockOpenWithFallback).not.toHaveBeenCalled();
    });

    it('skips files that fail to read and continues', async () => {
        mockGetDocsOutputDir.mockReturnValue('/tmp/docs');
        mockReaddirSync.mockReturnValue(['01-good.md', '02-bad.md', '03-good.md']);
        mockReadFileSync.mockImplementation((...args: unknown[]) => {
            const filePath = args[0] as string;
            if (filePath.includes('02-bad')) throw new Error('Read error');
            if (filePath.includes('01-good')) return '# Good 1';
            if (filePath.includes('03-good')) return '# Good 3';
            return '';
        });

        const { showDocs } = loadModule();
        await showDocs();

        expect(mockPrintError).toHaveBeenCalledWith('Erro ao ler 02-bad.md', expect.any(Error));
        expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
    });

    it('prints error when getDocsOutputDir returns null', async () => {
        mockGetDocsOutputDir.mockReturnValue(null);
        mockReaddirSync.mockReturnValue(['01-intro.md']);

        const { showDocs } = loadModule();
        await showDocs();

        expect(mockPrintError).toHaveBeenCalledWith(
            'Documentação',
            expect.objectContaining({ message: expect.stringContaining('Não foi possível determinar') }),
        );
        expect(mockOpenWithFallback).not.toHaveBeenCalled();
    });
});
