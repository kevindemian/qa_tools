/**
 * Compute: Failure Reasons.
 *
 * Extracts and aggregates failure reasons from CI job logs.
 * Moved from ci-data.ts:361-400.
 *
 * @reference DORA — understanding failure modes enables targeted improvement
 */
import type { FailureReason } from '../../types/data-hub.js';

/**
 * Maximum number of reasons extracted per job.
 */
const MAX_REASONS_PER_JOB = 5;

/**
 * Maximum length of a single reason string.
 */
const MAX_REASON_LENGTH = 100;

/**
 * Extract failure reasons from a CI job log text using pattern matching.
 *
 * @param logText - Raw log text from a CI job.
 * @returns Array of extracted reason strings (max 5).
 */
export function extractFailureReasons(logText: string): string[] {
    const patterns = [
        /Error[:\s]+(.{10,100})/gi,
        /Failure[:\s]+(.{10,100})/gi,
        /Timeout[:\s]+(.{10,100})/gi,
        /Exception[:\s]+(.{10,100})/gi,
        /FATAL[:\s]+(.{10,100})/gi,
        /OOMKilled/gi,
    ];

    const reasons: string[] = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(logText)) !== null) {
            const reason = match[0].slice(0, MAX_REASON_LENGTH);
            if (!reasons.includes(reason)) {
                reasons.push(reason);
            }
        }
    }
    return reasons.slice(0, MAX_REASONS_PER_JOB);
}

/**
 * Aggregate failure reasons from a Map of job reasons and return the top patterns.
 *
 * @param jobReasonsMap - Map from job ID to array of extracted reason strings.
 * @returns Top failure reasons sorted by count descending (max 10).
 */
export function calcTopFailureReasons(jobReasonsMap: Map<number, string[]>): FailureReason[] {
    const patternCounts = new Map<string, number>();

    for (const reasons of jobReasonsMap.values()) {
        for (const reason of reasons) {
            patternCounts.set(reason, (patternCounts.get(reason) ?? 0) + 1);
        }
    }

    const result: FailureReason[] = [];
    for (const [pattern, count] of patternCounts) {
        result.push({ pattern, count });
    }

    result.sort((a, b) => b.count - a.count);
    return result.slice(0, 10);
}
