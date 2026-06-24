/**
 * Integration tests — Coverage Gap (FT-18)
 *
 * Validates the Coverage Gap HTML report end-to-end:
 * - generateCoverageGapHtml with varying gap results
 * - Quality gate pass/fail rendering
 * - Gap table rendering
 * - Error fallback
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoverageGapResult } from '../../types.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

vi.mock('../../date-utils.js', () => ({
    formatDateISO: vi.fn(() => '2026-06-19'),
}));

function makeResult(overrides?: Partial<CoverageGapResult>): CoverageGapResult {
    return {
        items: [
            {
                issueKey: 'PROJ-1',
                summary: 'Setup database',
                type: 'Task',
                status: 'Done',
                hasTest: true,
                linkedTestKeys: ['TEST-1'],
                priority: 'High',
                coverageWeight: 5,
            },
            {
                issueKey: 'PROJ-2',
                summary: 'Implement login',
                type: 'Story',
                status: 'In Progress',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'Critical',
                coverageWeight: 8,
                epicKey: 'EPIC-1',
                epicSummary: 'Authentication',
            },
            {
                issueKey: 'EPIC-1',
                summary: 'Authentication epic',
                type: 'Epic',
                status: 'In Progress',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'High',
                coverageWeight: 10,
            },
        ],
        totals: { totalIssues: 3, covered: 1, gap: 2, weightedCoveragePct: 33, rawCoveragePct: 33 },
        byEpic: {
            EPIC_1: {
                epicSummary: 'Authentication',
                total: 1,
                covered: 0,
                weightedPct: 0,
                rawPct: 0,
                gatePass: false,
                issues: [],
            },
        },
        gateConfig: { minCoveragePct: 50, failingEpics: ['EPIC_1'] },
        hierarchy: [
            {
                key: 'EPIC-1',
                summary: 'Authentication epic',
                type: 'Epic',
                children: [],
                totalIssues: 1,
                coveredIssues: 0,
                coveragePct: 0,
            },
        ],
        trends: [],
        ...overrides,
    };
}

describe('Integration: Coverage Gap (FT-18)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-18a: generateCoverageGapHtml with gaps', () => {
        it('produces complete HTML with summary and gap table', async () => {expect.hasAssertions();

            const { generateCoverageGapHtml } = await import('../../generate-coverage-gap-html.js');
            const result = makeResult();
            const html = generateCoverageGapHtml(result, 'Gap Report');

            expect(html).toContain('Gap Report');
            expect(html).toContain('PROJ-2');
            expect(html).toContain('GAP');
            expect(html).toContain('Quality Gate');
            expect(html).toContain('33' + '%');
        });
    });

    describe('FT-18b: all items covered (no gaps)', () => {
        it('shows no-gaps message and passing quality gate', async () => {expect.hasAssertions();

            const { generateCoverageGapHtml } = await import('../../generate-coverage-gap-html.js');
            const result = makeResult({
                items: [
                    {
                        issueKey: 'PROJ-1',
                        summary: 'Covered task',
                        type: 'Task',
                        status: 'Done',
                        hasTest: true,
                        linkedTestKeys: ['TEST-1'],
                        priority: 'High',
                        coverageWeight: 5,
                    },
                ],
                totals: { totalIssues: 1, covered: 1, gap: 0, weightedCoveragePct: 100, rawCoveragePct: 100 },
                byEpic: {},
                gateConfig: { minCoveragePct: 50, failingEpics: [] },
                hierarchy: [],
            });
            const html = generateCoverageGapHtml(result);

            expect(html).toContain('No coverage gaps found');
            expect(html).toContain('All epics pass');
        });
    });

    describe('FT-18c: error fallback', () => {
        it('returns error page when formatDateISO throws', async () => {expect.hasAssertions();

            const { formatDateISO } = await import('../../date-utils.js');
            const dateMock = vi.mocked(formatDateISO);
            dateMock.mockImplementationOnce(() => {
                throw new Error('simulated failure');
            });
            const { rootLogger } = await import('../../logger.js');
            const { generateCoverageGapHtml } = await import('../../generate-coverage-gap-html.js');
            const result = generateCoverageGapHtml(makeResult());

            expect(result).toContain('Error generating coverage gap report');
            expect(rootLogger['error']).toHaveBeenCalled();
        });
    });
});
