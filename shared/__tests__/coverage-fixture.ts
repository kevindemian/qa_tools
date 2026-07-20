/** Test fixture factory — builds a canonical-shaped `CoverageGapResult`.
 *
 * Centralizes the (large) canonical contract so traceability/coverage tests
 * express intent compactly without re-encoding the deprecated narrow shape
 * (`item.epic`, `byEpic:{total,covered,rawPct}`). Consuming the canonical type
 * is the root-cause fix for #C3.
 */
import type { CoverageGapResult, CoverageGapItem, EpicCoverage } from '../types/coverage.js';

export interface EpicFixtureSpec {
    items: Array<{ issueKey: string; hasTest: boolean; linkedTestKeys?: string[] }>;
    rawPct: number;
    total?: number;
    covered?: number;
}

export function makeCoverageGapResult(epics: Record<string, EpicFixtureSpec>): CoverageGapResult {
    const items: CoverageGapItem[] = [];
    const byEpic: Record<string, EpicCoverage> = {};

    for (const [epicKey, spec] of Object.entries(epics)) {
        for (const it of spec.items) {
            items.push({
                issueKey: it.issueKey,
                summary: it.issueKey,
                type: 'Story',
                status: 'Done',
                hasTest: it.hasTest,
                linkedTestKeys: it.linkedTestKeys ?? [],
                priority: 'Medium',
                coverageWeight: 1,
                epicKey,
            });
        }
        const total = spec.total ?? spec.items.length;
        const covered = spec.covered ?? spec.items.filter((i) => i.hasTest).length;
        byEpic[epicKey] = {
            epicSummary: epicKey,
            total,
            covered,
            weightedPct: spec.rawPct,
            rawPct: spec.rawPct,
            gatePass: spec.rawPct >= 50,
            issues: [],
        };
    }

    const totalIssues = items.length;
    const coveredIssues = items.filter((i) => i.hasTest).length;
    const pct = totalIssues > 0 ? Math.round((coveredIssues / totalIssues) * 100) : 0;

    return {
        items,
        totals: {
            totalIssues,
            covered: coveredIssues,
            gap: totalIssues - coveredIssues,
            weightedCoveragePct: pct,
            rawCoveragePct: pct,
        },
        byEpic,
        gateConfig: { minCoveragePct: 50, failingEpics: [] },
        hierarchy: [],
        trends: [],
    };
}
