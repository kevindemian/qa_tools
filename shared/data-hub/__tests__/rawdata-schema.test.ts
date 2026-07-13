/**
 * Gap 1 (Design Gap) — RawData boundary validation.
 *
 * Tests that malformed provider output is REJECTED EXPLICITLY (throws) at the
 * RawData boundary, never silently flowing into compute (silent wrong metrics).
 *
 * RED phase: these tests fail until RawDataSchema + validateRawDataOrThrow exist.
 */
import { describe, it, expect } from 'vitest';
import { RawDataSchema, validateRawDataOrThrow, parseRawData } from '../schemas.js';
import type { RawData } from '../../types/data-hub.js';
import type { PipelineRun, PipelineJob } from '../../types/ci-cd.js';

function makeRun(id: number): PipelineRun {
    return {
        id,
        conclusion: 'success',
        head_branch: 'main',
        created_at: '2026-07-01T10:00:00Z',
    };
}

function validRawData(): RawData {
    const jobs = new Map<number, PipelineJob[]>([[1, []]]);
    const failureReasons = new Map<number, string[]>([[1, ['boom']]]);
    return {
        runs: [makeRun(1), makeRun(2)],
        jobs,
        artifacts: new Map(),
        failureReasons,
    };
}

describe('RawDataSchema — Gap 1 boundary validation', () => {
    it('accepts a well-formed RawData (runs array of PipelineRun)', () => {
        expect.assertions(1);
        expect(() => RawDataSchema.parse(validRawData())).not.toThrow();
    });

    it('rEJECTS when `runs` is missing', () => {
        expect.assertions(1);

        const bad = { jobs: new Map() } as unknown;

        expect(() => RawDataSchema.parse(bad)).toThrow(/expected|invalid|required|code/i);
    });

    it('rEJECTS when `runs` is not an array (wrong type)', () => {
        expect.assertions(1);

        const bad = { runs: 'not-an-array' } as unknown;

        expect(() => RawDataSchema.parse(bad)).toThrow(/expected|invalid|required|code/i);
    });

    it('rEJECTS when a run item has a wrong-typed field (API type change)', () => {
        expect.assertions(1);

        // `id` must be string|number; an object signals a broken API contract.
        const bad = { runs: [{ id: { broken: true } }] } as unknown;

        expect(() => RawDataSchema.parse(bad)).toThrow(/expected|invalid|required|code/i);
    });

    it('rEJECTS when `failureReasons` value is not string[]', () => {
        expect.assertions(1);

        const bad = { ...validRawData(), failureReasons: new Map([[1, 42]]) } as unknown;

        expect(() => RawDataSchema.parse(bad)).toThrow(/expected|invalid|required|code/i);
    });

    it('validateRawDataOrThrow returns RawData on valid input', () => {
        expect.assertions(1);

        const result = validateRawDataOrThrow(validRawData());

        expect(result.runs).toHaveLength(2);
    });

    it('validateRawDataOrThrow THROWS on malformed input (explicit rejection)', () => {
        expect.assertions(1);
        expect(() => validateRawDataOrThrow({ runs: null })).toThrow(/expected|invalid|required|code/i);
    });

    it('parseRawData returns null on malformed input (lenient variant)', () => {
        expect.assertions(1);
        expect(parseRawData({ runs: null })).toBeNull();
    });
});
