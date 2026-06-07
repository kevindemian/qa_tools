import fs from 'fs';
import path from 'path';
import Config from '../../shared/config.js';
import type { FlatTest } from '../../shared/result_parser.js';
import type { TestHistoryRun } from '../../shared/report-generator.js';
import { createHistoryProvider, TestHistoryCache } from '../xray-history.js';
import type { CommandContext } from './context.js';
import { CTRF_LAST_FILE, isValidCtrfData } from './case17-helpers.js';

export { fetchGitHistory, fetchLatestTestRun } from '../../shared/git-artifact-downloader.js';

function getMappingCandidates(): string[] {
    return [Config.get('QA_MAPPING_PATH') || '', path.join(process.cwd(), 'mapping.json')];
}

export function resolveMapping(): Map<string, string> {
    for (const candidate of getMappingCandidates()) {
        if (!candidate || !fs.existsSync(candidate)) continue;
        try {
            const raw = fs.readFileSync(candidate, 'utf8');
            const data: { tests?: Array<Record<string, string>> } = JSON.parse(raw) as {
                tests?: Array<Record<string, string>>;
            };
            const tests: Array<Record<string, string>> = data.tests ?? [];
            if (tests.length === 0) return new Map();
            const entries: Array<[string, string]> = [];
            for (const t of tests) {
                if (t.title && t.key) entries.push([t.title, t.key]);
            }
            return new Map(entries);
        } catch {
            /* try next candidate */
        }
    }
    return new Map();
}

export async function resolveTestHistory(
    tests: FlatTest[],
    c: CommandContext,
    cache: TestHistoryCache,
): Promise<Record<string, TestHistoryRun[]>> {
    const mapping = resolveMapping();
    if (mapping.size === 0) return {};
    const provider = createHistoryProvider(c.jiraResource);

    const keys = tests.map((t) => mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '').filter(Boolean);
    if (keys.length === 0) return {};
    const uniqueKeys = [...new Set(keys)];
    const results = await Promise.allSettled(
        uniqueKeys.map(async (key) => {
            const cached = cache.get(key);
            if (cached) return { key, history: cached };
            const history = await provider.getHistory(key);
            cache.set(key, history);
            return { key, history };
        }),
    );

    const keyToHistory = new Map<string, TestHistoryRun[]>();
    for (const result of results) {
        if (result.status === 'fulfilled') {
            keyToHistory.set(result.value.key, result.value.history);
        }
    }
    const titleToHistory: Record<string, TestHistoryRun[]> = {};
    for (const t of tests) {
        const key = mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '';
        if (key && keyToHistory.has(key)) {
            titleToHistory[t.title] = keyToHistory.get(key) ?? [];
        }
    }
    return titleToHistory;
}

export function computeDiff(current: FlatTest[]): {
    newFailures: FlatTest[];
    newPasses: FlatTest[];
    flaky: FlatTest[];
} {
    const lastPath = path.join(process.cwd(), CTRF_LAST_FILE);
    if (!fs.existsSync(lastPath)) {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
    try {
        const raw = fs.readFileSync(lastPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!isValidCtrfData(parsed)) return { newFailures: [], newPasses: [], flaky: [] };
        const lastData = parsed;
        const lastTests = lastData.results.tests || [];
        const lastByTitle = new Map(lastTests.map((t) => [t.name, t]));
        const newFailures: FlatTest[] = [];
        const newPasses: FlatTest[] = [];
        const flaky: FlatTest[] = [];
        for (const t of current) {
            const last = lastByTitle.get(t.title);
            if (!last) continue;
            if (t.state === 'failed' && last.status === 'passed') newFailures.push(t);
            if (t.state === 'passed' && last.status === 'failed') newPasses.push(t);
            if (last.status === 'failed') flaky.push(t);
        }
        return { newFailures, newPasses, flaky };
    } catch {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
}
