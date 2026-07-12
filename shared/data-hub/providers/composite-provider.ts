/**
 * Data Hub — Composite Provider.
 *
 * Aggregates multiple DataProviders and merges their results.
 * Providers that fail are skipped — failures never crash the composite.
 */
import type { DataProvider, FetchOptions, RawData } from '../../types/data-hub.js';
import { mergeCategoryArrays } from '../raw-merge.js';

export class CompositeProvider implements DataProvider {
    readonly name = 'composite';
    readonly source: 'github' | 'gitlab' | 'jira' | 'coverage' | 'xray';

    constructor(private readonly providers: DataProvider[]) {
        this.source = providers[0]?.source ?? 'github';
    }

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const results = await Promise.allSettled(this.providers.map((p) => p.fetchRawData(options)));

        const merged: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        const seenRunIds = new Set<string | number>();

        for (const result of results) {
            if (result.status === 'rejected') continue;
            this.mergeProviderData(merged, result.value, seenRunIds);
        }

        return merged;
    }

    private mergeProviderData(target: RawData, source: RawData, seenRunIds: Set<string | number>): void {
        for (const run of source.runs) {
            if (run.id != null && !seenRunIds.has(run.id)) {
                seenRunIds.add(run.id);
                target.runs.push(run);
            } else if (run.id == null) {
                target.runs.push(run);
            }
        }

        CompositeProvider.mergeMap(target.jobs, source.jobs);
        CompositeProvider.mergeMap(target.artifacts, source.artifacts);
        CompositeProvider.mergeMap(target.failureReasons, source.failureReasons);
        CompositeProvider.mergeFirstNonNull(target, source);
        CompositeProvider.mergeOptionalMaps(target, source);
        CompositeProvider.mergeXray(target, source);
        mergeCategoryArrays(target, source);
    }

    private static mergeMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
        for (const [key, value] of source) target.set(key, value);
    }

    private static mergeFirstNonNull(target: RawData, source: RawData): void {
        if (source.coverage != null && target.coverage == null) target.coverage = source.coverage;
        if (source.jiraIssues != null && target.jiraIssues == null) target.jiraIssues = source.jiraIssues;
        if (source.framework != null && target.framework == null) target.framework = source.framework;
    }

    private static mergeOptionalMaps(target: RawData, source: RawData): void {
        if (source.timing != null) {
            if (target.timing == null) target.timing = new Map();
            for (const [key, value] of source.timing) target.timing.set(key, value);
        }
        if (source.parsedArtifacts != null) {
            if (target.parsedArtifacts == null) target.parsedArtifacts = new Map();
            for (const [key, value] of source.parsedArtifacts) target.parsedArtifacts.set(key, value);
        }
    }

    /**
     * Merge Xray data (test executions + test runs) by concatenating and
     * de-duplicating on key/id. Never throws on partial data.
     */
    private static mergeXray(target: RawData, source: RawData): void {
        if (source.xray == null) return;
        if (target.xray == null) {
            target.xray = {
                testExecutions: [...source.xray.testExecutions],
                testRuns: [...source.xray.testRuns],
            };
            return;
        }
        const seenExec = new Set(target.xray.testExecutions.map((e) => e.key).filter(Boolean));
        for (const exec of source.xray.testExecutions) {
            if (exec.key && !seenExec.has(exec.key)) {
                seenExec.add(exec.key);
                target.xray.testExecutions.push(exec);
            }
        }
        const seenRuns = new Set(target.xray.testRuns.map((r) => r.id).filter(Boolean));
        for (const run of source.xray.testRuns) {
            if (run.id && !seenRuns.has(run.id)) {
                seenRuns.add(run.id);
                target.xray.testRuns.push(run);
            }
        }
    }
}
