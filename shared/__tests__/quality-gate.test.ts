/**
 * Quality gate — health score threshold validation via calculateHealthScore.
 *
 * NOTE: runQualityGate, formatQualityGateJson, formatQualityGateText are tested
 * in shared/quality-gate.test.ts (co-located with source).
 */
import { describe, it, expect, vi } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import { runQualityGate } from '../quality-gate.js';
import type { DataHub, ComputedMetrics, RawData, DataSource } from '../types/data-hub.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

function createTestHub(overrides: Partial<ComputedMetrics> = {}): DataHub {
    return makeDataHubMock({
        computed: {
            passRate: 50,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            coverage: 42,
            testPassRate: 50,
            testCounts: { passed: 50, failed: 50, skipped: 0, total: 100 },
            framework: 'vitest',
            executionRate: 77,
            flakyPercentage: 12,
            ...overrides,
        },
    });
}

describe('Quality gate thresholds via health score', () => {
    it('quality gate passes with good metrics', () => {
        const result = calculateHealthScore({
            dataHub: createTestHub({
                passRate: 95,
                coverage: 85,
                executionRate: 95,
                suiteSpeedP95: 500,
                flakyPercentage: 1,
            }),
        });

        expect(result.qualityGate).toBe('pass');
    });

    it('quality gate fails with low pass rate', () => {
        const result = calculateHealthScore({ dataHub: createTestHub() });

        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with low coverage', () => {
        const result = calculateHealthScore({ dataHub: createTestHub() });

        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with slow suite', () => {
        const result = calculateHealthScore({
            dataHub: createTestHub({ suiteSpeedP95: 5000 }),
        });

        expect(result.qualityGate).toBe('fail');
    });
});

describe('EIXO C — extended category checks (C-3b)', () => {
    it('reports incompleteItems for ST-1 categories absent from the unified model', () => {
        expect.hasAssertions();

        const result = runQualityGate({ dataHub: createTestHub() });

        expect(result.incompleteItems).toBeDefined();

        for (const cat of [
            'securityFindings',
            'deployments',
            'releases',
            'doraMetrics',
            'pmIssues',
            'performanceMetrics',
        ]) {
            expect(result.incompleteItems).toContain(cat);
        }
    });

    it('passes a present category whose getQuality() is valid', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            securityFindings: [{ tool: 'codeql', severity: 'low', title: 'f1', confidence: 0.9 }],
            provenance: new Map<string, DataSource>([
                ['securityFindings', { confidence: 0.9, source: 'github-api', timestamp: new Date().toISOString() }],
            ]),
        };
        const hub = makeDataHubMock({
            raw,
            computed: { passRate: 50, coverage: 42, executionRate: 77, suiteSpeedP95: 500 },
        });
        hub.getQuality = vi.fn().mockReturnValue({ valid: true, issues: [] });

        const result = runQualityGate({ dataHub: hub });

        const check = result.checks.find((c) => c.name === 'data-quality:securityFindings');

        expect(check).toBeDefined();
        expect(check?.status).toBe('pass');
        expect(check?.score).toBe(90);
        expect(result.incompleteItems).not.toContain('securityFindings');
    });

    it('fails a present category whose getQuality() reports issues', () => {
        expect.hasAssertions();

        const raw: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            securityFindings: [{ tool: 'codeql', severity: 'low', title: 'f1', confidence: 0.9 }],
            provenance: new Map<string, DataSource>([
                ['securityFindings', { confidence: 0.9, source: 'github-api', timestamp: new Date().toISOString() }],
            ]),
        };
        const hub = makeDataHubMock({
            raw,
            computed: { passRate: 50, coverage: 42, executionRate: 77, suiteSpeedP95: 500 },
        });
        hub.getQuality = vi.fn().mockReturnValue({ valid: false, issues: ['low confidence'] });

        const result = runQualityGate({ dataHub: hub });

        const check = result.checks.find((c) => c.name === 'data-quality:securityFindings');

        expect(check?.status).toBe('fail');
        expect(check?.score).toBe(0);
    });
});
