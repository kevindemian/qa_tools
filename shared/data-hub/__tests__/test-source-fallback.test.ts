import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const mockParseTestResultsFile = vi.fn();
const mockAskFilePath = vi.fn();
const mockIsTTY = vi.fn();
const mockIsCI = vi.fn();
const mockRootLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.unmock('../../result_parser.js');
vi.unmock('../../prompt-input-filepath.js');

vi.mock('../../result_parser.js', () => ({
    parseTestResultsFile: mockParseTestResultsFile,
}));

vi.mock('../../prompt-input-filepath.js', () => ({
    askFilePath: mockAskFilePath,
}));

vi.mock('../../output.js', () => ({
    Output: {
        isTTY: mockIsTTY,
        isCI: mockIsCI,
    },
}));

vi.mock('../../logger.js', () => ({
    rootLogger: mockRootLogger,
}));

const { validateTestFile, formatValidationResult, askTestSource, DATAHUB_ERRORS } =
    await import('../../data-hub/test-source-fallback.js');

let tmpDir: string;

function createTmpFile(content: string, ext: string): string {
    const filePath = path.join(tmpDir, `test-${crypto.randomUUID().slice(0, 8)}${ext}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

describe('ValidateTestFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsf-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('r5: retorna null para arquivo com extensão inválida', () => {
        expect.hasAssertions();

        const result = validateTestFile('/fake/path/report.txt');

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.INVALID_FORMAT);
        expect(result.source).toBe('/fake/path/report.txt');
    });

    it('r5: retorna error quando arquivo não existe', () => {
        expect.hasAssertions();

        const result = validateTestFile('/fake/path/nonexistent.json');

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.FILE_NOT_FOUND);
        expect(result.source).toBe('/fake/path/nonexistent.json');
    });

    it('r3: retorna ParseResult válido para CTRF válido', () => {
        expect.hasAssertions();

        const filePath = createTmpFile('{"results":{"tests":[]}}', '.json');
        const fakeResult = {
            tests: [{ title: 'test1', state: 'passed' as const, duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        };
        mockParseTestResultsFile.mockReturnValue(fakeResult);

        const result = validateTestFile(filePath);

        expect(result.data).toStrictEqual(fakeResult);
        expect(result.error).toBeUndefined();
        expect(result.source).toBe(filePath);
    });

    it('r4: retorna ParseResult válido para JUnit XML válido', () => {
        expect.hasAssertions();

        const filePath = createTmpFile('<testsuite></testsuite>', '.xml');
        const fakeResult = {
            tests: [{ title: 'test1', state: 'passed' as const, duration: 50 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 50 },
        };
        mockParseTestResultsFile.mockReturnValue(fakeResult);

        const result = validateTestFile(filePath);

        expect(result.data).toStrictEqual(fakeResult);
        expect(result.error).toBeUndefined();
        expect(result.source).toBe(filePath);
    });

    it('r5: retorna error quando parse retorna erro', () => {
        expect.hasAssertions();

        const filePath = createTmpFile('{}', '.json');
        mockParseTestResultsFile.mockReturnValue({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            error: 'Erro de parse',
        });

        const result = validateTestFile(filePath);

        expect(result.data).toBeNull();
        expect(result.error).toContain(DATAHUB_ERRORS.INVALID_FORMAT);
        expect(result.source).toBe(filePath);
    });

    it('r5: retorna EMPTY_RESULT quando stats.total é 0', () => {
        expect.hasAssertions();

        const filePath = createTmpFile('{}', '.json');
        mockParseTestResultsFile.mockReturnValue({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        });

        const result = validateTestFile(filePath);

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.EMPTY_RESULT);
        expect(result.source).toBe(filePath);
    });
});

describe('FormatValidationResult', () => {
    it('retorna success=true para resultado válido', () => {
        expect.hasAssertions();

        const result = {
            data: {
                tests: [{ title: 't1', state: 'passed' as const, duration: 10 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 10 },
            },
            source: '/path/file.json',
        };

        const formatted = formatValidationResult(result);

        expect(formatted.success).toBeTruthy();
        expect(formatted.message).toContain('1');
        expect(formatted.message).toContain('passed');
    });

    it('retorna success=false para resultado com erro', () => {
        expect.hasAssertions();

        const result = {
            data: null,
            error: DATAHUB_ERRORS.FILE_NOT_FOUND,
            source: '/path/file.json',
        };

        const formatted = formatValidationResult(result);

        expect(formatted.success).toBeFalsy();
        expect(formatted.message).toContain(DATAHUB_ERRORS.FILE_NOT_FOUND);
    });
});

describe('AskTestSource', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsf-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('r2: retorna null quando não é TTY', async () => {
        expect.hasAssertions();

        mockIsTTY.mockReturnValue(false);
        mockIsCI.mockReturnValue(false);

        const result = await askTestSource();

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.NO_TTY);
        expect(mockAskFilePath).not.toHaveBeenCalled();
    });

    it('r2: retorna null quando é CI', async () => {
        expect.hasAssertions();

        mockIsTTY.mockReturnValue(true);
        mockIsCI.mockReturnValue(true);

        const result = await askTestSource();

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.NO_TTY);
        expect(mockAskFilePath).not.toHaveBeenCalled();
    });

    it('r6: retorna USER_SKIPPED quando usuário pula (path vazio)', async () => {
        expect.hasAssertions();

        mockIsTTY.mockReturnValue(true);
        mockIsCI.mockReturnValue(false);
        mockAskFilePath.mockResolvedValue('');

        const result = await askTestSource();

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.USER_SKIPPED);
    });

    it('r1: retorna resultado válido quando usuário fornece arquivo válido', async () => {
        expect.hasAssertions();

        const filePath = createTmpFile('{}', '.json');
        mockIsTTY.mockReturnValue(true);
        mockIsCI.mockReturnValue(false);
        mockAskFilePath.mockResolvedValue(filePath);
        mockParseTestResultsFile.mockReturnValue({
            tests: [{ title: 't1', state: 'passed' as const, duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 10 },
        });

        const result = await askTestSource();

        expect(result.data).toBeDefined();
        expect(result.error).toBeUndefined();
        expect(result.source).toBe(filePath);
    });

    it('r6: tenta até 3 vezes em caso de falha, depois retorna USER_SKIPPED', async () => {
        expect.hasAssertions();

        const filePath = createTmpFile('{}', '.json');
        mockIsTTY.mockReturnValue(true);
        mockIsCI.mockReturnValue(false);
        mockAskFilePath.mockResolvedValue(filePath);
        mockParseTestResultsFile.mockReturnValue({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
        });

        const result = await askTestSource();

        expect(result.data).toBeNull();
        expect(result.error).toBe(DATAHUB_ERRORS.USER_SKIPPED);
        expect(mockAskFilePath).toHaveBeenCalledTimes(3);
    });
});
