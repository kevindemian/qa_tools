import os from 'os';
import path from 'path';
vi.mock('../ui/output.js', () => ({
    defaultOutput: { print: vi.fn() },
}));
vi.mock('../logger', () => ({
    rootLogger: { filePath: path.join(os.tmpdir(), 'qa-test.log'), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../ui/prompt-format.js', async () => ({
    ...(await vi.importActual<typeof import('../ui/prompt-format.js')>('../ui/prompt-format.js')),
    isQuiet: vi.fn(() => false),
    success: vi.fn(),
}));

import { printSummary } from '../ui/prompt-summary.js';
import { defaultOutput as output } from '../ui/output.js';
import { isQuiet } from '../ui/prompt-format.js';
import type { TestResult } from '../types.js';

function makeResult(overrides: Partial<TestResult>): TestResult {
    return { label: 't', status: 'ok', message: '', ...overrides };
}

describe('PrintSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints success box when all pass', () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2' })]);

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });

    it('prints failure box when some fail', () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2', status: 'error', message: 'boom' })]);

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });

    it('prints no data when results is empty', () => {
        printSummary([]);

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });

    it('includes test execution link when provided', () => {
        printSummary([makeResult({})], 'PROJ-123');
        const calls = vi
            .mocked(output['print'])
            .mock.calls.map((c: string[]) => c[0])
            .join(' ');

        expect(calls).toMatch(/Test Execution/);
    });

    it('renders quiet summary when isQuiet', () => {
        vi.mocked(isQuiet).mockReturnValue(true);
        printSummary([makeResult({})]);

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });

    it('renders quiet summary with failures', () => {
        vi.mocked(isQuiet).mockReturnValue(true);
        printSummary([makeResult({ status: 'error', message: 'fail' })]);

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });
});
