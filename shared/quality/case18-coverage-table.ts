/**
 * Case18 Coverage Table — audit artifact mapping each acceptance criterion to the
 * test cases that cover it, plus an explicit declaration of the standards
 * (source + standard) that justify the coverage model.
 *
 * JSON is the source of truth (SSOT); HTML is the human-readable render.
 *
 * Provenance pattern mirrored from `requirement-score.ts` (source + standard).
 */

import type { GeneratedTestCase } from './case18-types.js';

/** Declared standards/provenance for the coverage model. */
export const CASE18_COVERAGE_STANDARDS = {
    model: {
        source: 'Coverage marks a criterion as COVERED when at least one test case cites it in its coverage array, or its content keywords appear in the test title/steps/expected result.',
        standard: 'Project Kaleidoscope (arXiv:2607.14673) + ISTQB CTFL',
    },
    dimensions: [
        {
            source: 'Acceptance criteria traceability to test cases',
            standard: 'ISTQB CTFL',
        },
        {
            source: 'Step concreteness and precondition specificity scoring',
            standard: 'ISO/IEC 29119-4',
        },
        {
            source: 'Boundary Value Analysis and Equivalence Partitioning techniques',
            standard: 'ISTQB CTFL',
        },
        {
            source: 'Evidence-grounded generation reporting',
            standard: 'Kaleidoscope (arXiv:2607.14673)',
        },
        {
            source: 'Grade bands for overall quality classification',
            standard: 'ISO/IEC 25010:2023',
        },
        {
            source: 'LLM-as-judge semantic rubric justification (Layer 3)',
            standard: 'G-Eval (Liu et al., EMNLP 2023)',
        },
        {
            source: 'Test case minimality / absence of redundancy',
            standard: 'SLR Test Case Quality (Barraood et al. 2021)',
        },
    ],
} as const;

export interface CoverageRow {
    criterionId: string;
    criterionText: string;
    status: 'COVERED' | 'NOT_COVERED';
    coveredBy: string[];
}

export interface CoverageTable {
    generatedAt: string;
    promptVersion: string;
    criteriaCount: number;
    coveredCount: number;
    coverageRate: number;
    rows: CoverageRow[];
    standards: typeof CASE18_COVERAGE_STANDARDS;
}

/** Parse acceptance criteria text into a list of criterion lines. */
export function extractCriteria(criteria: string): Array<{ id: string; text: string }> {
    if (typeof criteria !== 'string') return [];
    const lines = criteria
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    return lines.map((line, idx) => ({ id: 'C' + (idx + 1), text: line }));
}

/** Determine whether a single criterion is covered by any test case. */
function isCriterionCovered(criterion: { text: string }, testCases: GeneratedTestCase[]): string[] {
    const coveredBy: string[] = [];
    for (const tc of testCases) {
        // 1. Explicit citation in coverage array.
        const cited = (tc.coverage ?? []).some(
            (cov) => cov.criterionText.trim().toLowerCase() === criterion.text.trim().toLowerCase(),
        );
        if (cited) {
            coveredBy.push(tc.title);
            continue;
        }
        // 2. Content-keyword match against title/steps/expected result.
        const allText = [tc.title, ...tc.steps, tc.expectedResult].join(' ').toLowerCase();
        const keywords = criterion.text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => w.length > 3);
        if (keywords.length === 0) continue;
        const matchCount = keywords.filter((k) => allText.includes(k)).length;
        if (matchCount >= Math.ceil(keywords.length * 0.5)) {
            coveredBy.push(tc.title);
        }
    }
    return [...new Set(coveredBy)];
}

export function buildCoverageTable(
    testCases: GeneratedTestCase[],
    acceptanceCriteria: string,
    promptVersion: string,
): CoverageTable {
    if (!Array.isArray(testCases)) {
        throw new Error('buildCoverageTable: testCases must be an array');
    }
    const criteria = extractCriteria(typeof acceptanceCriteria === 'string' ? acceptanceCriteria : '');
    const rows: CoverageRow[] = criteria.map((criterion) => {
        const coveredBy = isCriterionCovered(criterion, testCases);
        return {
            criterionId: criterion.id,
            criterionText: criterion.text,
            status: coveredBy.length > 0 ? 'COVERED' : 'NOT_COVERED',
            coveredBy,
        };
    });

    const criteriaCount = rows.length;
    const coveredCount = rows.filter((r) => r.status === 'COVERED').length;
    const coverageRate = criteriaCount === 0 ? 0 : Math.round((coveredCount / criteriaCount) * 100);

    return {
        generatedAt: new Date().toISOString(),
        promptVersion,
        criteriaCount,
        coveredCount,
        coverageRate,
        rows,
        standards: CASE18_COVERAGE_STANDARDS,
    };
}

/** Render coverage table as a JSON string (SSOT artifact). */
export function coverageTableToJson(table: CoverageTable): string {
    return JSON.stringify(table, null, 2);
}

/** Escape a string for safe inclusion in HTML output. */
function esc(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Render coverage table as an HTML document (visual artifact). */
export function coverageTableToHtml(table: CoverageTable): string {
    const rowHtml = table.rows
        .map((r) => {
            const statusClass = r.status === 'COVERED' ? 'covered' : 'not-covered';
            const coveredBy = r.coveredBy.length > 0 ? r.coveredBy.map(esc).join('; ') : '—';
            return `<tr class="${statusClass}">
  <td>${esc(r.criterionId)}</td>
  <td>${esc(r.criterionText)}</td>
  <td>${r.status}</td>
  <td>${coveredBy}</td>
</tr>`;
        })
        .join('\n');

    const standardsHtml = table.standards.dimensions
        .map((d) => `<li><strong>${esc(d.standard)}</strong> — ${esc(d.source)}</li>`)
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Case18 Coverage Table</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1000px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; }
  .covered td:first-child { color: #16a34a; font-weight: bold; }
  .not-covered td:first-child { color: #dc2626; font-weight: bold; }
  .summary { margin: 20px 0; padding: 12px 16px; background: #f9fafb; border-radius: 8px; }
  .standards { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .standards ul { list-style: none; padding: 0; }
  .standards li { padding: 4px 0; color: #4b5563; }
  .standards li::before { content: '•'; margin-right: 8px; color: #2563eb; }
  .footer { margin-top: 30px; color: #9ca3af; font-size: 12px; }
</style>
</head>
<body>
  <h1>Case18 Coverage Table</h1>
  <div class="summary">
    <strong>Coverage:</strong> ${table.coveredCount}/${table.criteriaCount} criteria covered (${table.coverageRate}%)
    — prompt version ${esc(table.promptVersion)} — generated ${esc(table.generatedAt)}
  </div>
  <table>
    <thead><tr><th>Criterion</th><th>Text</th><th>Status</th><th>Covered by</th></tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
  <div class="standards">
    <h3>Standards &amp; Provenance</h3>
    <p>${esc(table.standards.model.source)}</p>
    <ul>${standardsHtml}</ul>
  </div>
  <div class="footer">Case18 Quality Evaluator — Coverage Table</div>
</body>
</html>`;
}
