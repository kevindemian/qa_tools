/** Match test results to Jira issues via mapping JSON and create Test Executions. */
import fs from 'fs';
import { rootLogger } from '../shared/logger.js';
import type { JiraResourceLike } from '../shared/types.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from './create_tests.js';
import TestExecutionCreator from './test-execution-creator.js';

interface TestResultItem {
    title: string;
    state: 'passed' | 'failed' | 'skipped';
    duration: number;
}

interface MappingItem {
    title: string;
    key: string;
}

interface MatchResult {
    matched: Array<{
        key: string;
        title: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
    }>;
    unmatched: Array<{ title: string; state: string }>;
    stats: { passed: number; failed: number; skipped: number; total: number };
}

interface TestExecResult {
    key: string;
    summary: string;
    passed: number;
    failed: number;
    skipped: number;
}

interface PipelineInfo {
    pipelineId?: string | number;
    branch?: string;
    provider?: string;
}

interface CreateTeOpts {
    jiraResource: JiraResourceLike;
    linkManager: import('./jira_link_manager.js').default;
    projectName: string;
    matchedResults: Array<{
        key: string;
        title: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
    }>;
    csvName: string;
    pipelineInfo?: PipelineInfo;
    existingTeKey?: string;
}

function _fuzzyMatch(title: string, mappings: MappingItem[]): MappingItem | null {
    if (!title) return null;

    const exact = mappings.find((m) => m.title === title);
    if (exact) return exact;

    const lower = title.toLowerCase();
    const byContains = mappings.find(
        (m) => lower.includes(m.title.toLowerCase()) || m.title.toLowerCase().includes(lower),
    );
    if (byContains) return byContains;

    const normalized = title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return mappings.find((m) => m.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalized) || null;
}

function matchResultsToTests(results: TestResultItem[], mappingJsonPath: string): MatchResult {
    let mappings: MappingItem[];
    try {
        const raw = fs.readFileSync(mappingJsonPath, 'utf8');
        const data: { tests?: Array<Record<string, string>> } = JSON.parse(raw) as {
            tests?: Array<Record<string, string>>;
        };
        mappings = (data.tests || []).map((t) => ({
            title: t['title'] || '',
            key: t['key'] || '',
        }));
    } catch (err) {
        rootLogger.warn('Não foi possível ler mapping JSON: ' + (err as Error).message);
        return { matched: [], unmatched: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0 } };
    }

    if (mappings.length === 0) {
        rootLogger.warn('Mapping JSON vazio');
        return { matched: [], unmatched: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0 } };
    }

    const matched: MatchResult['matched'] = [];
    const unmatched: MatchResult['unmatched'] = [];

    for (const r of results) {
        const match = _fuzzyMatch(r.title, mappings);
        if (match) {
            matched.push({ key: match.key, title: r.title, status: r.state, duration: r.duration });
        } else {
            unmatched.push({ title: r.title, state: r.state });
        }
    }

    const passed = matched.filter((m) => m.status === 'passed').length;
    const failed = matched.filter((m) => m.status === 'failed').length;
    const skipped = matched.filter((m) => m.status === 'skipped').length;

    return { matched, unmatched, stats: { passed, failed, skipped, total: matched.length } };
}

function _buildExecutionPayload(
    matchedResults: Array<{ key: string; title: string; status: string; duration: number }>,
    csvName: string,
    pipelineInfo?: PipelineInfo,
): { summary: string; testKeys: string[] } {
    const now = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    const branch = pipelineInfo?.branch || '';
    const pipelineId = pipelineInfo?.pipelineId || '';
    let tag = '';
    if (branch) tag += branch;
    if (pipelineId) tag += (tag ? ' #' : '#') + pipelineId;
    if (tag) tag = ' (' + tag + ')';

    const summary = 'Results: ' + (csvName || 'Tests') + tag + ' - ' + now;
    const testKeys = matchedResults.reduce((acc: string[], m) => {
        if (m.status !== 'skipped') acc.push(m.key);
        return acc;
    }, []);
    return { summary, testKeys };
}

async function createTestExecutionFromResults(opts: CreateTeOpts): Promise<TestExecResult> {
    const { testKeys } = _buildExecutionPayload(opts.matchedResults, opts.csvName, opts.pipelineInfo);

    const creator = new TestExecutionCreator(opts.jiraResource, opts.linkManager);
    let te: { key: string; summary: string } | null;
    if (opts.existingTeKey) {
        te = await creator.addTestsToExistingExecution(opts.existingTeKey, testKeys);
        if (!te) {
            rootLogger.error('Falha ao adicionar testes à Test Execution existente: ' + opts.existingTeKey);
            return { key: '', summary: '', passed: 0, failed: 0, skipped: 0 };
        }
    } else {
        const { summary } = _buildExecutionPayload(opts.matchedResults, opts.csvName, opts.pipelineInfo);
        te = await createTests.createTestExecution({
            testExecutionCreator: creator,
            projectName: opts.projectName,
            testKeys,
            csvName: opts.csvName,
            titleOverride: summary,
        });

        if (te && te.key && opts.matchedResults.length > 0) {
            try {
                for (const m of opts.matchedResults) {
                    if (m.status === 'skipped') continue;
                    await opts.linkManager.createIssueLink(m.key, te.key, 'Tests');
                }
            } catch (err) {
                rootLogger.warn('Falha ao linkar alguns testes: ' + (err as Error).message);
            }
        }
    }

    const passed = opts.matchedResults.filter((m) => m.status === 'passed').length;
    const failed = opts.matchedResults.filter((m) => m.status === 'failed').length;
    const skipped = opts.matchedResults.filter((m) => m.status === 'skipped').length;

    return { key: te?.key ?? '', summary: te?.summary ?? '', passed, failed, skipped };
}

export { matchResultsToTests, createTestExecutionFromResults };
