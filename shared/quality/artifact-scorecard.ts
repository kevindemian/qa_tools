/**
 * Artifact scorecard — computes the AQS (Artifact Quality Score) for every
 * artifact and applies the quality gate (I-9.5: AQS < 60 → removable).
 *
 * Consumption model: `computeArtifactScorecard(specs, outputs)` where `outputs`
 * maps specId → rendered output. Missing outputs fail explicitly (Rule 24/25).
 *
 * Pure function — no I/O, deterministic, sorted to input order.
 */
import type { ArtifactSpec } from '../types/artifact-specs.js';
import { computeArtifactQualityScore, type ArtifactQualityScore } from './artifact-quality-gate.js';

export interface ScorecardArtifact {
    specId: string;
    score: number;
    overall: 'pass' | 'warn' | 'fail';
    checks: ArtifactQualityScore['checks'];
    missingSections: string[];
}

export interface ArtifactScorecard {
    artifacts: ScorecardArtifact[];
    total: number;
    passed: number;
    failed: number;
    /** specIds with AQS < 60 — candidates for removal. */
    removable: string[];
}

/** Default quality threshold — artifacts below this are removable. */
const REMOVAL_THRESHOLD = 60;

export function computeArtifactScorecard(specs: ArtifactSpec[], outputs: Record<string, string>): ArtifactScorecard {
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

    const passed = artifacts.filter((a) => a.overall === 'pass').length;
    const failed = artifacts.filter((a) => a.overall === 'fail').length;
    const removable = artifacts.filter((a) => a.score < REMOVAL_THRESHOLD).map((a) => a.specId);

    return { artifacts, total: artifacts.length, passed, failed, removable };
}
