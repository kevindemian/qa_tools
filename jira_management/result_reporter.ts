/** Match test results to Jira issues via mapping JSON and create Test Executions. */
import fs from 'fs';
import { rootLogger } from '../shared/logger';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from './create_tests';

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
        const data = JSON.parse(raw);
        mappings = (data.tests || []).map((t: Record<string, string>) => ({
            title: t.title || '',
            key: t.key || '',
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
    const testKeys = matchedResults.filter((m) => m.status !== 'skipped').map((m) => m.key);
    return { summary, testKeys };
}

async function createTestExecutionFromResults(
    jiraResource: import('./jira_resource').default,
    linkManager: import('./jira_link_manager').default,
    project_name: string,
    matchedResults: Array<{
        key: string;
        title: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
    }>,
    csvName: string,
    pipelineInfo?: PipelineInfo,
): Promise<TestExecResult> {
    const { summary, testKeys } = _buildExecutionPayload(matchedResults, csvName, pipelineInfo);
    const te = await createTests.createTestExecution(
        jiraResource,
        linkManager,
        project_name,
        testKeys,
        csvName,
        summary,
    );

    if (te.key && matchedResults.length > 0) {
        try {
            for (const m of matchedResults) {
                if (m.status === 'skipped') continue;
                await linkManager.createIssueLink(m.key, te.key, 'Tests');
            }
        } catch (err) {
            rootLogger.warn('Falha ao linkar alguns testes: ' + (err as Error).message);
        }
    }

    const passed = matchedResults.filter((m) => m.status === 'passed').length;
    const failed = matchedResults.filter((m) => m.status === 'failed').length;
    const skipped = matchedResults.filter((m) => m.status === 'skipped').length;

    return { key: te.key, summary, passed, failed, skipped };
}

export { matchResultsToTests, createTestExecutionFromResults };
