// Mock factories
const mockConfig: Record<string, string | boolean> = {
    autoConfirm: false,
    dryRun: false,
    csvDefaultPath: '/default/path.csv',
    csvPath: '',
    jsonPath: '',
    csvLabels: '',
    jsonLabels: '',
};

jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    prompt: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    print: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    smartPrompt: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    success: jest.fn(),
}));

jest.mock('../shared/config', () => mockConfig);

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
}));

const mockValidatorValidate = jest.fn().mockReturnValue({ errors: [], warnings: [] });
jest.mock('./test-case-validator', () => jest.fn(() => ({ validate: mockValidatorValidate })));

import { _checkResumeCheckpoint, filterTests, validateImportBatch } from './import-prep';
import * as PROMPT from '../shared/prompt';
import * as STATE from '../shared/state';

const makeTestCases = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        title: `Test ${i + 1}`,
        steps: [{ fields: { Action: 'a' } }],
    }));

const makeCp = (overrides: Record<string, unknown> = {}) => ({
    csvPath: '/path/test.csv',
    project: 'TESTPROJ',
    testCount: 10,
    done: [
        { key: 'T-1', title: 'Test 1' },
        { key: 'T-2', title: 'Test 2' },
    ],
    ts: new Date().toISOString(),
    ...overrides,
});

describe('_checkResumeCheckpoint', () => {
    const tests = makeTestCases(10);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('happy resume: checkpoint exists, age < 24h, done < testCount, confirm true', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        jest.mocked(PROMPT.confirm).mockReturnValue(true);
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(2);
        expect(result.inMemoryTasksId).toEqual(['T-1', 'T-2']);
        expect(result.inMemoryTasksText).toEqual(['Test 1', 'Test 2']);
    });

    it('expired checkpoint: age > 24h -> skip', () => {
        const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp({ ts: oldTs }) });
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
        expect(result.inMemoryTasksId).toEqual([]);
    });

    it('user declines: confirm false -> skip', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        jest.mocked(PROMPT.confirm).mockReturnValue(false);
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
        expect(result.inMemoryTasksId).toEqual([]);
    });

    it('full checkpoint: done.length >= tests.length -> skip', () => {
        const fullDone = Array.from({ length: 10 }, (_, i) => ({ key: `T-${i + 1}`, title: `Test ${i + 1}` }));
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp({ done: fullDone }) });
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
    });

    it('no matching checkpoint: sourcePath differs -> skip', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        const result = _checkResumeCheckpoint(tests, '/different/path.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
    });
});

describe('filterTests', () => {
    const tests = makeTestCases(5);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('no matches -> warn + null', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('zzzzzz');
        const result = filterTests(tests);
        expect(result).toBeNull();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste'));
    });

    it('matches + user declines -> warn + null', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('Test');
        jest.mocked(PROMPT.confirm).mockReturnValue(false);
        const result = filterTests(tests);
        expect(result).toBeNull();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Operação cancelada'));
    });

    it('matches + user accepts -> filtered list', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('Test 1');
        jest.mocked(PROMPT.confirm).mockReturnValue(true);
        const result = filterTests(tests);
        expect(result).toHaveLength(1);
        expect(result![0].title).toBe('Test 1');
    });
});

describe('validateImportBatch', () => {
    const tests = makeTestCases(3);

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(STATE.load).mockReturnValue({});
        mockValidatorValidate.mockReturnValue({ errors: [], warnings: [] });
    });

    it('warnings <= 5 displayed', () => {
        mockValidatorValidate.mockReturnValue({ errors: [], warnings: ['w1', 'w2', 'w3'] });
        const result = validateImportBatch(tests, '/path.csv', 'csv', 'TESTPROJ');
        expect(result).toBeDefined();
        expect(result!.resumeFrom).toBe(0);
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Avisos'));
        expect(PROMPT.warn).toHaveBeenCalledWith('  w1');
    });

    it('warnings > 5 with truncated message', () => {
        const manyWarnings = Array.from({ length: 10 }, (_, i) => `w${i + 1}`);
        mockValidatorValidate.mockReturnValue({ errors: [], warnings: manyWarnings });
        validateImportBatch(tests, '/path.csv', 'csv', 'TESTPROJ');
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('e mais'));
    });

    it('errors displayed -> returns undefined', () => {
        mockValidatorValidate.mockReturnValue({ errors: ['err1'], warnings: [] });
        const result = validateImportBatch(tests, '/path.csv', 'csv', 'TESTPROJ');
        expect(result).toBeUndefined();
        expect(PROMPT.error).toHaveBeenCalledWith(expect.stringContaining('Erros'));
    });
});
