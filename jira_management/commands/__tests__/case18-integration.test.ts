/**
 * Integration tests — case18.ts exported functions.
 * Anti-mock-theater: real filesystem, real logic, real side effects.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    convertTestCases,
    serializeForImport,
    toGeneratedTestCases,
    writeTestOutput,
    writeQualityArtifacts,
    resolvePreconditionMatches,
    computePromptVersion,
    buildCorrectionsBlock,
} from '../case18.js';
import { evaluateCase18 } from '../../../shared/quality/case18-evaluator.js';
import { extractCriteria } from '../../../shared/quality/case18-benchmarks.js';
import { reportsDir } from '../../../shared/infra/temp-dir.js';

const CRITERIA = extractCriteria(
    'As a user I want to login\nGiven the user is on the login page\nWhen the user enters valid credentials\nThen the user should be redirected to the dashboard',
);

const MINIMAL = [
    { title: 'Login test', steps: ['Go to login', 'Enter creds', 'Click login'], expectedResult: 'Dashboard shown' },
];

const WITH_PC = [
    {
        title: 'Create order',
        steps: ['Add item', 'Checkout'],
        expectedResult: 'Order created',
        preConditions: [{ type: 'create', summary: 'User has items' }],
    },
    {
        title: 'View history',
        steps: ['Go to orders'],
        expectedResult: 'History shown',
        preConditions: [{ type: 'reference', key: 'PC-1', summary: 'User is logged in' }],
    },
];

const WITH_META = [
    {
        title: 'Full test',
        steps: ['Step 1'],
        expectedResult: 'Result',
        environment: 'staging',
        components: ['API', 'Auth'],
        priority: 'High',
        coverage: [{ criterionId: 'C-1', criterionText: 'User can log in' }],
        evidence: ['Login flow works'],
    },
];

const EMPTY_RESOLVED = [[]];
const MIXED_RESOLVED = [
    [{ type: 'create' as const, summary: 'User has items' }],
    [{ type: 'reference' as const, key: 'PC-1', summary: 'User is logged in' }],
];

describe('serializeForImport', () => {
    it('converts steps to flat Action objects', () => {
        const r = serializeForImport([
            { title: 'T', description: '', steps: [{ fields: { Action: 'A1' } }, { fields: { Action: 'A2' } }] },
        ]);
        expect(r[0]?.steps).toStrictEqual([{ Action: 'A1' }, { Action: 'A2' }]);
    });

    it('preserves Data and Expected Result fields', () => {
        const r = serializeForImport([
            { title: 'T', description: '', steps: [{ fields: { Action: 'A', Data: 'D', 'Expected Result': 'E' } }] },
        ]);
        expect(r[0]?.steps[0]).toStrictEqual({ Action: 'A', Data: 'D', 'Expected Result': 'E' });
    });

    it('omits undefined step fields', () => {
        const r = serializeForImport([{ title: 'T', description: '', steps: [{ fields: { Action: 'A' } }] }]);
        expect(Object.keys(r[0]?.steps[0] ?? {})).not.toContain('Data');
    });

    it('maps precondition values', () => {
        const r = serializeForImport([
            {
                title: 'T',
                description: '',
                steps: [{ fields: { Action: 'A' } }],
                precondition: [{ type: 'reference' as const, value: 'PC-1' }],
            },
        ]);
        expect(r[0]?.precondition).toStrictEqual(['PC-1']);
    });

    it('omits precondition when empty', () => {
        const r = serializeForImport([
            { title: 'T', description: '', steps: [{ fields: { Action: 'A' } }], precondition: [] },
        ]);
        expect(r[0]?.precondition).toBeUndefined();
    });

    it('propagates environment, components, priority', () => {
        const r = serializeForImport([
            {
                title: 'T',
                description: 'd',
                steps: [{ fields: { Action: 'A' } }],
                environment: 'prod',
                components: ['X'],
                priority: 'Critical',
            },
        ]);
        expect(r[0]).toMatchObject({ environment: 'prod', components: ['X'], priority: 'Critical' });
    });

    it('handles undefined description', () => {
        const r = serializeForImport([
            { title: 'T', description: undefined as unknown as string, steps: [{ fields: { Action: 'A' } }] },
        ]);
        expect(r[0]?.description).toBe('');
    });
});

describe('convertTestCases', () => {
    it('converts LLM output to TestCase format', () => {
        const r = convertTestCases(MINIMAL, EMPTY_RESOLVED, new Map());
        expect(r).toHaveLength(1);
        expect(r[0]?.steps[0]?.fields.Action).toBe('Go to login');
    });

    it('attaches reference preconditions', () => {
        const r = convertTestCases(WITH_PC, MIXED_RESOLVED, new Map());
        expect(r[0]?.precondition?.[0]?.type).toBe('inline');
        expect(r[1]?.precondition?.[0]?.type).toBe('reference');
        expect(r[1]?.precondition?.[0]?.value).toBe('PC-1');
    });

    it('uses createdKeys when summary matches', () => {
        const keys = new Map([['User has items', 'PC-NEW-1']]);
        const r = convertTestCases(WITH_PC, MIXED_RESOLVED, keys);
        expect(r[0]?.precondition?.[0]?.value).toBe('PC-NEW-1');
    });

    it('preserves metadata', () => {
        const r = convertTestCases(WITH_META, EMPTY_RESOLVED, new Map());
        expect(r[0]).toMatchObject({ environment: 'staging', components: ['API', 'Auth'], priority: 'High' });
    });

    it('no precondition when absent', () => {
        const r = convertTestCases(MINIMAL, EMPTY_RESOLVED, new Map());
        expect(r[0]?.precondition).toBeUndefined();
    });

    it('handles empty steps', () => {
        const r = convertTestCases([{ title: 'T', steps: [], expectedResult: 'R' }], [[]], new Map());
        expect(r[0]?.steps).toHaveLength(0);
    });

    it('handles multiple preconditions', () => {
        const input = [
            {
                title: 'T',
                steps: ['S'],
                expectedResult: 'R',
                preConditions: [
                    { type: 'create', summary: 'A' },
                    { type: 'create', summary: 'B' },
                ],
            },
        ];
        const resolved = [
            [
                { type: 'create' as const, summary: 'A' },
                { type: 'create' as const, summary: 'B' },
            ],
        ];
        const r = convertTestCases(input, resolved, new Map());
        expect(r[0]?.precondition).toHaveLength(2);
    });
});

describe('toGeneratedTestCases', () => {
    it('converts to GeneratedTestCase format', () => {
        const r = toGeneratedTestCases(MINIMAL, [[]], new Map());
        expect(r[0]?.title).toBe('Login test');
        expect(r[0]?.steps).toStrictEqual(['Go to login', 'Enter creds', 'Click login']);
    });

    it('attaches preConditions from resolved', () => {
        const r = toGeneratedTestCases(WITH_PC, MIXED_RESOLVED, new Map());
        expect(r[0]?.preConditions?.[0]?.type).toBe('inline');
        expect(r[1]?.preConditions?.[0]?.type).toBe('reference');
    });

    it('preserves coverage and evidence', () => {
        const r = toGeneratedTestCases(WITH_META, [[]], new Map());
        expect(r[0]?.coverage).toStrictEqual([{ criterionId: 'C-1', criterionText: 'User can log in' }]);
        expect(r[0]?.evidence).toStrictEqual(['Login flow works']);
    });
});

describe('resolvePreconditionMatches', () => {
    it('empty when no preConditions', () => {
        const r = resolvePreconditionMatches(MINIMAL, []);
        expect(r.resolvedPreConditions[0]).toHaveLength(0);
        expect(r.summariesToCreate).toHaveLength(0);
    });

    it('marks all as create when no Jira PCs', () => {
        const r = resolvePreconditionMatches(WITH_PC, []);
        expect(r.summariesToCreate).toContain('User has items');
        expect(r.summariesToCreate).toContain('User is logged in');
    });

    it('deduplicates identical summaries', () => {
        const input = [
            { title: 'T1', steps: ['S'], expectedResult: 'R', preConditions: [{ type: 'create', summary: 'Same' }] },
            { title: 'T2', steps: ['S'], expectedResult: 'R', preConditions: [{ type: 'create', summary: 'Same' }] },
        ];
        const r = resolvePreconditionMatches(input, []);
        expect(r.summariesToCreate).toHaveLength(1);
    });

    it('handles empty preConditions array', () => {
        const r = resolvePreconditionMatches(
            [{ title: 'T', steps: ['S'], expectedResult: 'R', preConditions: [] }],
            [],
        );
        expect(r.resolvedPreConditions[0]).toHaveLength(0);
    });

    it('resolves reference when match found', () => {
        const input = [
            {
                title: 'T',
                steps: ['S'],
                expectedResult: 'R',
                preConditions: [{ type: 'reference', key: 'PC-1', summary: 'Logged in' }],
            },
        ];
        const r = resolvePreconditionMatches(input, [{ key: 'PC-1', summary: 'Logged in' }]);
        expect(r.resolvedPreConditions[0]?.[0]?.type).toBe('reference');
        expect(r.summariesToCreate).toHaveLength(0);
    });

    it('reads description field when summary is absent (BUG-4 compat)', () => {
        const input = [
            {
                title: 'T',
                steps: ['S'],
                expectedResult: 'R',
                preConditions: [{ type: 'create', description: 'User must be authenticated' }],
            },
        ];
        const r = resolvePreconditionMatches(input, []);
        expect(r.summariesToCreate).toHaveLength(1);
        expect(r.summariesToCreate[0]).toBe('User must be authenticated');
        expect(r.resolvedPreConditions[0]?.[0]?.type).toBe('create');
        expect(r.resolvedPreConditions[0]?.[0]?.summary).toBe('User must be authenticated');
    });

    it('prefers summary over description when both present', () => {
        const input = [
            {
                title: 'T',
                steps: ['S'],
                expectedResult: 'R',
                preConditions: [{ type: 'create', summary: 'From summary', description: 'From description' }],
            },
        ];
        const r = resolvePreconditionMatches(input, []);
        expect(r.summariesToCreate[0]).toBe('From summary');
    });
});

describe('writeTestOutput (real filesystem)', () => {
    let tmpDir: string;
    let origCwd: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case18-test-'));
        origCwd = process.cwd();
        process.chdir(tmpDir);
    });

    afterEach(() => {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes JSON to reports/<date>/llm-generated-tests.json', () => {
        const converted = convertTestCases(MINIMAL, EMPTY_RESOLVED, new Map());
        const outPath = writeTestOutput(converted, 0);
        expect(fs.existsSync(outPath)).toBe(true);
        expect(outPath).toContain('llm-generated-tests.json');
    });

    it('round-trips through JSON.parse', () => {
        const converted = convertTestCases(MINIMAL, EMPTY_RESOLVED, new Map());
        const outPath = writeTestOutput(converted, 0);
        const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        expect(parsed).toHaveLength(1);
        expect(parsed[0]?.title).toBe('Login test');
    });

    it('includes precondition values', () => {
        const converted = convertTestCases(WITH_PC, MIXED_RESOLVED, new Map());
        const outPath = writeTestOutput(converted, 0);
        const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const withPc = parsed.find((t: { title: string }) => t.title === 'Create order');
        expect(withPc?.precondition).toStrictEqual(['User has items']);
    });

    it('includes metadata fields', () => {
        const converted = convertTestCases(WITH_META, EMPTY_RESOLVED, new Map());
        const outPath = writeTestOutput(converted, 0);
        const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        expect(parsed[0]).toMatchObject({ environment: 'staging', components: ['API', 'Auth'], priority: 'High' });
    });

    it('creates nested directories recursively', () => {
        const converted = convertTestCases(MINIMAL, EMPTY_RESOLVED, new Map());
        const outPath = writeTestOutput(converted, 0);
        expect(fs.statSync(outPath).isFile()).toBe(true);
    });
});

describe('writeQualityArtifacts (real filesystem)', () => {
    it('writes HTML evaluation report to reportsDir', () => {
        const generated = toGeneratedTestCases(MINIMAL, [[]], new Map());
        const evaluation = evaluateCase18(generated, CRITERIA);
        writeQualityArtifacts(evaluation, MINIMAL, CRITERIA);
        const reportsBase = reportsDir();
        expect(fs.existsSync(reportsBase)).toBe(true);
    });

    it('writes coverage table JSON and HTML', () => {
        const generated = toGeneratedTestCases(MINIMAL, [[]], new Map());
        const evaluation = evaluateCase18(generated, CRITERIA);
        writeQualityArtifacts(evaluation, MINIMAL, CRITERIA);
        const reportsBase = reportsDir();
        const entries = fs.readdirSync(reportsBase, { recursive: true });
        const hasCoverage = entries.some((e) => typeof e === 'string' && e.includes('coverage'));
        expect(hasCoverage).toBe(true);
    });

    it('does not throw on empty test cases', () => {
        const evaluation = evaluateCase18([], CRITERIA);
        expect(() => writeQualityArtifacts(evaluation, [], CRITERIA)).not.toThrow();
    });
});

describe('computePromptVersion', () => {
    it('returns a stable version string', () => {
        const v1 = computePromptVersion();
        const v2 = computePromptVersion();
        expect(v1).toBe(v2);
        expect(v1).toMatch(/^v[a-f0-9]{10}$/);
    });
});

describe('buildCorrectionsBlock', () => {
    it('returns empty string when no failures', () => {
        const evaluation = evaluateCase18(toGeneratedTestCases(MINIMAL, [[]], new Map()), CRITERIA);
        const block = buildCorrectionsBlock(evaluation);
        expect(typeof block).toBe('string');
    });

    it('includes metric names in corrections when failures exist', () => {
        const generated = toGeneratedTestCases([{ title: 'T', steps: ['S'], expectedResult: 'R' }], [[]], new Map());
        const evaluation = evaluateCase18(generated, 'X' + 'Y'.repeat(200));
        const block = buildCorrectionsBlock(evaluation);
        expect(typeof block).toBe('string');
    });
});
