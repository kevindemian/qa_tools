/**
 * Unit tests for CI run id normalization (`shared/ci/run-id.ts`, F0-T8).
 *
 * Property-based (AGENTS §19.6): the invariant is that `normalizeRunId` only
 * ever emits positive integers or `undefined` — never 0, NaN, Infinity or
 * non-integers — so `saveParseResult(sourceRunId)` can never receive an invalid
 * dedup key.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRunId, getCiRunId } from '../run-id.js';

describe('NormalizeRunId', () => {
    it('accepts numeric strings', () => {
        expect.hasAssertions();
        expect(normalizeRunId('42')).toBe(42);
        expect(normalizeRunId('1')).toBe(1);
    });

    it('accepts numbers', () => {
        expect.hasAssertions();
        expect(normalizeRunId(42)).toBe(42);
        expect(normalizeRunId(7)).toBe(7);
    });

    it('returns undefined for missing/empty input', () => {
        expect.hasAssertions();
        expect(normalizeRunId(undefined)).toBeUndefined();
        expect(normalizeRunId('')).toBeUndefined();
    });

    it('property: never emits 0, negative, NaN, Infinity or non-integers', () => {
        expect.hasAssertions();

        const invalidInputs = ['0', '-3', '3.14', 'abc', 'run-123', 'NaN', 'Infinity', ' 42 ', '42.0', '0x2A', '1e3'];
        for (const raw of invalidInputs) {
            const id = normalizeRunId(raw);

            expect(id === undefined || (Number.isInteger(id) && id > 0)).toBeTruthy();
        }
    });

    it('property: never emits 0/NaN for numeric edge cases', () => {
        expect.hasAssertions();

        for (const raw of [0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            const id = normalizeRunId(raw);

            expect(id === undefined || (Number.isInteger(id) && id > 0)).toBeTruthy();
        }
    });
});

describe('GetCiRunId', () => {
    it('prefers GITHUB_RUN_ID', () => {
        expect.hasAssertions();
        expect(getCiRunId({ GITHUB_RUN_ID: '123', CI_PIPELINE_ID: '456' })).toBe(123);
    });

    it('falls back to CI_PIPELINE_ID', () => {
        expect.hasAssertions();
        expect(getCiRunId({ CI_PIPELINE_ID: '456' })).toBe(456);
    });

    it('falls back to BUILD_BUILDID', () => {
        expect.hasAssertions();
        expect(getCiRunId({ BUILD_BUILDID: '789' })).toBe(789);
    });

    it('returns undefined when no valid id is present', () => {
        expect.hasAssertions();
        expect(getCiRunId({})).toBeUndefined();
        expect(getCiRunId({ GITHUB_RUN_ID: 'run-123' })).toBeUndefined();
        expect(getCiRunId({ GITHUB_RUN_ID: '0' })).toBeUndefined();
    });
});
