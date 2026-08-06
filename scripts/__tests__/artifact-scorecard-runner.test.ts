import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScorecard } from '../artifact-scorecard-runner.js';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS } from '../../shared/types/artifact-specs.js';

// F0.6: only artifacts vigentes (8 survivors + 2 renderable reconstructed) are scored.
// The 9 deleted dashboards are removed from the scorecard/harness evaluation.
const HTML_RENDERABLE_SPECS = [
    'report-html',
    'incident-report',
    'impact-alert',
    'backlog-health',
    'pipeline-cost',
    'release-score',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
    'coverage-gap',
];

const DELETED_ARTIFACT_IDS = [
    'ai-effectiveness',
    'ai-comparison',
    'traceability',
    'flakiness',
    'suite-optimization',
    'cross-squad-benchmark',
    'silent-regression',
    'requirement-score',
    'pipeline-health',
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

    it('registers the 5 non-renderable specs explicitly (15 total accounted)', () => {
        expect.hasAssertions();

        const scorecard = runScorecard();

        // 10 scored + 5 unscored = 15 (only artifacts vigentes are accounted, I-9.4).
        // The 9 deleted dashboards are not registered (orphan specs removed).
        expect(scorecard.artifacts).toHaveLength(HTML_RENDERABLE_SPECS.length);
        expect(scorecard.unscored).toHaveLength(5);

        const unscoredIds = scorecard.unscored.map((u) => u.specId);
        for (const id of [
            'schedule-handler',
            'interactive-mode',
            'pr-report-markdown',
            'pr-report-job-summary',
            'pr-report-html',
        ]) {
            expect(unscoredIds).toContain(id);
        }

        const registeredIds = [...scorecard.artifacts.map((a) => a.specId), ...unscoredIds];
        for (const id of ALL_SPEC_IDS) {
            if (DELETED_ARTIFACT_IDS.includes(id)) continue;

            expect(registeredIds).toContain(id);
        }
    });

    it('does not score or register any deleted artifact (orphan specs removed, F0.6)', () => {
        expect.hasAssertions();

        const scorecard = runScorecard();

        const registeredIds = new Set([
            ...scorecard.artifacts.map((a) => a.specId),
            ...scorecard.unscored.map((u) => u.specId),
        ]);

        for (const id of DELETED_ARTIFACT_IDS) {
            expect(registeredIds.has(id), `deleted artifact still registered: ${id}`).toBeFalsy();
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
