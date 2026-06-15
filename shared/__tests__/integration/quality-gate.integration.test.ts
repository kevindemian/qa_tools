/**
 * Integration tests — Quality Gate (FT-10)
 *
 * Validates the quality gate orchestrator:
 * - runQualityGate with/without metrics data
 * - Pass/fail overall based on threshold combination
 * - Individual checks: health-score, pass-rate, flaky-rate, coverage, suite-speed
 * - Project filtering
 * - formatQualityGateJson / formatQualityGateText output
 *
 * Uses real metrics backend via temp directory (XDG_STATE_HOME).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let TEST_DIR: string;
let originalXdgStateHome: string | undefined;

describe('Integration: Quality Gate', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-quality-gate-'));
        const stateDir = path.join(TEST_DIR, 'state');
        fs.mkdirSync(stateDir, { recursive: true });
        originalXdgStateHome = process.env['XDG_STATE_HOME'];
        process.env['XDG_STATE_HOME'] = stateDir;
    });

    afterEach(() => {
        if (originalXdgStateHome !== undefined) {
            process.env['XDG_STATE_HOME'] = originalXdgStateHome;
        } else {
            delete process.env['XDG_STATE_HOME'];
        }
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            /* best effort */
        }
    });

    describe('FT-10a: runQualityGate without data', () => {
        it('returns fail when no metrics data exists', async () => {
            const { runQualityGate } = await import('../../quality-gate.js');
            const result = runQualityGate();
            expect(result.overall).toBe('fail');
            expect(result.checks.length).toBe(1);
            const firstCheck = result.checks[0];
            expect(firstCheck).toBeDefined();
            expect(
                (firstCheck as { name: string; status: string; score: number; threshold: number; details: string })
                    .name,
            ).toBe('metrics-data');
        });
    });

    describe('FT-10b: runQualityGate with good data', () => {
        it('returns pass when metrics are above all thresholds', async () => {
            const { saveParseResult } = await import('../../metrics.js');
            const { runQualityGate } = await import('../../quality-gate.js');

            for (let i = 0; i < 15; i++) {
                saveParseResult('test-project', {
                    stats: { total: 100, passed: 98, failed: 1, skipped: 1, duration: 5000 },
                    tests: Array.from({ length: 100 }, (_, j) => ({
                        title: `test-${j}`,
                        state: (j === 99 ? 'skipped' : j === 98 ? 'failed' : 'passed') as
                            | 'passed'
                            | 'failed'
                            | 'skipped',
                        duration: 50,
                    })),
                });
            }

            const result = runQualityGate({ project: 'test-project' });
            expect(result.overall).toBe('pass');
            expect(result.checks.length).toBe(5);
            expect(result.score).toBeGreaterThan(0);
        });
    });

    describe('FT-10c: formatQualityGateJson', () => {
        it('produces valid JSON', async () => {
            const { formatQualityGateJson } = await import('../../quality-gate.js');
            const result = { overall: 'pass' as const, checks: [], score: 85 };
            const json = formatQualityGateJson(result);
            const parsed = JSON.parse(json) as { overall: string };
            expect(parsed.overall).toBe('pass');
        });
    });

    describe('FT-10d: formatQualityGateText', () => {
        it('produces human-readable output', async () => {
            const { formatQualityGateText } = await import('../../quality-gate.js');
            const result = {
                overall: 'pass' as const,
                checks: [{ name: 'health-score', status: 'pass' as const, score: 85, threshold: 70, details: 'good' }],
                score: 85,
            };
            const text = formatQualityGateText(result);
            expect(text).toContain('Quality Gate');
            expect(text).toContain('PASS');
            expect(text).toContain('health-score');
        });
    });
});
