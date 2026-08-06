/**
 * F0.7 — Spec integrity: artifact-specs.ts must not contain orphan specs.
 *
 * The 9 deleted artifacts (hub-first deletion, F0.3–F0.6) MUST NOT have
 * orphan specs. `artifact-specs.ts` must contain only:
 * - 8 survivors (incident-report … developer-profile)
 * - 3 reconstructed (coverage-gap, report-html, pr-report-*)
 * - orchestrators (schedule-handler, interactive-mode)
 *
 * A spec for a deleted artifact is a defect: it would re-introduce the
 * artifact to consumers (scorecard, harness, quality gate) that F0.6 pruned.
 */
import { describe, expect, it } from 'vitest';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS } from '../artifact-specs.js';

const ALL_SPEC_IDS = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS].map((s) => s.id);

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

const SURVIVING_ARTIFACT_IDS = [
    'incident-report',
    'impact-alert',
    'backlog-health',
    'pipeline-cost',
    'release-score',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
];

const RECONSTRUCTED_AND_ORCHESTRATOR_IDS = [
    'coverage-gap',
    'report-html',
    'schedule-handler',
    'interactive-mode',
    'pr-report-markdown',
    'pr-report-job-summary',
    'pr-report-html',
];

describe('F0.7 — no orphan specs for deleted artifacts', () => {
    it('spec list contains NO deleted artifact ids', () => {
        expect.hasAssertions();

        const orphans = DELETED_ARTIFACT_IDS.filter((id) => ALL_SPEC_IDS.includes(id));

        expect(orphans).toStrictEqual([]);
    });

    it('spec list contains all 8 surviving artifact ids', () => {
        expect.hasAssertions();

        for (const id of SURVIVING_ARTIFACT_IDS) {
            expect(ALL_SPEC_IDS).toContain(id);
        }
    });

    it('spec list contains the reconstructed and orchestrator ids', () => {
        expect.hasAssertions();

        for (const id of RECONSTRUCTED_AND_ORCHESTRATOR_IDS) {
            expect(ALL_SPEC_IDS).toContain(id);
        }
    });

    it('total spec count is exactly 15 (8 survivors + 7 reconstructed/orchestrators)', () => {
        expect.hasAssertions();

        expect(ALL_SPEC_IDS).toHaveLength(15);
    });
});
