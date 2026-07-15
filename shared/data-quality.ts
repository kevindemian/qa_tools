/**
 * Data-quality awareness (EIXO C, C-3a–e).
 *
 * Features must be *aware* of the confidence / quality / provenance carried by
 * the unified DataHub model — never silently trusting data. This module is the
 * single primitive features call to surface that posture in their output
 * (report footers, gate notes, traceability annotations).
 *
 * It reads ONLY the typed accessor surface (get* / getQuality / getProvenance),
 * never hub.raw directly (AGENTS §6 DIP).
 */
import type { DataHub, DataSource } from './types/data-hub.js';
import type { QualityReport, QualityCategory } from './data-hub/quality.js';

export type DataQualityStatus = 'ok' | 'degraded' | 'missing';

export interface DataQualitySummary {
    /** ok: present categories all valid; degraded: some invalid; missing: no gated data. */
    status: DataQualityStatus;
    /** Lowest confidence across provenance sources (0–1), or null when none. */
    minConfidence: number | null;
    /** Per-category validity for categories that actually carry data. */
    categories: Partial<Record<QualityCategory, { valid: boolean; issues: string[] }>>;
    /** Human-readable notes to surface in reports. */
    notes: string[];
}

interface CategoryEvaluation {
    categories: DataQualitySummary['categories'];
    notes: string[];
    anyData: boolean;
    allValid: boolean;
}

const CATEGORY_ACCESSORS: Record<QualityCategory, (hub: DataHub) => unknown[]> = {
    failureRecords: (h) => h.getFailureRecords() ?? [],
    securityFindings: (h) => h.getSecurityFindings() ?? [],
    deployments: (h) => h.getDeployments() ?? [],
    releases: (h) => h.getReleases() ?? [],
    pmIssues: (h) => h.getPmIssues() ?? [],
    coverageFiles: (h) => h.getCoverageFiles() ?? [],
    doraMetrics: (h) => singleton(h.getDoraMetrics()),
    performanceMetrics: (h) => singleton(h.getPerformanceMetrics()),
    pullRequests: (h) => h.getPullRequests() ?? [],
};

const CATEGORIES: QualityCategory[] = [
    'failureRecords',
    'securityFindings',
    'deployments',
    'releases',
    'pmIssues',
    'coverageFiles',
    'doraMetrics',
    'performanceMetrics',
    'pullRequests',
];

function singleton<T>(value: T | undefined): T[] {
    return value === undefined ? [] : [value];
}

function evaluateCategories(hub: DataHub): CategoryEvaluation {
    const categories: DataQualitySummary['categories'] = {};
    const notes: string[] = [];
    let anyData = false;
    let allValid = true;

    for (const category of CATEGORIES) {
        const data = CATEGORY_ACCESSORS[category](hub);
        if (data.length === 0) continue;

        anyData = true;
        const report: QualityReport | undefined = hub.getQuality(category);
        const valid = report ? report.valid : true;
        if (!valid) {
            allValid = false;
            const detail = (report?.issues ?? []).join('; ');
            notes.push(`Dados de "${category}" com problemas de qualidade${detail ? ': ' + detail : ''}.`);
        }
        categories[category] = { valid, issues: report?.issues ?? [] };
    }

    return { categories, notes, anyData, allValid };
}

function computeMinConfidence(provenance: Map<string, DataSource> | undefined): number | null {
    if (!provenance || provenance.size === 0) return null;

    let min = 1;
    for (const ds of provenance.values()) {
        if (typeof ds.confidence === 'number' && Number.isFinite(ds.confidence)) {
            min = Math.min(min, ds.confidence);
        }
    }

    return min;
}

function deriveStatus(anyData: boolean, allValid: boolean): DataQualityStatus {
    if (!anyData) return 'missing';
    if (!allValid) return 'degraded';
    return 'ok';
}

export function summarizeDataQuality(hub: DataHub): DataQualitySummary {
    const { categories, notes, anyData, allValid } = evaluateCategories(hub);
    const minConfidence = computeMinConfidence(hub.getProvenance());
    const status = deriveStatus(anyData, allValid);

    return { status, minConfidence, categories, notes };
}
