import { describe, expect, it } from 'vitest';
import { extractCoverage } from '../coverage-extractor.js';

describe('DataHub/extractors/coverage-extractor — branch coverage', () => {
    describe('FromCtrf', () => {
        it('returns null when ctrf is absent', () => {
            expect.hasAssertions();
            expect(extractCoverage({})).toBeNull();
        });

        it('returns null when ctrf has no coverage node', () => {
            expect.hasAssertions();
            expect(extractCoverage({ ctrf: { results: { tests: [] } } })).toBeNull();
        });

        it('defaults missing total/covered to 0', () => {
            expect.hasAssertions();

            const out = extractCoverage({ ctrf: { results: { coverage: { percentage: 70 } } } });

            expect(out).toStrictEqual({ total: 0, covered: 0, percentage: 70 });
        });
    });

    describe('FromGitlab', () => {
        it('returns null for non-numeric coverage', () => {
            expect.hasAssertions();
            expect(extractCoverage({ gitlabCoverage: 'not-a-number' })).toBeNull();
        });
    });

    describe('FromLog', () => {
        it('parses the full "Coverage: p% (covered/total)" regex', () => {
            expect.hasAssertions();

            const out = extractCoverage({ logText: 'Coverage: 85.5% (171/200)' });

            expect(out).toStrictEqual({ total: 200, covered: 171, percentage: 85.5 });
        });

        it('falls back to a bare "coverage: p%" mention when regex fails', () => {
            expect.hasAssertions();

            const out = extractCoverage({ logText: 'some coverage: 72.4% reported' });

            expect(out).toStrictEqual({ total: 0, covered: 0, percentage: 72.4 });
        });

        it('returns null when no percentage can be found in the log', () => {
            expect.hasAssertions();
            expect(extractCoverage({ logText: 'no coverage info here' })).toBeNull();
        });
    });

    describe('FromCheckRunSummary', () => {
        it('parses a "coverage: p%" mention', () => {
            expect.hasAssertions();

            const out = extractCoverage({ checkRunSummary: 'Line Coverage: 72.4%' });

            expect(out).toStrictEqual({ total: 0, covered: 0, percentage: 72.4 });
        });

        it('returns null when summary has no percentage', () => {
            expect.hasAssertions();
            expect(extractCoverage({ checkRunSummary: 'no coverage' })).toBeNull();
        });
    });

    describe('FromJson', () => {
        it('returns null when percentage is not finite', () => {
            expect.hasAssertions();
            expect(extractCoverage({ jsonCoverage: { total: 10, covered: 5, percentage: NaN } })).toBeNull();
        });
    });
});
