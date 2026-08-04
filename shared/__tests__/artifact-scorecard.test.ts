/**
 * Artifact scorecard — computes AQS for every artifact and applies the
 * quality gate (I-9.5: artifact with AQS < 60 is flagged for removal).
 *
 * Consumes the same ArtifactSpec SSOT and rendered outputs.
 */

import { describe, it, expect } from 'vitest';
import { computeArtifactScorecard } from '../quality/artifact-scorecard.js';
import type { ArtifactSpec } from '../types/artifact-specs.js';

function makeSpec(id: string, metricName: string, overrides?: Partial<ArtifactSpec>): ArtifactSpec {
    return {
        id,
        purpose: 'Test',
        auditor: 'QA',
        reference: ['ISTQB'],
        ssot: 'dataHub.computed.x',
        file: 'shared/report/x.ts',
        timestamp: false,
        sampleSizeWarning: false,
        metrics: [{ name: metricName, source: 'result.x', format: 'number', severity: 'info', description: 'x' }],
        sections: [],
        actions: [],
        ...overrides,
    };
}

describe('ComputeArtifactScorecard', () => {
    it('scores each artifact independently with its own result', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('good', 'Alpha'), makeSpec('bad', 'Beta')];
        const outputs: Record<string, string> = {
            good: '<div data-dashboard="good">Alpha</div>',
            bad: '<div data-dashboard="bad">nothing here</div>',
        };

        const scorecard = computeArtifactScorecard(specs, outputs);

        expect(scorecard.artifacts).toHaveLength(2);

        const good = scorecard.artifacts.find((a) => a.specId === 'good');
        const bad = scorecard.artifacts.find((a) => a.specId === 'bad');

        expect(good?.score).toBe(100);
        expect(bad?.score).toBe(50);
    });

    it('flags artifacts with AQS < 60 as removable', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('solid', 'Alpha'), makeSpec('fragile', 'Beta')];
        const outputs: Record<string, string> = {
            solid: '<div data-dashboard="solid"><p>Alpha</p></div>',
            fragile: '<div data-dashboard="fragile">missing</div>',
        };

        const scorecard = computeArtifactScorecard(specs, outputs);

        const fragile = scorecard.artifacts.find((a) => a.specId === 'fragile');

        expect(fragile?.overall).toBe('fail');
        expect(scorecard.removable).toContain('fragile');
        expect(scorecard.removable).not.toContain('solid');
    });

    it('reports the scorecard summary counts', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('a', 'Alpha'), makeSpec('b', 'Beta'), makeSpec('c', 'Gamma')];
        const outputs: Record<string, string> = {
            a: '<div data-dashboard="a"><p>Alpha</p></div>',
            b: '<div data-dashboard="b"><p>Beta</p></div>',
            c: '<div data-dashboard="c">missing</div>',
        };

        const scorecard = computeArtifactScorecard(specs, outputs);

        expect(scorecard.total).toBe(3);
        expect(scorecard.passed).toBe(2);
        expect(scorecard.failed).toBe(1);
        expect(scorecard.removable).toHaveLength(1);
    });

    it('handles an artifact with no output entry as failed', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('phantom', 'Alpha')];
        const outputs: Record<string, string> = {};

        const scorecard = computeArtifactScorecard(specs, outputs);

        const phantom = scorecard.artifacts.find((a) => a.specId === 'phantom');

        expect(phantom?.score).toBe(0);
        expect(phantom?.overall).toBe('fail');
        expect(scorecard.removable).toContain('phantom');
    });

    it('returns a deterministic order matching the input spec order', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('z', 'Zeta'), makeSpec('a', 'Alpha')];
        const outputs: Record<string, string> = {
            z: '<div data-dashboard="z"><p>Zeta</p></div>',
            a: '<div data-dashboard="a"><p>Alpha</p></div>',
        };

        const scorecard = computeArtifactScorecard(specs, outputs);

        expect(scorecard.artifacts.map((a) => a.specId)).toStrictEqual(['z', 'a']);
    });

    it('registers non-renderable specs explicitly without fabricating a score', () => {
        expect.hasAssertions();

        const specs: ArtifactSpec[] = [makeSpec('renderable', 'Alpha')];
        const outputs: Record<string, string> = {
            renderable: '<div data-dashboard="renderable"><p>Alpha</p></div>',
        };

        const scorecard = computeArtifactScorecard(specs, outputs, {
            unscored: [
                { specId: 'schedule-handler', status: 'nao-aplicavel', note: 'orchestrator — no standalone artifact' },
            ],
        });

        expect(scorecard.artifacts).toHaveLength(1);
        expect(scorecard.unscored).toHaveLength(1);
        expect(scorecard.unscored[0]).toMatchObject({
            specId: 'schedule-handler',
            status: 'nao-aplicavel',
        });
        expect(scorecard.removable).not.toContain('schedule-handler');
    });
});
