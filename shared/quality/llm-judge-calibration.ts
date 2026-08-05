/**
 * LLM-judge calibration — Cohen's kappa for inter-rater agreement.
 *
 * Pure function (no I/O), used by the reliability-gate of the LLM judge:
 * without a calibration set (or with κ ≤ 0.60) the judge returns an explicit
 * null instead of a score (Rule 25 — no silent production of unvalidated output).
 *
 * Guard clauses per Rule 24: NaN/Infinity and length mismatches fail explicitly.
 */

/** Square contingency table counts for two raters over the same items. */
export interface KappaConfusion {
    /** Agreement count where both raters selected the same label. */
    agreement: number;
    /** Count of ratings that disagreed (total items - agreement). */
    disagreement: number;
    /** Total number of rated items. */
    total: number;
}

export interface CohenKappaResult {
    kappa: number;
    po: number;
    pe: number;
}

/**
 * Compute Cohen's kappa from observed and expected agreement probabilities.
 *
 * po = observed agreement, pe = expected agreement by chance.
 * κ = (po − pe) / (1 − pe).
 *
 * Guards:
 * - pe === 1 (all raters agree on everything) → undefined → explicit throw (Rule 24).
 * - po/pe outside [0,1] or NaN → throw.
 * - Kappa is NOT computed from raw labels here; callers pass observed/expected
 *   agreement proportions derived from their label pairs. A label-based helper
 *   `cohenKappaFromLabels` computes those proportions from raw pairs.
 */
export function cohenKappa(po: number, pe: number): CohenKappaResult {
    if (!Number.isFinite(po) || !Number.isFinite(pe)) {
        throw new Error('cohenKappa: po and pe must be finite numbers');
    }
    if (po < 0 || po > 1 || pe < 0 || pe > 1) {
        throw new Error('cohenKappa: po and pe must be within [0,1]');
    }
    if (pe >= 1) {
        throw new Error('cohenKappa: pe must be < 1 (expected agreement by chance)');
    }
    const kappa = po === 1 && pe === 0 ? 1 : (po - pe) / (1 - pe);
    return { kappa, po, pe };
}

/**
 * Cohen's kappa from raw label pairs.
 *
 * @param raterA labels from rater A (one per item)
 * @param raterB labels from rater B (same length)
 * @returns kappa result, or null when there is no variance to measure
 *          (all items share a single label → agreement is undefined).
 */
export function cohenKappaFromLabels(raterA: string[], raterB: string[]): CohenKappaResult | null {
    if (!Array.isArray(raterA) || !Array.isArray(raterB)) {
        throw new Error('cohenKappaFromLabels: both raters must be arrays');
    }
    if (raterA.length !== raterB.length || raterA.length === 0) {
        throw new Error('cohenKappaFromLabels: raters must be non-empty and same length');
    }
    const labels = [...new Set([...raterA, ...raterB])];
    if (labels.length === 0 || labels.length === 1) {
        return null;
    }
    const total = raterA.length;
    let agreement = 0;
    const countsA = new Map<string, number>();
    const countsB = new Map<string, number>();
    for (let i = 0; i < total; i++) {
        const a = raterA[i];
        const b = raterB[i];
        if (a === undefined || b === undefined) {
            throw new Error('cohenKappaFromLabels: rater labels must be non-empty strings');
        }
        if (a === b) agreement++;
        countsA.set(a, (countsA.get(a) ?? 0) + 1);
        countsB.set(b, (countsB.get(b) ?? 0) + 1);
    }
    const po = agreement / total;
    let pe = 0;
    for (const label of labels) {
        const pa = (countsA.get(label) ?? 0) / total;
        const pb = (countsB.get(label) ?? 0) / total;
        pe += pa * pb;
    }
    return cohenKappa(po, pe);
}
