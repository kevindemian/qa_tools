/**
 * Heuristic analyzers for the LLM review pipeline.
 * Change frequency: threshold / pattern adjustments.
 */
import type { ArtifactType, ReviewResult } from './llm-review-types.js';
import Config from './config.js';
import { rootLogger } from './logger.js';

/** Portuguese hedging patterns — objective heuristic, not LLM. */
export const HEDGING_PATTERNS = [
    /\bparece\b/i,
    /\bpossivelmente\b/i,
    /\btalvez\b/i,
    /\bpode\s+ser\b/i,
    /\bnao\s+tenho\s+certeza\b/i,
    /\bacho\s+que\b/i,
    /\bprovavelmente\b/i,
    /\bsupostamente\b/i,
    /\bnão\s+sei\b/i,
    /\.\.\.\.\.\./i,
    /\bhmm\b/i,
];

/** Count hedging/hesitation markers in text. Returns 0-* score. */
export function detectHedging(text: string): number {
    let count = 0;
    for (const pattern of HEDGING_PATTERNS) {
        count += (pattern.exec(text) || []).length;
    }
    return count;
}

export const CONTRADICTION_MARKERS: Array<{ pos: RegExp; neg: RegExp }> = [
    { pos: /\b(certo|correto|ok|passa|válido)\b/i, neg: /\b(erro|falha|incorreto|falso|inválido)\b/i },
];

/** Count contradictory pairs (pos+neg) within the same paragraph. */
export function detectContradictions(text: string): number {
    const paragraphs = text.split('\n\n');
    let contradictions = 0;
    for (const para of paragraphs) {
        let hasPos = false;
        let hasNeg = false;
        for (const m of CONTRADICTION_MARKERS) {
            if (m.pos.test(para)) hasPos = true;
            if (m.neg.test(para)) hasNeg = true;
        }
        if (hasPos && hasNeg) contradictions++;
    }
    return contradictions;
}

/** Artifact risk classification for iMAD selective trigger. */
export const ARTIFACT_RISK: Record<ArtifactType, 'critical' | 'normal' | 'low'> = {
    'test-suite': 'critical',
    'bug-report': 'critical',
    analysis: 'normal',
    pipeline: 'normal',
    comparison: 'low',
};

/** Decision returned by the iMAD selective trigger. */
export interface ReviewDecision {
    skip: boolean;
    reason: string;
    maxDepth: number;
}

/**
 * iMAD-style selective trigger for adversarial review.
 * Uses objective heuristics (not LLM self-judgment) to decide
 * whether escalation to a 2nd LLM is warranted.
 */
export function shouldSkipAdversarialReview(
    result: ReviewResult,
    type: ArtifactType,
    sessionCost: number,
): ReviewDecision {
    const strategy = Config.get<string>('llmReviewStrategy');
    if (strategy === 'always') {
        return { skip: false, reason: 'strategy_always', maxDepth: 3 };
    }

    const budget = Config.get<number>('llmReviewBudget');

    // 1. Budget gate
    if (sessionCost > budget && budget > 0) {
        rootLogger.debug(
            'Adversarial review skipped: budget exceeded ($' + sessionCost.toFixed(4) + ' > $' + budget + ')',
        );
        return { skip: true, reason: 'budget_exceeded', maxDepth: 0 };
    }

    // 2. Risk-based gate
    const risk = Object.entries(ARTIFACT_RISK).find(([k]) => k === type)?.[1];
    if (risk === 'low' && result.confidence !== 'low') {
        return { skip: true, reason: 'low_risk_artifact', maxDepth: 0 };
    }

    // 3. iMAD heuristics: hedging language
    const hedgingScore = detectHedging(result.content);
    if (hedgingScore > 3 && result.confidence !== 'high') {
        return { skip: false, reason: 'hedging_detected', maxDepth: 3 };
    }

    // 4. Contradiction detection
    const contradictScore = detectContradictions(result.content);
    if (contradictScore > 0) {
        return { skip: false, reason: 'contradiction_detected', maxDepth: 3 };
    }

    // 5. Confidence gate
    if (result.confidence === 'high') {
        if (risk === 'critical') {
            return { skip: false, reason: 'critical_risk', maxDepth: 1 };
        }
        if (!result.reviewerNotes || result.reviewerNotes.length < 20) {
            return { skip: true, reason: 'high_confidence', maxDepth: 0 };
        }
    }

    // 6. Budget-constrained mode
    if (budget > 0 && sessionCost > budget * 0.7) {
        return { skip: false, reason: 'budget_constrained', maxDepth: 1 };
    }

    return { skip: false, reason: 'standard', maxDepth: 3 };
}

const VERDICT_PREFIX_RE = /^(AGREE|PARTIAL|DISAGREE)(?:[:\s-]|$)/i;

/** Parse AGREE/PARTIAL/DISAGREE verdict prefix into high/medium/low confidence. */
export function parseVerdict(response: string): 'high' | 'medium' | 'low' {
    const upper = response.toUpperCase().trim();
    if (/^AGREE(?:[:\s-]|$)/i.test(upper)) return 'high';
    if (/^PARTIAL(?:[:\s-]|$)/i.test(upper)) return 'medium';
    return 'low';
}

/** Strip the verdict prefix line(s) from a review response. */
export function stripVerdict(response: string): string {
    const lines = response.split('\n');
    return lines
        .map((l) => {
            const match = VERDICT_PREFIX_RE.exec(l);
            if (match) return l.slice(match[0].length).trim();
            return l;
        })
        .join('\n')
        .trim();
}

/** Convert layer error string array into structured layer pass/fail object. */
export function parseLayerErrors(errors: string[]): {
    layer1Passed: boolean;
    layer2Passed: boolean;
    layer3Passed: boolean;
} {
    return {
        layer1Passed: !errors.some((e) => e.startsWith('Layer1:')),
        layer2Passed: !errors.some((e) => e.startsWith('Layer2:')),
        layer3Passed: !errors.some((e) => e.startsWith('Layer3:')),
    };
}
