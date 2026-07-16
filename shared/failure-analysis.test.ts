import { describe, expect, it, vi } from 'vitest';

vi.mock('./config-accessor.js', () => ({ default: { get: vi.fn(() => '') } }));
vi.mock('child_process', () => ({ execFileSync: vi.fn(() => '') }));

import { execFileSync } from 'child_process';
import { crossReferenceFailures, getCommitAuthor } from './failure-analysis.js';
import type { FlatTest } from './result_parser.js';
import type { DataHub, FailureRecord } from './types/data-hub.js';

function makeHub(records: FailureRecord[], qualityValid = true, provenanceConfidence = 0.9): DataHub {
    const quality = { valid: qualityValid } as never;
    const provenance = new Map<string, { confidence: number | null }>([
        ['failureRecords', { confidence: provenanceConfidence }],
    ]);
    return {
        getFailureRecords: () => records,
        getQuality: () => quality,
        getProvenance: () => provenance,
    } as unknown as DataHub;
}

const failedTest: FlatTest = { title: 'auth.login fails', state: 'failed', duration: 12 };

describe('Failure-analysis', () => {
    describe('CrossReferenceFailures', () => {
        it('returns empty for no failed tests', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([{ title: 'x', state: 'passed', duration: 1 }], makeHub([]));

            expect(out).toStrictEqual([]);
        });

        it('flags a matched prior record with its category and confidence', () => {
            expect.hasAssertions();

            const rec: FailureRecord = {
                name: 'auth.login fails',
                status: 'failed',
                category: 'ASSERT',
                confidence: 0.8,
                source: 's',
            };
            const out = crossReferenceFailures([failedTest], makeHub([rec]));

            expect(out[0]?.found).toBeTruthy();
            expect(out[0]?.priorCategory).toBe('ASSERT');
            expect(out[0]?.priorConfidence).toBeCloseTo(0.8, 5);
            expect(out[0]?.qualityValid).toBeTruthy();
            expect(out[0]?.sourceConfidence).toBeCloseTo(0.9, 5);
        });

        it('reports qualityValid=false when quality is invalid', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([failedTest], makeHub([], false));

            expect(out[0]?.qualityValid).toBeFalsy();
        });

        it('reports sourceConfidence null when provenance absent', () => {
            expect.hasAssertions();

            const hub = {
                getFailureRecords: () => [],
                getQuality: () => undefined,
                getProvenance: () => undefined,
            } as unknown as DataHub;
            const out = crossReferenceFailures([failedTest], hub);

            expect(out[0]?.sourceConfidence).toBeNull();
        });

        it('marks unmatched failures as not found', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([failedTest], makeHub([]));

            expect(out[0]?.found).toBeFalsy();
            expect(out[0]?.priorCategory).toBeUndefined();
        });
    });

    describe('GetCommitAuthor', () => {
        it('returns unknown when diff has no file markers', () => {
            expect.hasAssertions();
            expect(getCommitAuthor('no files here')).toBe('unknown');
        });

        it('returns unknown when blame yields no author', () => {
            expect.hasAssertions();

            vi.mocked(execFileSync).mockReturnValue('');

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('unknown');
        });

        it('returns author with email from blame output', () => {
            expect.hasAssertions();

            const blame = ['author Jane Doe', 'author-mail <jane@example.com>', 'line 1', 'line 2'].join('\n');
            vi.mocked(execFileSync).mockReturnValue(blame);

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('Jane Doe <jane@example.com>');
        });

        it('returns author without email when author-mail absent', () => {
            expect.hasAssertions();

            vi.mocked(execFileSync).mockReturnValue('author Solo\nother line');

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('Solo');
        });
    });
});
