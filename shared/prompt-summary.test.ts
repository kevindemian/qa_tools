vi.mock('./output', async () => ({
    defaultOutput: { print: vi.fn() },
}));
vi.mock('./logger', async () => ({
    rootLogger: { filePath: '/tmp/qa.log', info: vi.fn(), warn: vi.fn() },
}));
vi.mock('./prompt-format', async () => ({
    ...(await vi.importActual<typeof import('./prompt-format.js')>('./prompt-format')),
    isQuiet: vi.fn(() => false),
    success: vi.fn(),
}));

import { printSummary } from './prompt-summary.js';
import { defaultOutput as output } from './output.js';
import { isQuiet } from './prompt-format.js';
import type { TestResult } from './types.js';

function makeResult(overrides: Partial<TestResult>): TestResult {
    return { label: 't', status: 'ok', message: '', ...overrides };
}

describe('printSummary', async () => {
    beforeEach(async () => {
        vi.clearAllMocks();
    });

    it('prints success box when all pass', async () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2' })]);
        expect(output.print).toHaveBeenCalled();
    });

    it('prints failure box when some fail', async () => {
        printSummary([makeResult({ label: 'op1' }), makeResult({ label: 'op2', status: 'error', message: 'boom' })]);
        expect(output.print).toHaveBeenCalled();
    });

    it('prints no data when results is empty', async () => {
        printSummary([]);
        expect(output.print).toHaveBeenCalled();
    });

    it('includes test execution link when provided', async () => {
        printSummary([makeResult({})], 'PROJ-123');
        const calls = vi
            .mocked(output.print)
            .mock.calls.map((c: string[]) => c[0])
            .join(' ');
        expect(calls).toMatch(/Test Execution/);
    });

    it('renders quiet summary when isQuiet', async () => {
        vi.mocked(isQuiet).mockReturnValue(true);
        printSummary([makeResult({})]);
        expect(output.print).toHaveBeenCalled();
    });

    it('renders quiet summary with failures', async () => {
        vi.mocked(isQuiet).mockReturnValue(true);
        printSummary([makeResult({ status: 'error', message: 'fail' })]);
        expect(output.print).toHaveBeenCalled();
    });
});
