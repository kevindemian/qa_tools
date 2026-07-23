/**
 * Integration tests — Backlog Health (FT-28)
 *
 * Validates the Backlog Health analysis and dashboard end-to-end:
 * - analyzeBacklogHealth + generateBacklogHealthHtml with flagged issues
 * - Empty backlog
 * - Edge cases
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BacklogHealthIssue } from '../../report/backlog-health.js';

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const now = new Date();
function daysAgo(d: number): string {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    return date.toISOString();
}

function makeIssues(): BacklogHealthIssue[] {
    return [
        {
            key: 'PROJ-1',
            summary: 'Login bug',
            assignee: 'alice',
            updated: daysAgo(5),
            type: 'Bug',
            priority: 'high',
            linkedTestCount: 2,
        },
        {
            key: 'PROJ-2',
            summary: 'Dashboard crash',
            assignee: null,
            updated: daysAgo(10),
            type: 'Bug',
            priority: 'critical',
            linkedTestCount: 0,
        },
        {
            key: 'PROJ-3',
            summary: 'Style fix',
            assignee: 'bob',
            updated: daysAgo(60),
            type: 'Task',
            priority: 'low',
            linkedTestCount: 0,
        },
        {
            key: 'PROJ-4',
            summary: 'API timeout',
            assignee: null,
            updated: daysAgo(90),
            type: 'Bug',
            priority: 'medium',
            linkedTestCount: 0,
        },
    ];
}

describe('Integration: Backlog Health (FT-28)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-28a: analyze and render with flagged issues', () => {
        it('produces dashboard with issue sections for each category', async () => {
            expect.hasAssertions();

            const { analyzeBacklogHealth, generateBacklogHealthHtml } = await import('../../report/backlog-health.js');
            const result = analyzeBacklogHealth(makeIssues());
            const html = generateBacklogHealthHtml(result);

            expect(html).toContain('backlog-health');
            expect(html).toContain('Backlog Score');
            expect(html).toMatch(/Unassigned Issues\s*\(2\)/);
            expect(html).toMatch(/Stale Issues\s*\(2\)/);
            expect(html).toMatch(/Bugs Without Tests\s*\(2\)/);
            expect(html).toContain('PROJ-2');
            expect(html).toContain('PROJ-3');
            expect(html).toContain('PROJ-4');
        });

        it('includes Density by Epic section', async () => {
            expect.hasAssertions();

            const { analyzeBacklogHealth, generateBacklogHealthHtml } = await import('../../report/backlog-health.js');
            const result = analyzeBacklogHealth(makeIssues());
            const html = generateBacklogHealthHtml(result);

            expect(html).toContain('Density by Epic');
        });
    });

    describe('FT-28b: empty backlog', () => {
        it('shows perfect score and no flagged sections', async () => {
            expect.hasAssertions();

            const { analyzeBacklogHealth, generateBacklogHealthHtml } = await import('../../report/backlog-health.js');
            const result = analyzeBacklogHealth([]);
            const html = generateBacklogHealthHtml(result);

            expect(html).toContain('backlog-health');
            expect(html).toContain('N/A');
            expect(html).not.toContain('Unassigned Issues (');
            expect(html).not.toContain('Stale Issues (');
            expect(html).not.toContain('Bugs Without Tests (');
        });
    });

    describe('FT-28c: maxIssues option limits display, not analysis', () => {
        it('all issues analyzed; display capped with explicit note', async () => {
            expect.hasAssertions();

            const { analyzeBacklogHealth, generateBacklogHealthHtml } = await import('../../report/backlog-health.js');
            const all = makeIssues();
            const result = analyzeBacklogHealth(all, { maxIssues: 1 });
            const html = generateBacklogHealthHtml(result);

            // Analysis is over the full set (not truncated to maxIssues).
            expect(result.totalIssues).toBe(all.length);
            // Display is capped and the truncation is explicit (no silent data loss).
            expect(html).toContain('Showing first 1 of');
        });
    });
});
