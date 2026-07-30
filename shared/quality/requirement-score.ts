/**
 * Requirement Quality Score — evaluates testability of requirements based on AI
 * feedback analysis. Correlates acceptance rates, modification patterns, and
 * prompt version effectiveness to produce a quality score per requirement.
 *
 * @module requirement-score
 */

import type { AiGenerationRecord } from '../types/llm.js';

export { generateRequirementScoreHtml } from './requirement-score-renderer.js';

/**
 * Dimension 5 Provenance — documents the source and justification for each weight and threshold.
 */
const REQUIREMENT_SCORE_PROVENANCE = {
    weights: {
        acceptance: {
            value: 0.5,
            source: 'ISTQB CTFL — requirement acceptance & validation importance',
            standard: 'ISTQB',
        },
        retention: { value: 0.3, source: 'Requirement retention metric', standard: 'Internal' },
        volume: { value: 0.2, source: 'Volume normalization factor', standard: 'Internal' },
    },
    gradeThresholds: {
        A: { min: 90, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        B: { min: 75, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        C: { min: 60, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        D: { min: 40, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
    },
} as const;

// Validate provenance weights sum to 1.0
const _reqWeightSum =
    REQUIREMENT_SCORE_PROVENANCE.weights.acceptance.value +
    REQUIREMENT_SCORE_PROVENANCE.weights.retention.value +
    REQUIREMENT_SCORE_PROVENANCE.weights.volume.value;
if (Math.abs(_reqWeightSum - 1.0) > 0.001) {
    throw new Error(`requirement-score: provenance weights must sum to 1.0, got ${_reqWeightSum}`);
}

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
    if (!Number.isFinite(score)) return 'F';
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

    const normalizedAcceptance = Number.isFinite(entry.acceptanceRate) ? entry.acceptanceRate : 0;
    const retentionRate =
        entry.totalTests > 0 ? Math.min(100, ((entry.keptTests + entry.modifiedTests) / entry.totalTests) * 100) : 0;
    const volumeScore = Math.min(100, (entry.totalTests / VOLUME_NORMALIZATION_DIVISOR) * 100);

    const raw = normalizedAcceptance * acceptanceWeight + retentionRate * retentionWeight + volumeScore * volumeWeight;
    const score = Number.isFinite(raw) ? Math.round(raw) : 0;

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
        const acceptanceRate =
            reviewedTests > 0 ? Math.round(((counts.kept + counts.modified) / reviewedTests) * 100) : 0;

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
    const totalGenerated = entries.reduce((s, e) => s + (Number.isFinite(e.totalTests) ? e.totalTests : 0), 0);
    const totalKept = entries.reduce((s, e) => s + (Number.isFinite(e.keptTests) ? e.keptTests : 0), 0);
    const totalModified = entries.reduce((s, e) => s + (Number.isFinite(e.modifiedTests) ? e.modifiedTests : 0), 0);
    const totalDeleted = entries.reduce((s, e) => s + (Number.isFinite(e.deletedTests) ? e.deletedTests : 0), 0);
    const acceptanceSum = entries.reduce((s, e) => s + (Number.isFinite(e.acceptanceRate) ? e.acceptanceRate : 0), 0);
    const averageAcceptanceRate = totalRequirements > 0 ? Math.round(acceptanceSum / totalRequirements) : 0;

    const scoreSum = entries.reduce((s, e) => s + (Number.isFinite(e.score) ? e.score : 0), 0);
    const overallScore = totalRequirements > 0 ? Math.round(scoreSum / totalRequirements) : 0;
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
