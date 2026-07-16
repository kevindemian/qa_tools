import { describe, expect, it } from 'vitest';
import { gitlabTestCasesToFailureRecords } from '../annotations-extractor.js';
import type { GitLabTestCase } from '../../../types/ci-cd.js';

describe('DataHub/extractors/annotations', () => {
    describe('GitlabTestCasesToFailureRecords', () => {
        it('returns empty array when input is not an array', () => {
            expect.hasAssertions();
            expect(gitlabTestCasesToFailureRecords(undefined)).toStrictEqual([]);
        });

        it('maps only failed/error cases to records', () => {
            expect.hasAssertions();

            const cases: GitLabTestCase[] = [
                { name: 'ok', classname: 'Suite', status: 'success', stack_trace: 'fine' },
                { name: 'broken', classname: 'Suite', status: 'error', stack_trace: 'err' },
                { name: 'failed', classname: 'Suite', status: 'failed', stack_trace: 'boom' },
            ];
            const records = gitlabTestCasesToFailureRecords(cases);

            expect(records).toHaveLength(2);
            expect(records.map((r) => r.name).sort((a, b) => a.localeCompare(b))).toStrictEqual(['broken', 'failed']);
        });

        it('marks error status as broken', () => {
            expect.hasAssertions();

            const records = gitlabTestCasesToFailureRecords([
                { name: 't', classname: 'S', status: 'error', stack_trace: 'e' },
            ]);

            expect(records[0]?.status).toBe('broken');
        });

        it('marks failed status as failed', () => {
            expect.hasAssertions();

            const records = gitlabTestCasesToFailureRecords([
                { name: 't', classname: 'S', status: 'failed', stack_trace: 'e' },
            ]);

            expect(records[0]?.status).toBe('failed');
        });

        it('assigns annotation provenance confidence', () => {
            expect.hasAssertions();

            const records = gitlabTestCasesToFailureRecords([
                { name: 't', classname: 'S', status: 'failed', stack_trace: 'e' },
            ]);

            expect(records[0]?.confidence).toBeCloseTo(0.8, 5);
            expect(records[0]?.source).toBe('gitlab-test-report');
        });
    });
});
