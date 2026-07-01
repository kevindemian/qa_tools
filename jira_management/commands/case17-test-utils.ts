import fs from 'fs';
import path from 'path';
import Config from '../../shared/config.js';
import type { FlatTest } from '../../shared/result_parser.js';
import type { TestHistoryRun } from '../../shared/report-generator.js';
import { createHistoryProvider, TestHistoryCache } from '../xray-history.js';
import type { CommandContext } from './context.js';
import { rootLogger } from '../../shared/logger.js';

export { fetchGitHistory, fetchLatestTestRun } from '../../shared/git-artifact-downloader.js';

function getMappingCandidates(): string[] {
    return [Config.get('QA_MAPPING_PATH') || '', path.join(process.cwd(), 'mapping.json')];
}

function parseTestFile(candidate: string): Map<string, string> | null {
    try {
        const raw = fs.readFileSync(candidate, 'utf8');
        const data: { tests?: Array<Record<string, string>> } = JSON.parse(raw) as {
            tests?: Array<Record<string, string>>;
        };
        const tests: Array<Record<string, string>> = data.tests ?? [];
        if (tests.length === 0) return new Map();
        const entries: Array<[string, string]> = [];
        for (const t of tests) {
            if (t['title'] && t['key']) entries.push([t['title'], t['key']]);
        }
        return new Map(entries);
    } catch (err) {
        rootLogger.warn('case17-test-utils: failed to parse test data, trying next: ' + String(err));
        return null;
    }
}

export function resolveMapping(): Map<string, string> {
    for (const candidate of getMappingCandidates()) {
        if (!candidate || !fs.existsSync(candidate)) continue;
        const result = parseTestFile(candidate);
        if (result !== null) return result;
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

function loadLastTests(
    store?: import('../../shared/store.js').Store,
    project?: string,
): Array<{ name: string; status: string }> {
    if (!store || !project) return [];
    const stored = store.loadMetrics<{
        tests?: Array<{ title: string; state: string }>;
    }>();
    if (stored?.tests && Array.isArray(stored.tests) && stored.tests.length > 0) {
        return stored.tests.map((t) => ({ name: t.title, status: t.state }));
    }
    return [];
}

export function computeDiff(
    current: FlatTest[],
    store?: import('../../shared/store.js').Store,
    project?: string,
): {
    newFailures: FlatTest[];
    newPasses: FlatTest[];
    flaky: FlatTest[];
} {
    const lastTests = loadLastTests(store, project);

    if (lastTests.length === 0) {
        return { newFailures: [], newPasses: [], flaky: [] };
    }

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
}
