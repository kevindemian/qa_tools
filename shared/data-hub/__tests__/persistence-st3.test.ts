/**
 * ST-3 store-gate tests — `DataHubPersistence` save methods apply the same
 * quality wrappers as a defense-in-depth backstop, so the durable store never
 * holds NaN/Infinity, schema-invalid, or un-deduped data. Invalid/low-quality
 * data is TAGGED AND STORED (never dropped).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { StoreBackend } from '../../infra/store-backend.js';
import type { FailureRecord, DoraMetrics } from '../../types/data-hub.js';
import { createDataHubPersistence } from '../persistence.js';

class MemoryBackend implements StoreBackend {
    private readonly store = new Map<string, Buffer>();

    init(): void {
        /* no-op for memory */
    }

    exists(relPath: string): boolean {
        return this.store.has(relPath);
    }

    read(relPath: string): Buffer | null {
        return this.store.get(relPath) ?? null;
    }

    write(relPath: string, data: Buffer): void {
        this.store.set(relPath, data);
    }

    flush(_message: string): void {
        /* no-op for memory */
    }
}

function makeHub() {
    const backend = new MemoryBackend();
    const persistence = createDataHubPersistence('st3-test', backend);
    return { backend, persistence };
}

describe('Store gate: array category', () => {
    let persistence: ReturnType<typeof createDataHubPersistence>;

    beforeEach(() => {
        persistence = makeHub().persistence;
    });

    it('normalizes NaN confidence, dedups, and stores invalid records (tagged, not dropped)', () => {
        const recs = [
            { name: 'a', status: 'failed', confidence: NaN, source: 'junit' },
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'weird', confidence: 1, source: 'junit' },
        ] as unknown as FailureRecord[];

        persistence.saveFailureRecords(recs);

        const stored = persistence.loadFailureRecords();

        expect(stored).toHaveLength(2);

        const a = stored.find((r) => r.name === 'a');

        expect(Number.isFinite(a?.confidence)).toBeTruthy();

        expect(a?.confidence).toBeCloseTo(0.9, 5);

        const b = stored.find((r) => r.name === 'b');

        expect(b?.status).toBe('weird');
    });

    it('stores valid records unchanged', () => {
        const recs: FailureRecord[] = [
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'broken', confidence: 0.8, source: 'ctrf' },
        ];

        persistence.saveFailureRecords(recs);

        expect(persistence.loadFailureRecords()).toStrictEqual(recs);
    });
});

describe('Store gate: object category', () => {
    let persistence: ReturnType<typeof createDataHubPersistence>;

    beforeEach(() => {
        persistence = makeHub().persistence;
    });

    it('normalizes NaN confidence on DORA metrics and stores the value', () => {
        const metrics: DoraMetrics = { deploymentFrequency: 5, confidence: NaN };

        persistence.saveDoraMetrics(metrics);

        const stored = persistence.loadDoraMetrics();

        expect(stored).not.toBeNull();

        expect(Number.isFinite(stored?.confidence)).toBeTruthy();

        expect(stored?.confidence).toBeCloseTo(0.5, 5);
    });
});
