import fs from 'fs';
import os from 'os';
import path from 'path';
import { nonNull } from './test-utils.js';

let TMP_DIR: string;

beforeEach(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-llm-metrics-test-'));
    process.env['XDG_STATE_HOME'] = TMP_DIR;
});

afterAll(() => {
    delete process.env['XDG_STATE_HOME'];
});

async function loadMod() {
    vi.resetModules();
    const mod = await import('./llm-metrics.js');
    mod.clearLlmMetrics();
    return mod;
}

describe('LlmMetrics', () => {
    afterEach(() => {
        try {
            fs.rmSync(TMP_DIR, { recursive: true });
        } catch {
            /* ok */
        }
    });

    it('records requests and snapshots', async () => {
        const { recordLlmRequest, snapshotLlmMetrics, getLlmMetricsHistory } = await loadMod();

        recordLlmRequest('main', 500);
        recordLlmRequest('fast', 150);
        const snap = snapshotLlmMetrics();

        expect(snap.totalRequests).toBe(2);
        expect(snap.avgLatencyMs).toBe(325);

        const history = getLlmMetricsHistory();

        expect(history).toHaveLength(1);
    });

    it('23.11: snapshotLlmMetrics round-trip persist', async () => {
        const { recordLlmRequest, snapshotLlmMetrics } = await loadMod();
        recordLlmRequest('main', 100);
        snapshotLlmMetrics(); // Should persist to disk

        // Reset and load history from the same tmp dir
        const { getLlmMetricsHistory: getHistory2 } = await loadMod();
        const history = getHistory2();

        expect(history).toHaveLength(1);
        expect(nonNull(history[0]).totalRequests).toBe(1);
    });

    it('23.12: recordArtifactReview approved/rejected', async () => {
        const { recordArtifactReview, snapshotLlmMetrics } = await loadMod();
        recordArtifactReview(true); // approved
        recordArtifactReview(false); // rejected
        recordArtifactReview(true); // approved

        const snap = snapshotLlmMetrics();

        expect(snap.artifactApproved).toBe(2);
        expect(snap.artifactRejected).toBe(1);
    });

    it('records validation rejections', async () => {
        const { recordValidationRejection, snapshotLlmMetrics } = await loadMod();

        recordValidationRejection('Campo obrigatório ausente');
        recordValidationRejection('Campo obrigatório ausente');
        recordValidationRejection('Tipo inválido');

        const snap = snapshotLlmMetrics();

        expect(snap.rejectedByValidator).toBe(3);
        expect(snap.rejectionReasons['Campo obrigatório ausente']).toBe(2);
        expect(snap.rejectionReasons['Tipo inválido']).toBe(1);
    });

    it('records retries', async () => {
        const { recordRetry, snapshotLlmMetrics } = await loadMod();

        recordRetry();
        recordRetry();
        recordRetry();

        const snap = snapshotLlmMetrics();

        expect(snap.retryCount).toBe(3);
    });

    it('records confidence and averages', async () => {
        const { recordConfidence, snapshotLlmMetrics } = await loadMod();

        recordConfidence('high');
        recordConfidence('medium');
        recordConfidence('low');

        const snap = snapshotLlmMetrics();

        expect(snap.avgConfidence).toBe(0.5);
    });

    it('records failures by tier', async () => {
        const { recordLlmFailure, snapshotLlmMetrics } = await loadMod();

        recordLlmFailure('main');
        recordLlmFailure('main');
        recordLlmFailure('fast');

        const snap = snapshotLlmMetrics();

        expect(snap.failuresByTier?.['main']).toBe(2);
        expect(snap.failuresByTier?.['fast']).toBe(1);
    });

    it('clears accumulators', async () => {
        const { recordLlmRequest, clearLlmMetrics, snapshotLlmMetrics } = await loadMod();

        recordLlmRequest('main', 100);
        clearLlmMetrics();

        const snap = snapshotLlmMetrics();

        expect(snap.totalRequests).toBe(0);
    });

    it('persists snapshot and retrieves via history', async () => {
        const { recordLlmRequest, snapshotLlmMetrics, getLlmMetricsHistory } = await loadMod();

        recordLlmRequest('main', 500);
        snapshotLlmMetrics();

        const history = getLlmMetricsHistory();

        expect(history).toHaveLength(1);
        expect(nonNull(history[0]).totalRequests).toBe(1);
        expect(nonNull(history[0]).avgLatencyMs).toBe(500);
    });

    it('records artifact review counters', async () => {
        const { recordArtifactReview, snapshotLlmMetrics } = await loadMod();

        recordArtifactReview(true);
        recordArtifactReview(true);
        recordArtifactReview(false);

        const snap = snapshotLlmMetrics();

        expect(snap.artifactApproved).toBe(2);
        expect(snap.artifactRejected).toBe(1);
    });

    it('handles loadStore read failure gracefully', async () => {
        const mod = await loadMod();
        mod.recordLlmRequest('main', 100);
        mod.snapshotLlmMetrics();
        const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
            throw new Error('EIO');
        });
        try {
            const history = mod.getLlmMetricsHistory();

            expect(history).toEqual([]);
        } finally {
            readSpy.mockRestore();
        }
    });

    it('records per-model latency', async () => {
        const { recordLlmRequest, snapshotLlmMetrics } = await loadMod();

        recordLlmRequest('main', 500, 'gpt-4o');
        recordLlmRequest('main', 300, 'gpt-4o');
        recordLlmRequest('fast', 100, 'gpt-4o-mini');

        const snap = snapshotLlmMetrics();

        expect(snap.totalRequests).toBe(3);
        expect(snap.latencyByModel['gpt-4o']).toEqual({ avgMs: 400, count: 2 });
        expect(snap.latencyByModel['gpt-4o-mini']).toEqual({ avgMs: 100, count: 1 });
    });

    it('handles saveStore write failure gracefully', async () => {
        const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
            throw new Error('ENOSPC');
        });
        try {
            const mod = await loadMod();
            mod.recordLlmRequest('main', 100);

            expect(() => mod.snapshotLlmMetrics()).toThrow('Failed to persist LLM metrics');
        } finally {
            renameSpy.mockRestore();
        }
    });
});
