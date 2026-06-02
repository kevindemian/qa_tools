/**
 * Self-consistency module — runs n parallel LLM calls and selects
 * the majority-consensus output for critical artifacts.
 *
 * Implements the self-consistency strategy from ConVerTest (2026):
 * - n=3 parallel calls at temperature=0.3
 * - Structural comparison (not lexical) of outputs
 * - Majority voting on schema-validated results
 * - Refinement on divergence > threshold
 */

import { llmPrompt, type LlmPromptOptions } from './llm-client';
import { ArtifactValidator, type ValidationContext } from './artifact-validator';
import { rootLogger } from './logger';

export type ArtifactType = 'test-suite' | 'analysis' | 'bug-report' | 'comparison' | 'pipeline';

export interface ConsistencyResult<T> {
    winner: T;
    candidates: T[];
    votes: Record<number, number>;
    divergence: 'none' | 'low' | 'high';
    refined: boolean;
}

const SIMILARITY_THRESHOLD = 0.7;

/** Simple structural hash of an object: checks field names, types, array lengths. */
function structuralHash(obj: unknown): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'string') return `s:${obj.slice(0, 20)}`;
    if (typeof obj === 'number') return `n:${obj}`;
    if (typeof obj === 'boolean') return `b:${obj}`;
    if (Array.isArray(obj)) {
        return `a:[${obj.map(structuralHash).join(',')}]`;
    }
    if (typeof obj === 'object') {
        const keys = Object.keys(obj).sort();
        return `o:{${keys.map((k) => `${k}:${structuralHash((obj as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    if (typeof obj === 'bigint') return `big:${obj}`;
    if (typeof obj === 'symbol') return `sym:${obj.description ?? ''}`;
    if (typeof obj === 'function') return `fn:${obj.name ?? 'anonymous'}`;
    return 'unknown';
}

/** Compute structural similarity ratio between two artifacts (0-1). */
function structuralSimilarity(a: unknown, b: unknown): number {
    const hashA = structuralHash(a);
    const hashB = structuralHash(b);
    if (hashA === hashB) return 1;
    const maxLen = Math.max(hashA.length, hashB.length);
    if (maxLen === 0) return 1;
    const edits = levenshtein(hashA, hashB);
    return (maxLen - edits) / maxLen;
}

function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        const row0 = matrix[0] as number[];
        row0[j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            const row = matrix[i] as number[];
            const rowPrev = matrix[i - 1] as number[];
            row[j] = Math.min(
                (rowPrev[j] as number) + 1,
                (row[j - 1] as number) + 1,
                (rowPrev[j - 1] as number) + cost,
            );
        }
    }
    const lastRow = matrix[b.length] as number[];
    return lastRow[a.length] as number;
}

/**
 * Generate n candidate responses and select by majority structural vote.
 * If divergence is high, optionally refine with consistency instruction.
 */
export async function consensusGenerate<T>(
    opts: LlmPromptOptions,
    validator: ArtifactValidator<T>,
    context: ValidationContext,
    n = 3,
): Promise<ConsistencyResult<T>> {
    const candidates: T[] = [];
    const errors: string[] = [];

    const parallelOptions = Array.from({ length: n }, (_, i) => ({
        ...opts,
        user: `${opts.user}\n\n[Generation ${i + 1} of ${n} — produce an independent version]`,
    }));

    const results = await Promise.allSettled(parallelOptions.map((po) => llmPrompt(po) as Promise<unknown>));

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
            const validationResult = validator.validate(result.value as T, context);
            if (validationResult.allPassed) {
                candidates.push(result.value as T);
            } else {
                const failedIds = validationResult.results
                    .filter((r) => !r.passed && r.severity === 'error')
                    .map((r) => r.invariantId);
                errors.push(`Candidate failed invariants: [${failedIds.join(',')}]`);
            }
        } else if (result.status === 'rejected') {
            errors.push(`Candidate rejected: ${result.reason}`);
        }
    }

    if (candidates.length === 0) {
        rootLogger.warn(
            `Self-consistency: all ${n} candidates failed validation. Returning first candidate despite errors.`,
        );
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value !== null) {
                candidates.push(result.value as T);
                break;
            }
        }
        if (candidates.length === 0) {
            throw new Error(
                `Self-consistency: all ${n} candidates failed and no fallback available. Errors: ${errors.join('; ')}`,
            );
        }
        return {
            winner: candidates[0] as T,
            candidates,
            votes: { 0: 1 },
            divergence: 'high',
            refined: false,
        };
    }

    const hashes = candidates.map((c) => structuralHash(c));
    const voteCounts: Record<string, number[]> = {};
    for (let i = 0; i < hashes.length; i++) {
        const h = hashes[i] as string;
        if (!voteCounts[h]) voteCounts[h] = [];
        voteCounts[h].push(i);
    }

    const sorted = Object.entries(voteCounts).sort((a, b) => b[1].length - a[1].length);
    const winnerHash = (sorted[0] as [string, number[]])[0];
    const winnerIndex = (voteCounts[winnerHash] as number[])[0] as number;
    const winner = candidates[winnerIndex] as T;

    const similarityPairs: number[] = [];
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            similarityPairs.push(structuralSimilarity(candidates[i], candidates[j]));
        }
    }
    const avgSimilarity =
        similarityPairs.length > 0 ? similarityPairs.reduce((a, b) => a + b, 0) / similarityPairs.length : 1;

    let divergence: 'none' | 'low' | 'high' = 'none';
    if (avgSimilarity < 0.4) {
        divergence = 'high';
    } else if (avgSimilarity < SIMILARITY_THRESHOLD) {
        divergence = 'low';
    }

    const votes: Record<number, number> = {};
    for (let i = 0; i < candidates.length; i++) {
        votes[i] = voteCounts[hashes[i] as string]?.length ?? 1;
    }

    return {
        winner,
        candidates,
        votes,
        divergence,
        refined: false,
    };
}

/**
 * Refine a result by running self-consistency with a consistency-focused instruction.
 * Useful when initial consensus has high divergence.
 */
export async function refineWithConsistency<T>(
    opts: LlmPromptOptions,
    _validator: ArtifactValidator<T>,
    _context: ValidationContext,
    previousResult: ConsistencyResult<T>,
): Promise<ConsistencyResult<T>> {
    const refinementPrompt = [
        'Previous generation had high divergence between candidates.',
        'Produce a SINGLE converged version that is consistent across all perspectives.',
        'Review the disagreements and resolve them using the original requirements.',
        'Output only the final converged artifact.',
        '',
        'Original system instructions:',
        opts.system,
    ].join('\n');

    const refinedOpts: LlmPromptOptions = {
        ...opts,
        system: refinementPrompt,
    };

    try {
        const singleResult = await llmPrompt(refinedOpts);
        const singletons = [singleResult as T];
        return {
            winner: singletons[0] as T,
            candidates: singletons,
            votes: { 0: 1 },
            divergence: previousResult.divergence,
            refined: true,
        };
    } catch (err) {
        rootLogger.warn('Consistency refinement failed, returning previous winner: ' + (err as Error).message);
        return previousResult;
    }
}
