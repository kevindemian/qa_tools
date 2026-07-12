import { describe, expect, it } from 'vitest';
import type { FailureRecord } from '../types/data-hub.js';
import type { CheckRunAnnotation, GitLabTestCase } from '../types/ci-cd.js';
import {
    githubAnnotationsToFailureRecords,
    gitlabTestCasesToFailureRecords,
} from '../data-hub/extractors/annotations-extractor.js';

describe('LA-1 — GitHub check-run annotations → FailureRecord', () => {
    it('maps a failure-level annotation to a failed FailureRecord with file/line', () => {
        const ann: CheckRunAnnotation = {
            path: 'src/sum.test.ts',
            start_line: 42,
            end_line: 42,
            message: 'Expected 1 to equal 2',
            annotation_level: 'failure',
        };
        const recs = githubAnnotationsToFailureRecords([ann]);

        expect(recs).toHaveLength(1);

        const r = recs[0] as FailureRecord;

        expect(r.name).toBe('Expected 1 to equal 2');
        expect(r.file).toBe('src/sum.test.ts');
        expect(r.line).toBe(42);
        expect(r.status).toBe('failed');
    });

    it('emits provenance (source/category/confidence finite in [0,1]) for a failure annotation', () => {
        const ann: CheckRunAnnotation = {
            path: 'src/sum.test.ts',
            start_line: 42,
            end_line: 42,
            message: 'Expected 1 to equal 2',
            annotation_level: 'failure',
        };
        const recs = githubAnnotationsToFailureRecords([ann]);

        const r = recs[0] as FailureRecord;

        expect(r.source).toBe('github-annotation');
        expect(r.category).toBe('assertion');
        expect(Number.isFinite(r.confidence)).toBeTruthy();
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
    });

    it('maps a warning-level annotation to a broken FailureRecord', () => {
        const ann: CheckRunAnnotation = {
            path: 'a.ts',
            start_line: 1,
            end_line: 1,
            message: 'deprecated api usage',
            annotation_level: 'warning',
        };
        const recs = githubAnnotationsToFailureRecords([ann]);

        expect(recs).toHaveLength(1);
        expect((recs[0] as FailureRecord).status).toBe('broken');
    });

    it('returns an empty array (never null) for no annotations', () => {
        const recs = githubAnnotationsToFailureRecords([]);

        expect(recs).toHaveLength(0);
    });

    it('guards an invalid (NaN) start_line without throwing and without emitting an invalid line', () => {
        const ann: CheckRunAnnotation = {
            path: 'a.ts',
            start_line: NaN,
            end_line: NaN,
            message: 'boom',
            annotation_level: 'failure',
        };
        const recs = githubAnnotationsToFailureRecords([ann]);

        expect(recs).toHaveLength(1);
        expect((recs[0] as FailureRecord).line).toBeUndefined();
        expect((recs[0] as FailureRecord).file).toBe('a.ts');
    });

    it('falls back to path as name when message is empty (never drops the record)', () => {
        const ann: CheckRunAnnotation = {
            path: 'b.ts',
            start_line: 3,
            end_line: 3,
            message: '',
            annotation_level: 'failure',
        };
        const recs = githubAnnotationsToFailureRecords([ann]);

        expect(recs).toHaveLength(1);
        expect((recs[0] as FailureRecord).name).toBe('b.ts');
    });
});

describe('LA-1 — GitLab test cases → FailureRecord', () => {
    it('maps a failed test case with stack trace to a failed FailureRecord (file/line localized)', () => {
        const tc: GitLabTestCase = {
            status: 'failed',
            name: 'should add',
            classname: 'Sum',
            stack_trace: 'Error: expected 1 to equal 2\n    at test (src/sum.test.ts:5:1)',
        };
        const recs = gitlabTestCasesToFailureRecords([tc]);

        expect(recs).toHaveLength(1);

        const r = recs[0] as FailureRecord;

        expect(r.name).toBe('should add');
        expect(r.suite).toBe('Sum');
        expect(r.status).toBe('failed');
        expect(r.file).toBe('src/sum.test.ts');
        expect(r.line).toBe(5);
        expect(r.trace).toContain('src/sum.test.ts');
    });

    it('emits provenance (source/category) for a failed GitLab test case', () => {
        const tc: GitLabTestCase = {
            status: 'failed',
            name: 'should add',
            classname: 'Sum',
            stack_trace: 'Error: expected 1 to equal 2\n    at test (src/sum.test.ts:5:1)',
        };
        const recs = gitlabTestCasesToFailureRecords([tc]);

        const r = recs[0] as FailureRecord;

        expect(r.source).toBe('gitlab-test-report');
        expect(r.category).toBe('assertion');
    });

    it('maps an error-level test case to a broken FailureRecord', () => {
        const tc: GitLabTestCase = {
            status: 'error',
            name: 'setup crashed',
            stack_trace: 'panic: nil pointer',
        };
        const recs = gitlabTestCasesToFailureRecords([tc]);

        expect(recs).toHaveLength(1);
        expect((recs[0] as FailureRecord).status).toBe('broken');
        expect((recs[0] as FailureRecord).category).toBe('panic');
    });

    it('ignores successful and skipped cases (no silent failure data)', () => {
        const cases: GitLabTestCase[] = [
            { status: 'success', name: 'ok' },
            { status: 'skipped', name: 'skip' },
            { status: 'failed', name: 'nope', stack_trace: 'boom' },
        ];
        const recs = gitlabTestCasesToFailureRecords(cases);

        expect(recs).toHaveLength(1);
        expect((recs[0] as FailureRecord).name).toBe('nope');
    });
});
