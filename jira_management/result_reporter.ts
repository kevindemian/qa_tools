/** Match test results to Jira issues via mapping JSON and create Test Executions. */
import { formatErr } from '../shared/errors.js';
import fs from 'fs';
import path from 'path';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';
import { XrayCloudClient } from '../shared/jira/xray-cloud-client.js';
import type { JiraResourceLike } from '../shared/types.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from './create_tests.js';
import TestExecutionCreator from './test-execution-creator.js';

type TestState = 'passed' | 'failed' | 'skipped';

interface TestResultItem {
    title: string;
    state: TestState;
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
        const raw = fs.readFileSync(path.resolve(mappingJsonPath), 'utf8');
        const data: { tests?: Array<Record<string, string>> } = JSON.parse(raw) as {
            tests?: Array<Record<string, string>>;
        };
        mappings = (data.tests || []).map((t) => ({
            title: t['title'] || '',
            key: t['key'] || '',
        }));
    } catch (err) {
        rootLogger.warn('Não foi possível ler mapping JSON: ' + formatErr(err));
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

export async function linkTestsToTe(
    matchedResults: Array<{ key: string; status: string }>,
    te: { key: string },
    linkManager: import('../jira_management/jira_link_manager.js').default,
    jiraResource: JiraResourceLike,
): Promise<void> {
    const tests = matchedResults.filter((m) => m.status !== 'skipped');
    if (tests.length === 0) return;

    const isCloud = (() => {
        try {
            return Config.getDefault().get('jiraMode') === 'cloud';
        } catch {
            return false;
        }
    })();

    if (isCloud) {
        const clientId = Config.getDefault().get('xrayClientId');
        const clientSecret = Config.getDefault().get('xrayClientSecret');
        if (!clientId || !clientSecret) {
            rootLogger.error(
                'Cloud mode: XRAY_CLIENT_ID/XRAY_CLIENT_SECRET ausentes — não é possível associar testes nativamente à TE.',
            );
            return;
        }
        const client = new XrayCloudClient();
        try {
            const teId = await resolveNumericId(jiraResource, te.key);
            const testIds = await Promise.all(tests.map((m) => resolveNumericId(jiraResource, m.key)));
            await client.addTestsToTestExecution(teId, testIds, clientId, clientSecret);
        } catch (err) {
            rootLogger.error('Falha ao associar testes à TE (Xray Cloud nativo): ' + formatErr(err));
        }
        return;
    }

    for (const m of tests) {
        try {
            await linkManager.createIssueLink(m.key, te.key, 'Tests');
        } catch (err: unknown) {
            const msg = formatErr(err);
            if (!msg.includes('already exists') && !msg.includes('already linked')) {
                rootLogger.warn('Falha ao linkar ' + m.key + ': ' + msg);
            }
        }
    }
}

/** Xray Cloud identifies issues by their numeric Jira id (not the key). */
async function resolveNumericId(jiraResource: JiraResourceLike, issueKey: string): Promise<string> {
    const issue = await jiraResource.getJiraResource<{ id?: string }>('issue/' + issueKey);
    if (!issue.id) {
        throw new Error('issue ' + issueKey + ' has no numeric id');
    }
    return issue.id;
}

const RAVEN_IMPORT_STATUS: Record<string, string> = {
    passed: 'PASS',
    failed: 'FAIL',
    skipped: 'SKIPPED',
};

/** Import execution results into Xray via the raven 2.0 REST API.
 *  Attaches PASS/FAIL/SKIPPED outcomes to the created Test Execution.
 *  Fails loud: errors are logged explicitly (never swallowed). */
export async function importExecutionResults(
    jiraResource: JiraResourceLike,
    testExecutionKey: string,
    matchedResults: Array<{ key: string; status: string; duration: number }>,
): Promise<void> {
    if (typeof jiraResource.postToApiRoot !== 'function') {
        rootLogger.error('Result import (C0) requires postToApiRoot support on the Jira resource; skipping import.');
        return;
    }
    const tests = matchedResults
        .filter((m) => m.status !== 'skipped')
        .map((m) => ({
            testKey: m.key,
            status: RAVEN_IMPORT_STATUS[m.status] ?? 'TODO',
            comment: m.status === 'failed' ? 'Failed via qa_tools pipeline' : 'Passed via qa_tools pipeline',
        }));
    if (tests.length === 0) return;

    const payload = {
        info: { testExecutionKey },
        tests,
    };

    try {
        rootLogger.info('Importando resultados de execução (raven 2.0) para ' + testExecutionKey + '...');
        await jiraResource.postToApiRoot('rest/raven/2.0/api/import/execution/json', payload);
        rootLogger.info('Resultados importados para Xray: ' + testExecutionKey);
    } catch (err) {
        rootLogger.error('Falha ao importar resultados para Xray (' + testExecutionKey + '): ' + formatErr(err));
    }
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
            await linkTestsToTe(opts.matchedResults, te, opts.linkManager, opts.jiraResource);
        }
    }

    if (te && te.key) {
        await importExecutionResults(opts.jiraResource, te.key, opts.matchedResults);
    }

    const passed = opts.matchedResults.filter((m) => m.status === 'passed').length;
    const failed = opts.matchedResults.filter((m) => m.status === 'failed').length;
    const skipped = opts.matchedResults.filter((m) => m.status === 'skipped').length;

    return { key: te?.key ?? '', summary: te?.summary ?? '', passed, failed, skipped };
}

export { matchResultsToTests, createTestExecutionFromResults };
