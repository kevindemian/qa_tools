import fs from 'fs';
import os from 'os';
import path from 'path';

let TMP_DIR: string;

beforeEach(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-llm-metrics-test-'));
    process.env.XDG_STATE_HOME = TMP_DIR;
});

afterAll(() => {
    delete process.env.XDG_STATE_HOME;
});

function loadMod() {
    jest.resetModules();
    const mod = require('./llm-metrics') as typeof import('./llm-metrics');
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

    it('records requests and snapshots', () => {
        const { recordLlmRequest, snapshotLlmMetrics, getLlmMetricsHistory } = loadMod();

        recordLlmRequest('main', 500);
        recordLlmRequest('fast', 150);
        const snap = snapshotLlmMetrics();

        expect(snap.totalRequests).toBe(2);
        expect(snap.avgLatencyMs).toBe(325);

        const history = getLlmMetricsHistory();
        expect(history).toHaveLength(1);
    });

    it('23.11: snapshotLlmMetrics round-trip persist', () => {
        const { recordLlmRequest, snapshotLlmMetrics } = loadMod();
        recordLlmRequest('main', 100);
        snapshotLlmMetrics(); // Should persist to disk

        // Reset and load history from the same tmp dir
        const { getLlmMetricsHistory: getHistory2 } = loadMod();
        const history = getHistory2();

        expect(history).toHaveLength(1);
        expect(history[0]!.totalRequests).toBe(1);
    });

    it('23.12: recordArtifactReview approved/rejected', () => {
        const { recordArtifactReview, snapshotLlmMetrics } = loadMod();
        recordArtifactReview(true); // approved
        recordArtifactReview(false); // rejected
        recordArtifactReview(true); // approved

        const snap = snapshotLlmMetrics();
        expect(snap.artifactApproved).toBe(2);
        expect(snap.artifactRejected).toBe(1);
    });

    it('records validation rejections', () => {
        const { recordValidationRejection, snapshotLlmMetrics } = loadMod();

        recordValidationRejection('Campo obrigatório ausente');
        recordValidationRejection('Campo obrigatório ausente');
        recordValidationRejection('Tipo inválido');

        const snap = snapshotLlmMetrics();
        expect(snap.rejectedByValidator).toBe(3);
        expect(snap.rejectionReasons['Campo obrigatório ausente']).toBe(2);
        expect(snap.rejectionReasons['Tipo inválido']).toBe(1);
    });

    it('records retries', () => {
        const { recordRetry, snapshotLlmMetrics } = loadMod();

        recordRetry();
        recordRetry();
        recordRetry();

        const snap = snapshotLlmMetrics();
        expect(snap.retryCount).toBe(3);
    });

    it('records confidence and averages', () => {
        const { recordConfidence, snapshotLlmMetrics } = loadMod();

        recordConfidence('high');
        recordConfidence('medium');
        recordConfidence('low');

        const snap = snapshotLlmMetrics();
        expect(snap.avgConfidence).toBe(0.5);
    });

    it('records failures by tier', () => {
        const { recordLlmFailure, snapshotLlmMetrics } = loadMod();

        recordLlmFailure('main');
        recordLlmFailure('main');
        recordLlmFailure('fast');

        const snap = snapshotLlmMetrics();
        expect(snap.failuresByTier['main']).toBe(2);
        expect(snap.failuresByTier['fast']).toBe(1);
    });

    it('clears accumulators', () => {
        const { recordLlmRequest, clearLlmMetrics, snapshotLlmMetrics } = loadMod();

        recordLlmRequest('main', 100);
        clearLlmMetrics();

        const snap = snapshotLlmMetrics();
        expect(snap.totalRequests).toBe(0);
    });

    it('persists snapshot and retrieves via history', () => {
        const { recordLlmRequest, snapshotLlmMetrics, getLlmMetricsHistory } = loadMod();

        recordLlmRequest('main', 500);
        snapshotLlmMetrics();

        const history = getLlmMetricsHistory();
        expect(history).toHaveLength(1);
        expect(history[0]!.totalRequests).toBe(1);
        expect(history[0]!.avgLatencyMs).toBe(500);
    });

    it('records artifact review counters', () => {
        const { recordArtifactReview, snapshotLlmMetrics } = loadMod();

        recordArtifactReview(true);
        recordArtifactReview(true);
        recordArtifactReview(false);

        const snap = snapshotLlmMetrics();
        expect(snap.artifactApproved).toBe(2);
        expect(snap.artifactRejected).toBe(1);
    });
});
