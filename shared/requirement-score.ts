/**
 * Requirement Quality Score — evaluates testability of requirements based on AI
 * feedback analysis. Correlates acceptance rates, modification patterns, and
 * prompt version effectiveness to produce a quality score per requirement.
 *
 * @module requirement-score
 */

import { sanitizeHtml } from './escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, DataTable } from './primitives/index.js';
import type { TableColumn, TableRow } from './primitives/index.js';
import { rootLogger } from './logger.js';
import type { AiGenerationRecord } from './types/llm.js';

export interface RequirementScoreEntry {
    requirementId: string;
    userStory: string;
    totalTests: number;
    keptTests: number;
    modifiedTests: number;
    deletedTests: number;
    acceptanceRate: number;
    score: number;
    scoreGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    promptVersion: string;
}

export interface RequirementScoreResult {
    entries: RequirementScoreEntry[];
    totalRequirements: number;
    overallScore: number;
    overallGrade: string;
    averageAcceptanceRate: number;
    totalGenerated: number;
    totalKept: number;
    totalModified: number;
    totalDeleted: number;
    timestamp: string;
}

const GRADE_A_THRESHOLD = 90;
const GRADE_B_THRESHOLD = 75;
const GRADE_C_THRESHOLD = 60;
const GRADE_D_THRESHOLD = 40;
const USER_STORY_TRUNCATE_LENGTH = 120;
const VOLUME_NORMALIZATION_DIVISOR = 10;

function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= GRADE_A_THRESHOLD) return 'A';
    if (score >= GRADE_B_THRESHOLD) return 'B';
    if (score >= GRADE_C_THRESHOLD) return 'C';
    if (score >= GRADE_D_THRESHOLD) return 'D';
    return 'F';
}

function computeEntryScore(entry: Omit<RequirementScoreEntry, 'score' | 'scoreGrade'>): RequirementScoreEntry {
    const acceptanceWeight = 0.5;
    const retentionWeight = 0.3;
    const volumeWeight = 0.2;

    const normalizedAcceptance = entry.acceptanceRate;
    const retentionRate =
        entry.totalTests > 0 ? Math.min(100, ((entry.keptTests + entry.modifiedTests) / entry.totalTests) * 100) : 0;
    const volumeScore = Math.min(100, (entry.totalTests / VOLUME_NORMALIZATION_DIVISOR) * 100);

    const score = Math.round(
        normalizedAcceptance * acceptanceWeight + retentionRate * retentionWeight + volumeScore * volumeWeight,
    );

    return {
        ...entry,
        score,
        scoreGrade: calculateGrade(score),
    };
}

function countFeedback(feedback?: AiGenerationRecord['feedback']): { kept: number; modified: number; deleted: number } {
    let kept = 0;
    let modified = 0;
    let deleted = 0;
    if (feedback) {
        for (const fb of feedback) {
            if (fb.action === 'kept') kept++;
            else if (fb.action === 'modified') modified++;
            else deleted++;
        }
    }
    return { kept, modified, deleted };
}

export function calculateRequirementScores(records: AiGenerationRecord[] | null | undefined): RequirementScoreResult {
    const timestamp = new Date().toISOString();

    if (!records || records.length === 0) {
        return {
            entries: [],
            totalRequirements: 0,
            overallScore: 0,
            overallGrade: 'F',
            averageAcceptanceRate: 0,
            totalGenerated: 0,
            totalKept: 0,
            totalModified: 0,
            totalDeleted: 0,
            timestamp,
        };
    }

    const entries: RequirementScoreEntry[] = [];

    for (const record of records) {
        const totalTests = record.generatedTests.length;
        const counts = countFeedback(record.feedback);
        const reviewedTests = counts.kept + counts.modified + counts.deleted;
        const acceptanceRate = reviewedTests > 0 ? Math.round(((counts.kept + counts.modified) / reviewedTests) * 100) : 0;

        entries.push(
            computeEntryScore({
                requirementId: record.id,
                userStory: record.userStory.slice(0, USER_STORY_TRUNCATE_LENGTH),
                totalTests,
                keptTests: counts.kept,
                modifiedTests: counts.modified,
                deletedTests: counts.deleted,
                acceptanceRate,
                promptVersion: record.promptVersion,
            }),
        );
    }

    entries.sort((a, b) => b.score - a.score);

    const totalRequirements = entries.length;
    const totalGenerated = entries.reduce((s, e) => s + e.totalTests, 0);
    const totalKept = entries.reduce((s, e) => s + e.keptTests, 0);
    const totalModified = entries.reduce((s, e) => s + e.modifiedTests, 0);
    const totalDeleted = entries.reduce((s, e) => s + e.deletedTests, 0);
    const averageAcceptanceRate =
        totalRequirements > 0 ? Math.round(entries.reduce((s, e) => s + e.acceptanceRate, 0) / totalRequirements) : 0;

    const overallScore =
        totalRequirements > 0 ? Math.round(entries.reduce((s, e) => s + e.score, 0) / totalRequirements) : 0;
    const overallGrade = calculateGrade(overallScore);

    return {
        entries,
        totalRequirements,
        overallScore,
        overallGrade,
        averageAcceptanceRate,
        totalGenerated,
        totalKept,
        totalModified,
        totalDeleted,
        timestamp,
    };
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

        const summaryCards = MetricGrid({
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
                        if (result.overallScore >= 75) return 'info';
                        if (result.overallScore >= 40) return 'warn';
                        return 'error';
                    })(),
                }) +
                MetricCard({
                    label: 'Acceptance Rate',
                    value: result.averageAcceptanceRate + '%',
                    severity: (() => {
                        if (result.averageAcceptanceRate >= 70) return 'info';
                        if (result.averageAcceptanceRate >= 40) return 'warn';
                        return 'error';
                    })(),
                }) +
                MetricCard({
                    label: 'Generated Tests',
                    value: String(result.totalGenerated),
                }),
        });

        const columns: TableColumn[] = [
            { key: 'requirement', label: 'Requirement', width: '30%' },
            { key: 'score', label: 'Score', align: 'right' },
            { key: 'grade', label: 'Grade' },
            { key: 'acceptance', label: 'Acceptance', align: 'right' },
            { key: 'generated', label: 'Generated', align: 'right' },
            { key: 'kept', label: 'Kept', align: 'right' },
            { key: 'modified', label: 'Modified', align: 'right' },
            { key: 'deleted', label: 'Deleted', align: 'right' },
        ];

        let tableHtml: string;
        if (result.entries.length === 0) {
            tableHtml = '<p style="color:var(--color-text-muted)">No requirement data available.</p>';
        } else {
            const rows: TableRow[] = result.entries.map((e, i) => ({
                key: String(i),
                cells: {
                    requirement: sanitizeHtml(e.userStory),
                    score: String(e.score),
                    grade: e.scoreGrade,
                    acceptance: e.acceptanceRate + '%',
                    generated: String(e.totalTests),
                    kept: String(e.keptTests),
                    modified: String(e.modifiedTests),
                    deleted: String(e.deletedTests),
                },
            }));

            tableHtml = DataTable({ columns, rows, caption: 'Requirement quality scores per requirement' });
        }

        const bodyContent =
            '<h1>' + sanitizeHtml(pageTitle) + '</h1>' + summaryCards + '<h2>Score Breakdown</h2>' + tableHtml;

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
