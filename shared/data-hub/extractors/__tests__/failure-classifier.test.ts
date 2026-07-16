import { describe, expect, it } from 'vitest';
import { failureEntryToRecord, classifyFailures } from '../failure-classifier.js';
import type { FailureEntry } from '../failure-classifier.js';

describe('DataHub/extractors/failure-classifier', () => {
    describe('FailureEntryToRecord', () => {
        it('maps a warning-level entry to broken status', () => {
            expect.hasAssertions();

            const entry: FailureEntry = {
                level: 'warning',
                message: 'm',
                category: 'ENV',
                confidence: 0.5,
                source: 's',
            };
            const rec = failureEntryToRecord(entry);

            expect(rec.status).toBe('broken');
        });

        it('maps a non-warning entry to failed status', () => {
            expect.hasAssertions();

            const entry: FailureEntry = {
                level: 'error',
                message: 'm',
                category: 'ASSERT',
                confidence: 0.6,
                source: 's',
            };
            const rec = failureEntryToRecord(entry);

            expect(rec.status).toBe('failed');
        });

        it('prefers reason as name when message absent', () => {
            expect.hasAssertions();

            const entry: FailureEntry = {
                level: 'error',
                reason: 'the-reason',
                category: 'X',
                confidence: 0.1,
                source: 's',
            };
            const rec = failureEntryToRecord(entry);

            expect(rec.name).toBe('the-reason');
            expect(rec.message).toBe('the-reason');
        });

        it('omits non-finite line numbers rather than coercing them', () => {
            expect.hasAssertions();

            const entry: FailureEntry = {
                level: 'error',
                message: 'm',
                line: NaN,
                category: 'X',
                confidence: 0.1,
                source: 's',
            };
            const rec = failureEntryToRecord(entry);

            expect(rec.line).toBeUndefined();
        });

        it('preserves finite line numbers', () => {
            expect.hasAssertions();

            const entry: FailureEntry = {
                level: 'error',
                message: 'm',
                line: 42,
                category: 'X',
                confidence: 0.1,
                source: 's',
            };
            const rec = failureEntryToRecord(entry);

            expect(rec.line).toBe(42);
        });
    });

    describe('ClassifyFailures', () => {
        it('returns empty array when no input signals present', () => {
            expect.hasAssertions();
            expect(classifyFailures({})).toStrictEqual([]);
        });

        it('prioritizes gitlabFailureReason over other signals', () => {
            expect.hasAssertions();

            const out = classifyFailures({
                gitlabFailureReason: 'ReferenceError: x is not defined',
                githubSteps: [{ name: 's', status: 'failed', conclusion: 'failure' } as never],
            });

            expect(out.length).toBeGreaterThan(0);
            expect(out[0]?.source).toBe('gitlab-reason');
        });

        it('falls through to log text when steps/annotations empty', () => {
            expect.hasAssertions();

            const out = classifyFailures({ logText: 'Error: something failed after timeout' });

            expect(out.length).toBeGreaterThan(0);
            expect(out[0]?.source).toBe('log-regex');
        });
    });
});
