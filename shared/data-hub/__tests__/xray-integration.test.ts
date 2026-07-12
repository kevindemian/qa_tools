/**
 * Integration tests — Xray data flows through CompositeProvider and DataHub.
 * Verifies end-to-end merge of RawXrayData into RawData (PM-4 + hub merge path).
 */
import { describe, it, expect } from 'vitest';
import { CompositeProvider } from '../providers/composite-provider.js';
import { DataHubImpl } from '../hub.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';
import type { DataProvider, RawData, RawXrayData, DataHubPersistence, FetchOptions } from '../../types/data-hub.js';

function fakeProvider(name: string, source: 'github' | 'xray', xray?: RawXrayData): DataProvider {
    return {
        name,
        source,
        fetchRawData(_o: FetchOptions): Promise<RawData> {
            return Promise.resolve({
                runs:
                    source === 'github'
                        ? [{ id: 1, head_branch: 'main', conclusion: 'success', created_at: 't', updated_at: 't' }]
                        : [],
                jobs: new Map(),
                artifacts: new Map(),
                failureReasons: new Map(),
                ...(xray ? { xray } : {}),
            });
        },
    };
}

const SAMPLE_XRAY: RawXrayData = {
    testExecutions: [{ key: 'CALC-456', status: 'EXECUTING', total: 1, passed: 1, failed: 0, skipped: 0 }],
    testRuns: [{ id: 'r1', testKey: 'CALC-1', status: 'PASSED', testExecutionKey: 'CALC-456' }],
};

const persistence: DataHubPersistence = makeDataHubPersistenceMock();

describe('Integration: Xray merge', () => {
    it('compositeProvider merges xray from the xray provider', async () => {
        expect.hasAssertions();

        const composite = new CompositeProvider([
            fakeProvider('github', 'github'),
            fakeProvider('xray', 'xray', SAMPLE_XRAY),
        ]);
        const raw = await composite.fetchRawData({ repo: 'CALC' });

        expect(raw.runs).toHaveLength(1);
        expect(raw.xray).toBeDefined();
        expect(raw.xray?.testExecutions[0]?.key).toBe('CALC-456');
        expect(raw.xray?.testRuns[0]?.status).toBe('PASSED');
    });

    it('dataHubImpl.create surfaces xray from providers (end-to-end)', async () => {
        expect.hasAssertions();

        const result = await DataHubImpl.create(
            [fakeProvider('github', 'github'), fakeProvider('xray', 'xray', SAMPLE_XRAY)],
            { repo: 'CALC', allowEmpty: true },
            persistence,
        );

        expect(result.hub.raw.xray).toBeDefined();
        expect(result.hub.raw.xray?.testRuns).toHaveLength(1);
        // computeMetrics must not crash with xray present
        expect(result.hub.computed).toBeDefined();
        expect(typeof result.hub.computed.passRate).toBe('number');
    });

    it('dataHubImpl.create without xray leaves raw.xray undefined (no false data)', async () => {
        expect.hasAssertions();

        const result = await DataHubImpl.create(
            [fakeProvider('github', 'github')],
            { repo: 'CALC', allowEmpty: true },
            persistence,
        );

        expect(result.hub.raw.xray).toBeUndefined();
    });
});
