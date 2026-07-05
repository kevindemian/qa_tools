/**
 * Data Hub — Composite Provider.
 *
 * Aggregates multiple DataProviders and merges their results.
 * Providers that fail are skipped — failures never crash the composite.
 */
import type { DataProvider, FetchOptions, RawData } from '../../types/data-hub.js';

export class CompositeProvider implements DataProvider {
    readonly name = 'composite';
    readonly source: 'github' | 'gitlab' | 'jira' | 'coverage';

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

        for (const result of results) {
            if (result.status === 'rejected') continue;
            const data = result.value;

            merged.runs.push(...data.runs);

            for (const [key, value] of data.jobs) {
                merged.jobs.set(key, value);
            }
            for (const [key, value] of data.artifacts) {
                merged.artifacts.set(key, value);
            }
            for (const [key, value] of data.failureReasons) {
                merged.failureReasons.set(key, value);
            }

            if (data.coverage != null && merged.coverage == null) {
                merged.coverage = data.coverage;
            }
            if (data.jiraIssues != null && merged.jiraIssues == null) {
                merged.jiraIssues = data.jiraIssues;
            }
        }

        return merged;
    }
}
