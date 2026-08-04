/**
 * AQS — Artifact Quality Score (content compliance).
 *
 * Computes a 0-100 score measuring how well a rendered artifact output
 * complies with its ARTIFACT_SPEC (the single source of truth in
 * shared/types/artifact-specs.ts).
 *
 * Checks (each equally weighted, pass=1 / warn=0.5 / fail=0):
 * - every required metric name present in the output
 * - every required section name present in the output
 * - timestamp present when spec.timestamp is true
 * - data-dashboard attribute present
 * - sample-size warning present when spec.sampleSizeWarning is true
 *
 * Safeguards (Rule 24/25): empty/non-string output fails explicitly (never a
 * silent 0); the aggregate score is rounded explicitly and clamped to [0,100].
 *
 * Pure function — no I/O, no side effects, deterministic.
 */
import type { ArtifactSpec } from '../types/artifact-specs.js';

export type ComplianceStatus = 'pass' | 'warn' | 'fail';

export interface ArtifactComplianceCheck {
    name: string;
    status: ComplianceStatus;
    weight: number;
    details: string;
}

export interface ArtifactQualityScore {
    specId: string;
    /** 0-100 aggregate compliance score. */
    score: number;
    overall: ComplianceStatus;
    checks: ArtifactComplianceCheck[];
    /** Required sections absent from the output (EIXO C explicit). */
    missingSections: string[];
}

const SCORE = {
    pass: 1,
    warn: 0.5,
    fail: 0,
} as const;

/** Weighted average of equally-weighted checks, rounded to [0,100]. */
function aggregateScore(checks: ArtifactComplianceCheck[]): number {
    const checkCount = checks.length > 0 ? checks.length : 1;
    const total = checks.reduce((sum, c) => sum + SCORE[c.status] * c.weight, 0);
    const average = total / checkCount;
    return Math.round(average * 100);
}

/** Explicit empty-output guard (Rule 24/25) — never a silent 0. */
function emptyOutputCheck(): ArtifactComplianceCheck {
    return { name: 'output', status: 'fail', weight: 1, details: 'output vazio — nenhum artifact content presente' };
}

function metricCheck(metricName: string, htmlLower: string): ArtifactComplianceCheck {
    const present = htmlLower.includes(metricName.toLowerCase());
    return {
        name: 'Metric: ' + metricName,
        status: present ? 'pass' : 'fail',
        weight: 1,
        details: present ? 'métrica presente no output' : 'métrica ausente do output: "' + metricName + '"',
    };
}

function requiredSectionCheck(sectionName: string, htmlLower: string): ArtifactComplianceCheck {
    const present = htmlLower.includes(sectionName.toLowerCase());
    return {
        name: 'Section: ' + sectionName,
        status: present ? 'pass' : 'fail',
        weight: 1,
        details: present ? 'seção presente no output' : 'seção obrigatória ausente do output: "' + sectionName + '"',
    };
}

function structuralChecks(spec: ArtifactSpec, htmlLower: string): ArtifactComplianceCheck[] {
    const checks: ArtifactComplianceCheck[] = [];
    if (spec.timestamp === true) {
        const hasTimestamp = htmlLower.includes('data-part="timestamp"');
        checks.push({
            name: 'timestamp',
            status: hasTimestamp ? 'pass' : 'fail',
            weight: 1,
            details: hasTimestamp
                ? 'data-part="timestamp" presente'
                : 'spec.timestamp=true mas data-part="timestamp" ausente',
        });
    }
    if (spec.sampleSizeWarning === true) {
        const hasSample = htmlLower.includes('sample');
        checks.push({
            name: 'sample-size-warning',
            status: hasSample ? 'pass' : 'fail',
            weight: 1,
            details: hasSample ? 'aviso de sample presente' : 'spec.sampleSizeWarning=true mas aviso de sample ausente',
        });
    }
    const hasDashboard = /data-dashboard="[^"]+"/.test(htmlLower);
    checks.push({
        name: 'data-dashboard',
        status: hasDashboard ? 'pass' : 'fail',
        weight: 1,
        details: hasDashboard ? 'atributo data-dashboard presente' : 'atributo data-dashboard ausente',
    });
    return checks;
}

/**
 * Compute the content-compliance score for an artifact against its spec.
 * Returns a deterministic 0-100 score with per-check evidence.
 */
export function computeArtifactQualityScore(spec: ArtifactSpec, output: string): ArtifactQualityScore {
    if (typeof output !== 'string' || output.length === 0) {
        const failCheck = emptyOutputCheck();
        return {
            specId: spec.id,
            score: 0,
            overall: 'fail',
            checks: [failCheck],
            missingSections: spec.sections.filter((s) => s.required).map((s) => s.name),
        };
    }

    const htmlLower = output.toLowerCase();
    const checks: ArtifactComplianceCheck[] = [];
    const missingSections: string[] = [];

    for (const metric of spec.metrics) {
        checks.push(metricCheck(metric.name, htmlLower));
    }

    for (const section of spec.sections) {
        if (section.required !== true) continue;
        const present = htmlLower.includes(section.name.toLowerCase());
        checks.push(requiredSectionCheck(section.name, htmlLower));
        if (!present) missingSections.push(section.name);
    }

    checks.push(...structuralChecks(spec, htmlLower));

    const score = aggregateScore(checks);
    if (!Number.isFinite(score)) {
        return {
            specId: spec.id,
            score: 0,
            overall: 'fail',
            checks: [{ name: 'score', status: 'fail', weight: 1, details: 'score não-finito — computação inválida' }],
            missingSections,
        };
    }

    let overall: ComplianceStatus = 'fail';
    if (score >= 80) overall = 'pass';
    else if (score >= 60) overall = 'warn';

    return { specId: spec.id, score, overall, checks, missingSections };
}
