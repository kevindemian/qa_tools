/**
 * Requirement Quality Score — HTML renderer.
 *
 * Extracted from requirement-score.ts (compute) to separate concerns.
 * This module handles ONLY HTML generation; all business logic remains in requirement-score.ts.
 *
 * @module requirement-score-renderer
 */

import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import {
    MetricCard,
    MetricGrid,
    DataTable,
    Section,
    EmptyState,
    RecommendedActions,
    Badge,
} from '../primitives/index.js';
import type { TableColumn, TableRow } from '../primitives/index.js';
import { rootLogger } from '../logger.js';
import type { RequirementScoreResult } from './requirement-score.js';
import { icon } from '../icons.js';

const OVERALL_SCORE_ERROR = 40;
const OVERALL_SCORE_WARN = 75;
const ACCEPTANCE_RATE_WARN = 50;
const ACCEPTANCE_RATE_INFO = 70;
const LOW_SCORE_ENTRIES_ERROR = 40;
const DELETION_RATE_WARN = 0.3;

function buildRecommendedActions(result: RequirementScoreResult): string {
    const actions: Array<{ severity: 'error' | 'warn' | 'info'; text: string }> = [];

    // Action 1: Low overall score
    if (result.overallScore < OVERALL_SCORE_ERROR) {
        actions.push({
            severity: 'error',
            text: `Overall requirement quality score is ${result.overallScore} (grade ${result.overallGrade}). Immediate action required to improve testability.`,
        });
    }

    // Action 2: Low acceptance rate
    if (result.averageAcceptanceRate < ACCEPTANCE_RATE_WARN) {
        actions.push({
            severity: 'warn',
            text: `Average acceptance rate is ${result.averageAcceptanceRate}%. Review test generation quality and requirement clarity.`,
        });
    }

    // Action 3: Low score entries with names
    const lowScoreEntries = result.entries.filter((e) => e.score < LOW_SCORE_ENTRIES_ERROR);
    if (lowScoreEntries.length > 0) {
        const reqNames = lowScoreEntries
            .slice(0, 3)
            .map((e) => sanitizeHtml(e.requirementId))
            .join(', ');
        const moreText = lowScoreEntries.length > 3 ? ` and ${lowScoreEntries.length - 3} more` : '';
        actions.push({
            severity: 'warn',
            text: `${lowScoreEntries.length} requirement(s) have scores below ${LOW_SCORE_ENTRIES_ERROR}: ${reqNames}${moreText}. Prioritize improvements.`,
        });
    }

    // Action 4: High deletion rate
    if (result.totalDeleted > result.totalGenerated * DELETION_RATE_WARN) {
        actions.push({
            severity: 'warn',
            text: `${result.totalDeleted} tests were deleted (${((result.totalDeleted / result.totalGenerated) * 100).toFixed(0)}% of generated). Review deletion reasons to identify systematic issues.`,
        });
    }

    if (actions.length === 0) {
        actions.push({
            severity: 'info',
            text: 'Requirement quality scores are within acceptable ranges. Continue monitoring.',
        });
    }

    return Section({
        dataSection: 'actions',
        title: 'Recommended Actions',
        children: RecommendedActions({ actions }),
    });
}

export function generateRequirementScoreHtml(
    result: RequirementScoreResult | null | undefined,
    title?: string,
): string {
    try {
        if (!result) {
            rootLogger.error(
                'Requirement score result is null or undefined. Ensure a valid RequirementScoreResult object is passed to generateRequirementScoreHtml.',
            );
            return buildErrorPage('Error generating report', 'Requirement Score Report Error');
        }

        const pageTitle = title || 'Requirement Quality Score';

        // Calculate test lifecycle metrics
        const keptRate = result.totalGenerated > 0 ? Math.round((result.totalKept / result.totalGenerated) * 100) : 0;
        const modifiedRate =
            result.totalGenerated > 0 ? Math.round((result.totalModified / result.totalGenerated) * 100) : 0;
        const deletedRate =
            result.totalGenerated > 0 ? Math.round((result.totalDeleted / result.totalGenerated) * 100) : 0;

        let bodyContent =
            `<div data-dashboard="requirement-score">` +
            `<h1>${sanitizeHtml(pageTitle)}</h1>` +
            `<div data-part="timestamp">${sanitizeHtml(new Date().toISOString())}</div>` +
            Section({
                dataSection: 'summary',
                title: 'Summary',
                children: MetricGrid({
                    children:
                        MetricCard({
                            label: 'Requirements',
                            value: String(result.totalRequirements),
                            severity: result.totalRequirements > 0 ? 'info' : 'default',
                        }) +
                        MetricCard({
                            label: 'Overall Score',
                            value: result.overallGrade,
                            severity: (() => {
                                if (result.overallScore >= OVERALL_SCORE_WARN) return 'info';
                                if (result.overallScore >= OVERALL_SCORE_ERROR) return 'warn';
                                return 'error';
                            })(),
                            target: `target: >=${OVERALL_SCORE_WARN}`,
                        }) +
                        MetricCard({
                            label: 'Acceptance Rate',
                            value: result.averageAcceptanceRate + '%',
                            severity: (() => {
                                if (result.averageAcceptanceRate >= ACCEPTANCE_RATE_INFO) return 'info';
                                if (result.averageAcceptanceRate >= ACCEPTANCE_RATE_WARN) return 'warn';
                                return 'error';
                            })(),
                            target: `target: >=${ACCEPTANCE_RATE_INFO}%`,
                        }) +
                        MetricCard({
                            label: 'Kept/Modified/Deleted',
                            value: `${keptRate}%/${modifiedRate}%/${deletedRate}%`,
                        }) +
                        MetricCard({
                            label: 'Generated Tests',
                            value: String(result.totalGenerated),
                        }),
                }),
            });

        if (result.entries.length === 0) {
            bodyContent += EmptyState({
                title: 'No requirement data available',
                description: 'No requirement quality data is available for analysis.',
                action: 'Run AI test generation to generate requirement data.',
                icon: icon('clipboard', 16),
            });
        } else {
            // Sort by score (lowest first) for prioritization
            const sorted = [...result.entries].sort((a, b) => a.score - b.score);

            const columns: TableColumn[] = [
                { key: 'requirement', label: 'Requirement', width: '25%' },
                { key: 'score', label: 'Score', align: 'right' },
                { key: 'grade', label: 'Grade' },
                { key: 'acceptance', label: 'Acceptance', align: 'right' },
                { key: 'generated', label: 'Generated', align: 'right' },
                { key: 'kept', label: 'Kept', align: 'right' },
                { key: 'modified', label: 'Modified', align: 'right' },
                { key: 'deleted', label: 'Deleted', align: 'right' },
            ];

            const rows: TableRow[] = sorted.map((e, i) => ({
                key: String(i),
                cells: {
                    requirement: sanitizeHtml(e.userStory || e.requirementId),
                    score: String(e.score),
                    grade: Badge({
                        variant: (() => {
                            if (e.scoreGrade === 'A' || e.scoreGrade === 'B') return 'pass';
                            if (e.scoreGrade === 'C') return 'warn';
                            return 'fail';
                        })(),
                        children: e.scoreGrade,
                    }),
                    acceptance: e.acceptanceRate + '%',
                    generated: String(e.totalTests),
                    kept: String(e.keptTests),
                    modified: String(e.modifiedTests),
                    deleted: String(e.deletedTests),
                },
            }));

            bodyContent += Section({
                dataSection: 'score-breakdown',
                title: 'Score Breakdown',
                children: DataTable({
                    columns,
                    rows,
                    caption: 'Requirement quality scores — sorted by score (lowest first)',
                }),
            });
        }

        bodyContent += buildRecommendedActions(result) + `</div>`;

        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Requirement Quality Score',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate requirement score HTML: ' +
                msg +
                '. Verify that requirement data and html-factory module are working correctly.',
        );
        return buildErrorPage('Error generating report', 'Requirement Score Report Error');
    }
}
