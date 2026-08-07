import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseJsonFile } from '../import-prep-parsers.js';
import { serializeForImport } from '../commands/case18.js';
import type { TestCase } from '../../shared/types.js';

vi.mock('../../shared/config-accessor.js', () => ({ default: { get: vi.fn() } }));
vi.mock('../../shared/logger', () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));
vi.mock('../../shared/state', () => ({ load: vi.fn(), update: vi.fn() }));
vi.mock('../../shared/ui/prompt.js', () => ({
    warn: vi.fn(),
    prompt: vi.fn(),
    printSummary: vi.fn(),
    askFilePath: vi.fn(),
    info: vi.fn(),
    print: vi.fn(),
    confirm: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
}));
vi.mock('../../shared/report/markdown.js', () => ({
    md: vi.fn((s: string) => s),
    mdToHtml: vi.fn((s: string) => s),
}));

/** Testcase: case18's serialized output (import-compatible format) must
 *  round-trip through parseJsonFile (menu 15) with no data loss.
 *
 *  Regression for T4.0: previously case18 wrote its internal `TestCase[]`
 *  shape (steps[].fields + precondition[{type,value}]) which failed
 *  ImportJsonSchema validation on import. */
describe('Case18 → import round-trip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function writeAndParse(tests: TestCase[]): ReturnType<typeof parseJsonFile> {
        const serialized = serializeForImport(tests);
        const tmp = '/tmp/opencode/case18-roundtrip-' + Math.random().toString(36).slice(2) + '.json';
        mkdirSync(dirname(tmp), { recursive: true });
        writeFileSync(tmp, JSON.stringify(serialized, null, 2), 'utf8');
        return parseJsonFile(tmp);
    }

    it('preserves steps in flat {Action} format without fields wrapper', () => {
        const tests: TestCase[] = [
            {
                title: 'Login with valid credentials',
                description: 'Validate happy path',
                steps: [
                    { fields: { Action: 'Enter valid user', Data: 'user@example.com' } },
                    { fields: { Action: 'Click login' } },
                ],
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0]?.title).toBe('Login with valid credentials');
        expect(result.tests[0]?.steps).toStrictEqual([
            { fields: { Action: 'Enter valid user', Data: 'user@example.com', 'Expected Result': '' } },
            { fields: { Action: 'Click login', Data: '', 'Expected Result': '' } },
        ]);
    });

    it('preserves reference preconditions as keys (reclassified by isPreconditionKey)', () => {
        const tests: TestCase[] = [
            {
                title: 'Reference precondition test',
                description: '',
                steps: [{ fields: { Action: 'Open page' } }],
                precondition: [
                    { type: 'reference', value: 'PC-100' },
                    { type: 'reference', value: 'PC-200' },
                ],
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests[0]?.precondition).toStrictEqual([
            { type: 'reference', value: 'PC-100' },
            { type: 'reference', value: 'PC-200' },
        ]);
    });

    it('preserves inline preconditions as inline after import', () => {
        const tests: TestCase[] = [
            {
                title: 'Inline precondition test',
                description: '',
                steps: [{ fields: { Action: 'Open page' } }],
                precondition: [{ type: 'inline', value: 'User must be logged in' }],
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests[0]?.precondition).toStrictEqual([{ type: 'inline', value: 'User must be logged in' }]);
    });

    it('preserves environment, components and priority', () => {
        const tests: TestCase[] = [
            {
                title: 'Batch fields test',
                description: '',
                steps: [{ fields: { Action: 'Open page' } }],
                environment: 'staging',
                components: ['API', 'Frontend'],
                priority: 'High',
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests[0]?.environment).toBe('staging');
        expect(result.tests[0]?.components).toStrictEqual(['API', 'Frontend']);
        expect(result.tests[0]?.priority).toBe('High');
    });

    it('preserves coverage and evidence through the round-trip (QA2)', () => {
        const tests: TestCase[] = [
            {
                title: 'Coverage round-trip test',
                description: '',
                steps: [{ fields: { Action: 'Open page', 'Expected Result': 'Page shown' } }],
                coverage: [
                    {
                        criterionId: 'C-1',
                        criterionText: 'Regulations section is displayed on the Policy Details page',
                    },
                ],
                evidence: ['Policy Details page must show Regulations section'],
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests[0]?.coverage).toStrictEqual([
            { criterionId: 'C-1', criterionText: 'Regulations section is displayed on the Policy Details page' },
        ]);
        expect(result.tests[0]?.evidence).toStrictEqual(['Policy Details page must show Regulations section']);
    });

    it('omits precondition key when absent', () => {
        const tests: TestCase[] = [
            {
                title: 'No precondition',
                description: '',
                steps: [{ fields: { Action: 'Open page' } }],
            },
        ];

        const result = writeAndParse(tests);

        expect(result.tests[0]?.precondition).toBeUndefined();
    });

    it('returns empty tests when serialized input is not import-compatible (safety net)', () => {
        // simulate a legacy/broken producer: steps wrapped in fields are NOT accepted
        // by ImportJsonItemSchema as-is; parseJsonFile must fail loudly, not corrupt.
        const tmp = '/tmp/opencode/case18-roundtrip-broken-' + Math.random().toString(36).slice(2) + '.json';
        writeFileSync(
            tmp,
            JSON.stringify([{ title: 'X', steps: [{ fields: { Action: 'a' } }], precondition: [{ type: 'x' }] }]),
            'utf8',
        );
        const result = parseJsonFile(tmp);
        expect(result.tests).toStrictEqual([]);
    });
});
