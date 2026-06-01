jest.mock('./output', () => ({
    defaultOutput: { print: jest.fn() },
}));
jest.mock('./logger', () => ({
    rootLogger: { filePath: '/tmp/qa.log', info: jest.fn(), warn: jest.fn() },
}));
jest.mock('./prompt-format', () => ({
    ...jest.requireActual('./prompt-format'),
    isQuiet: jest.fn(() => false),
    success: jest.fn(),
}));

import { printSummary } from './prompt-summary';
import { defaultOutput as output } from './output';
import { isQuiet } from './prompt-format';
import type { TestResult } from './types';

function makeResult(overrides: Partial<TestResult>): TestResult {
    return { label: 't', status: 'ok', message: '', ...overrides };
}

describe('printSummary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prints success box when all pass', () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2' })]);
        expect(output.print).toHaveBeenCalled();
    });

    it('prints failure box when some fail', () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2', status: 'error', message: 'boom' })]);
        expect(output.print).toHaveBeenCalled();
    });

    it('prints no data when results is empty', () => {
        printSummary([]);
        expect(output.print).toHaveBeenCalled();
    });

    it('includes test execution link when provided', () => {
        printSummary([makeResult({})], 'PROJ-123');
        const calls = (output.print as jest.Mock).mock.calls.map((c: string[]) => c[0]).join(' ');
        expect(calls).toMatch(/Test Execution/);
    });

    it('renders quiet summary when isQuiet', () => {
        (isQuiet as jest.Mock).mockReturnValue(true);
        printSummary([makeResult({})]);
        expect(output.print).toHaveBeenCalled();
    });

    it('renders quiet summary with failures', () => {
        (isQuiet as jest.Mock).mockReturnValue(true);
        printSummary([makeResult({ status: 'error', message: 'fail' })]);
        expect(output.print).toHaveBeenCalled();
    });
});
