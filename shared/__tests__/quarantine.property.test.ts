/**
 * Property-Based Tests — Quarantine (FT-36)
 *
 * Invariants:
 * - generatePipelineQuarantine with store: metadata matches entries count
 * - generatePipelineQuarantine preserves totalTests and ratio
 * - Empty store produces empty pipeline with zero ratio
 */
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import { generatePipelineQuarantine, loadQuarantine } from '../quarantine.js';
import type { QuarantineEntry, QuarantineStore } from '../quarantine.js';

vi.mock('../config', () => ({
    __esModule: true,
    default: {
        xdgStateHome: '/tmp/qa-tools-quarantine-pbt',
        get(key: string) {
            return (this as Record<string, unknown>)[key] as string;
        },
    },
}));

afterEach(() => {
    try {
        fs.rmSync('/tmp/qa-tools-quarantine-pbt', { recursive: true, force: true });
    } catch {
        /* ok */
    }
    try {
        fs.unlinkSync(path.join(process.cwd(), 'qa-quarantine.json'));
    } catch {
        /* ok */
    }
});

const entryArb: fc.Arbitrary<QuarantineEntry> = fc
    .tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.nat({ max: 100 }), fc.boolean())
    .map(([title, flakyInt, permanent]) => ({
        testTitle: title,
        reason: 'flaky',
        quarantinedBy: 'test',
        date: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        flakyRate: flakyInt / 100,
        reviewRequired: true,
        permanent,
    }));

const storeArb: fc.Arbitrary<QuarantineStore> = fc
    .array(entryArb, { minLength: 0, maxLength: 10 })
    .map((entries) => ({ entries }));

describe('generatePipelineQuarantine — property-based', () => {
    it('metadata matches store entries when store is provided', () => {
        fc.assert(
            fc.property(storeArb, fc.nat({ max: 1000 }), (store, total) => {
                const totalTests = total + 1;
                const pipeline = generatePipelineQuarantine(store, totalTests);

                expect(pipeline.excluded).toHaveLength(store.entries.length);
                expect(pipeline.metadata.totalExcluded).toBe(store.entries.length);
                expect(pipeline.metadata.totalTests).toBe(totalTests);
                expect(pipeline.metadata.ratio).toBe(store.entries.length / totalTests);
            }),
            { numRuns: 50 },
        );
    });

    it('excluded items preserve entry fields', () => {
        fc.assert(
            fc.property(storeArb, fc.nat({ max: 1000 }), (store, total) => {
                const totalTests = total + 1;
                const pipeline = generatePipelineQuarantine(store, totalTests);

                for (let i = 0; i < store.entries.length; i++) {
                    const entry = store.entries[i];
                    const item = pipeline.excluded[i];
                    expect(item?.test).toBe(entry?.testTitle);
                    expect(item?.reason).toBe(entry?.reason);
                    expect(item?.quarantinedBy).toBe(entry?.quarantinedBy);
                    expect(item?.reviewRequired).toBe(entry?.reviewRequired);
                    if (entry?.bugUrl) {
                        expect(item?.bugUrl).toBe(entry.bugUrl);
                    }
                }
            }),
            { numRuns: 50 },
        );
    });

    it('empty store produces empty excluded list and zero ratio', () => {
        const empty: QuarantineStore = { entries: [] };
        const pipeline = generatePipelineQuarantine(empty);
        expect(pipeline.excluded).toEqual([]);
        expect(pipeline.metadata.totalExcluded).toBe(0);
        expect(pipeline.metadata.ratio).toBe(0);
        expect(pipeline.metadata.warning).toBe('');
    });
});

describe('loadQuarantine — property-based', () => {
    it('returns empty store for missing file', () => {
        fc.assert(
            fc.property(fc.constant(undefined), () => {
                const store = loadQuarantine();
                expect(store.entries).toEqual([]);
            }),
            { numRuns: 5 },
        );
    });
});
