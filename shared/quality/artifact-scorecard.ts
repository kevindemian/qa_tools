/**
 * Artifact scorecard — computes the AQS (Artifact Quality Score) for every
 * artifact and applies the quality gate (I-9.5: AQS < 60 → removable).
 *
 * Consumption model: `computeArtifactScorecard(specs, outputs)` where `outputs`
 * maps specId → rendered output. Missing outputs fail explicitly (Rule 24/25).
 *
 * Non-renderable specs (orchestrators, git-trigger artifacts with their own
 * gate) can be EXPLICITLY registered via `unscored` — they appear in the
 * scorecard with a documented status and are excluded from `removable`.
 * No fabricated score is produced for them (Rule 25: no silent default).
 *
 * Pure function — no I/O, deterministic, sorted to input order.
 */
import type { ArtifactSpec } from '../types/artifact-specs.js';
import { computeArtifactQualityScore, type ArtifactQualityScore } from './artifact-quality-gate.js';

export type UnscoredStatus = 'gate-proprio' | 'nao-aplicavel';

export interface ScorecardArtifact {
    specId: string;
    score: number;
    overall: 'pass' | 'warn' | 'fail';
    checks: ArtifactQualityScore['checks'];
    missingSections: string[];
}

export interface ScorecardUnscored {
    specId: string;
    status: UnscoredStatus;
    note: string;
}

export interface ArtifactScorecard {
    artifacts: ScorecardArtifact[];
    /** Non-renderable specs explicitly registered (no fabricated score). */
    unscored: ScorecardUnscored[];
    total: number;
    passed: number;
    failed: number;
    /** specIds with AQS < 60 — candidates for removal. */
    removable: string[];
}

/** Default quality threshold — artifacts below this are removable. */
const REMOVAL_THRESHOLD = 60;

export interface ScorecardOptions {
    /** Non-renderable specs to register explicitly (excluded from removal). */
    unscored?: Array<{ specId: string; status: UnscoredStatus; note: string }>;
}

export function computeArtifactScorecard(
    specs: ArtifactSpec[],
    outputs: Record<string, string>,
    options?: ScorecardOptions,
): ArtifactScorecard {
    const artifacts: ScorecardArtifact[] = [];

    for (const spec of specs) {
        const output = outputs[spec.id];
        const qualified = computeArtifactQualityScore(spec, typeof output === 'string' ? output : '');
        artifacts.push({
            specId: spec.id,
            score: qualified.score,
            overall: qualified.overall,
            checks: qualified.checks,
            missingSections: qualified.missingSections,
        });
    }

    const unscored = options?.unscored ?? [];

    const passed = artifacts.filter((a) => a.overall === 'pass').length;
    const failed = artifacts.filter((a) => a.overall === 'fail').length;
    const removable = artifacts.filter((a) => a.score < REMOVAL_THRESHOLD).map((a) => a.specId);

    return { artifacts, unscored, total: artifacts.length, passed, failed, removable };
}
