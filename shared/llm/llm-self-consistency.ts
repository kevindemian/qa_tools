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

import { formatErr } from '../errors.js';
import { llmPrompt, type LlmPromptOptions } from './llm-client.js';
import { ArtifactValidator, type ValidationContext } from '../validation/artifact-validator.js';
import { rootLogger } from '../logger.js';

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
    if (typeof obj === 'string') return `s:${obj.slice(0, 80)}:len=${obj.length}`;
    if (typeof obj === 'number') return `n:${obj}`;
    if (typeof obj === 'boolean') return `b:${obj}`;
    if (Array.isArray(obj)) {
        return `a:[${obj.map(structuralHash).join(',')}]`;
    }
    if (typeof obj === 'object') {
        const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
        const entries = Object.entries(obj);
        return `o:{${keys
            .map((k) => {
                const entry = entries.find(([ek]) => ek === k);
                return `${k}:${structuralHash(entry ? entry[1] : undefined)}`;
            })
            .join(',')}}`;
    }
    if (typeof obj === 'bigint') return `big:${obj}`;
    if (typeof obj === 'symbol') return `sym:${obj.description ?? ''}`;
    if (typeof obj === 'function') return `fn:${obj.name}`;
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
    const cols = a.length + 1;
    const cell = (i: number, j: number) => `${i},${j}`;
    const matrix = new Map<string, number>();
    for (let i = 0; i <= b.length; i++) {
        matrix.set(cell(i, 0), i);
    }
    for (let j = 0; j <= cols; j++) {
        matrix.set(cell(0, j), j);
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= cols; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix.set(
                cell(i, j),
                Math.min(
                    (matrix.get(cell(i - 1, j)) ?? 0) + 1,
                    (matrix.get(cell(i, j - 1)) ?? 0) + 1,
                    (matrix.get(cell(i - 1, j - 1)) ?? 0) + cost,
                ),
            );
        }
    }
    return matrix.get(cell(b.length, a.length)) ?? 0;
}

/**
 * Run n parallel LLM calls, validate results, return valid candidates and errors.
 */
async function collectCandidates<T>(
    opts: LlmPromptOptions,
    validator: ArtifactValidator<T>,
    context: ValidationContext,
    n: number,
): Promise<{ candidates: T[]; errors: string[]; results: PromiseSettledResult<unknown>[] }> {
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

    return { candidates, errors, results };
}

/**
 * Find first fulfilled result as fallback when no candidates pass validation.
 */
function findFallbackCandidate<T>(results: PromiseSettledResult<unknown>[]): T | undefined {
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
            return result.value as T;
        }
    }
    return undefined;
}

/**
 * Compute voting result from candidates: hashes, votes, and winner selection.
 */
function computeVotingResult<T>(candidates: T[]): {
    hashesMap: Map<number, string>;
    voteCounts: Map<string, number[]>;
    winner: T;
    votesMap: Map<number, number>;
} {
    const hashesMap = new Map<number, string>();
    const voteCounts = new Map<string, number[]>();

    for (const [i, c] of candidates.entries()) {
        const h = structuralHash(c);
        hashesMap.set(i, h);
        const existing = voteCounts.get(h);
        if (existing) {
            existing.push(i);
        } else {
            voteCounts.set(h, [i]);
        }
    }

    const sorted = Array.from(voteCounts.entries()).sort((a, b) => b[1].length - a[1].length);
    const winnerHash = sorted[0]?.[0] ?? '';
    const winnerIndex = voteCounts.get(winnerHash)?.[0] ?? 0;
    const winner = new Map(candidates.entries()).get(winnerIndex) as T;

    const votesMap = new Map<number, number>();
    for (const [i] of hashesMap.entries()) {
        const h = hashesMap.get(i);
        votesMap.set(i, h !== undefined ? (voteCounts.get(h)?.length ?? 1) : 1);
    }

    return { hashesMap, voteCounts, winner, votesMap };
}

/**
 * Compute divergence level based on pairwise structural similarity.
 */
function computeDivergence<T>(candidates: T[]): 'none' | 'low' | 'high' {
    const similarityPairs: number[] = [];
    for (const [i, ci] of candidates.entries()) {
        for (const [j, cj] of candidates.entries()) {
            if (j > i && ci !== undefined && cj !== undefined) {
                similarityPairs.push(structuralSimilarity(ci, cj));
            }
        }
    }

    const avgSimilarity =
        similarityPairs.length > 0 ? similarityPairs.reduce((a, b) => a + b, 0) / similarityPairs.length : 1;

    if (avgSimilarity < 0.4) return 'high';
    if (avgSimilarity < SIMILARITY_THRESHOLD) return 'low';
    return 'none';
}

/**
 * Attempt refinement when divergence is high. Returns refined result or null.
 */
async function attemptRefinement<T>(
    opts: LlmPromptOptions,
    validator: ArtifactValidator<T>,
    context: ValidationContext,
    preliminary: ConsistencyResult<T>,
): Promise<ConsistencyResult<T> | null> {
    rootLogger.info('Self-consistency: high divergence detected — attempting refinement');
    const refined = await refineWithConsistency(opts, validator, context, preliminary);
    if (refined.refined) {
        const validationResult = validator.validate(refined.winner, context);
        if (validationResult.allPassed) {
            return refined;
        }
        rootLogger.warn('Self-consistency: refinement produced invalid result — using preliminary winner');
        return null;
    }
    rootLogger.warn('Self-consistency: refinement failed — using preliminary winner');
    return null;
}

/**
 * Generate n candidate responses and select by majority structural vote.
 * If divergence is high, automatically refines with a consistency instruction.
 */
export async function consensusGenerate<T>(
    opts: LlmPromptOptions,
    validator: ArtifactValidator<T>,
    context: ValidationContext,
    n = 3,
): Promise<ConsistencyResult<T>> {
    const { candidates, errors, results } = await collectCandidates(opts, validator, context, n);

    if (candidates.length === 0) {
        rootLogger.warn(
            `Self-consistency: all ${n} candidates failed validation. Returning first candidate despite errors.`,
        );
        const fallback = findFallbackCandidate<T>(results);
        if (!fallback) {
            throw new Error(
                `Self-consistency: all ${n} candidates failed and no fallback available. Errors: ${errors.join('; ')}`,
            );
        }
        return {
            winner: fallback,
            candidates,
            votes: { 0: 1 },
            divergence: 'high',
            refined: false,
        };
    }

    const { winner, votesMap } = computeVotingResult(candidates);
    const divergence = computeDivergence(candidates);

    const preliminary: ConsistencyResult<T> = {
        winner,
        candidates,
        votes: Object.fromEntries(votesMap),
        divergence,
        refined: false,
    };

    if (divergence === 'high') {
        const refined = await attemptRefinement(opts, validator, context, preliminary);
        if (refined) return refined;
    }

    return preliminary;
}

/**
 * Refine a result by running self-consistency with a consistency-focused instruction.
 * Useful when initial consensus has high divergence.
 */
export async function refineWithConsistency<T>(
    opts: LlmPromptOptions,
    validator: ArtifactValidator<T>,
    context: ValidationContext,
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
        const validationResult = validator.validate(singleResult as T, context);
        if (!validationResult.allPassed) {
            rootLogger.warn('Consistency refinement: result failed validation — falling back to previous winner');
            return previousResult;
        }
        return {
            winner: singleResult as T,
            candidates: [singleResult as T],
            votes: { 0: 1 },
            divergence: previousResult.divergence,
            refined: true,
        };
    } catch (err) {
        rootLogger.warn('Consistency refinement failed, returning previous winner: ' + formatErr(err));
        return previousResult;
    }
}
