/**
 * Shared RawData category merge logic (ST-1 expansion).
 *
 * Single source of truth for merging the expanded data categories
 * (failureRecords, securityFindings, deployments, releases, pmIssues,
 * coverageFiles, doraMetrics, performanceMetrics) across providers.
 *
 * Used by both `DataHubImpl.mergeRawData` (hub.ts) and `CompositeProvider`
 * to guarantee identical merge semantics — no duplicated logic (AGENTS §6).
 *
 * @module raw-merge
 */
import type { RawData } from '../types/data-hub.js';

/**
 * Merge ST-1 array/object categories from `source` into `target`.
 * Array categories accumulate with dedup by natural key (no silent drop,
 * no duplicate). Object categories use first-non-null (later providers
 * never clobber an already-present extraction).
 */
export function mergeCategoryArrays(target: RawData, source: RawData): void {
    target.failureRecords = appendDedup(
        target.failureRecords,
        source.failureRecords,
        (r) => `${r.source}|${r.suite ?? ''}|${r.name}`,
    );
    target.securityFindings = appendDedup(
        target.securityFindings,
        source.securityFindings,
        (f) => `${f.tool}|${f.title}|${f.file ?? ''}|${f.line ?? ''}`,
    );
    target.deployments = appendDedup(target.deployments, source.deployments, (d) => String(d.id));
    target.releases = appendDedup(target.releases, source.releases, (r) => String(r.id));
    target.pmIssues = appendDedup(target.pmIssues, source.pmIssues, (i) => `${i.source}|${i.id}`);
    target.coverageFiles = appendDedup(target.coverageFiles, source.coverageFiles, (c) => c.file);
    target.pullRequests = appendDedup(target.pullRequests, source.pullRequests, (p) => String(p.id));
    if (source.doraMetrics != null && target.doraMetrics == null) target.doraMetrics = source.doraMetrics;
    if (source.performanceMetrics != null && target.performanceMetrics == null) {
        target.performanceMetrics = source.performanceMetrics;
    }
}

/**
 * Append `source` items to `target`, skipping any whose natural key already
 * exists in `target`. Preserves order; never drops data (AGENTS §25).
 */
function appendDedup<T>(target: T[] | undefined, source: T[] | undefined, key: (item: T) => string): T[] {
    if (source == null || source.length === 0) return target ?? [];
    const base = target ?? [];
    const seen = new Set(base.map(key));
    const merged = [...base];
    for (const item of source) {
        const k = key(item);
        if (!seen.has(k)) {
            seen.add(k);
            merged.push(item);
        }
    }
    return merged;
}
