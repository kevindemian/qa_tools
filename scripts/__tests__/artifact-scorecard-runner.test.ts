import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScorecard } from '../artifact-scorecard-runner.js';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS } from '../../shared/types/artifact-specs.js';

const HTML_RENDERABLE_SPECS = [
    'ai-effectiveness',
    'ai-comparison',
    'incident-report',
    'impact-alert',
    'traceability',
    'flakiness',
    'backlog-health',
    'pipeline-cost',
    'suite-optimization',
    'cross-squad-benchmark',
    'release-score',
    'silent-regression',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
    'requirement-score',
    'coverage-gap',
];

const ALL_SPEC_IDS = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS].map((s) => s.id);

describe('ArtifactScorecardRunner', () => {
    it('scores every HTML-renderable artifact with a numeric AQS', () => {
        expect.hasAssertions();

        const scorecard = runScorecard();
        const scoredIds = new Set(scorecard.artifacts.map((a) => a.specId));

        for (const id of HTML_RENDERABLE_SPECS) {
            expect(scoredIds.has(id), `artifact "${id}" should be scored`).toBeTruthy();
        }
    });

    it('reports one artifact per renderable spec (no orphans, no gaps)', () => {
        expect.hasAssertions();

        const scorecard = runScorecard();

        expect(scorecard.artifacts).toHaveLength(HTML_RENDERABLE_SPECS.length);

        for (const a of scorecard.artifacts) {
            expect(ALL_SPEC_IDS).toContain(a.specId);
            expect(Number.isFinite(a.score)).toBeTruthy();
            expect(a.score).toBeGreaterThanOrEqual(0);
            expect(a.score).toBeLessThanOrEqual(100);
            expect(['pass', 'warn', 'fail']).toContain(a.overall);
        }
    });

    it('emits a deterministic scorecard JSON file to reports/validation', () => {
        expect.hasAssertions();

        runScorecard();
        const path = join(import.meta.dirname, '..', '..', 'reports', 'validation', 'artifact-scorecard.json');
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
            total: number;
            artifacts: unknown[];
            removable: unknown[];
        };

        expect(parsed.total).toBe(HTML_RENDERABLE_SPECS.length);
        expect(Array.isArray(parsed.artifacts)).toBeTruthy();
        expect(Array.isArray(parsed.removable)).toBeTruthy();
    });
});
