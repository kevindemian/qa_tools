import { rootLogger } from './logger';
import type { JiraResourceLike } from './types';
import type { FlakyAction, FlakyActionConfig } from './types';
import type { FlakinessEntry, MetricsStore } from './metrics';
import { quarantineTest } from './quarantine';

const DEFAULT_CONFIG: FlakyActionConfig = {
    threshold: 0.3,
    autoCreateBug: false,
    bugPriority: 'Medium',
    minTotalRuns: 10,
    dedupSearch: true,
    windowSize: 20,
};

function buildBugDescription(
    title: string,
    rate: number,
    failCount: number,
    passCount: number,
    totalRuns: number,
): string {
    const pct = Math.round(rate * 100);
    return [
        '## Teste Flaky Detectado',
        '',
        '**Teste:** `' + title + '`',
        '**Taxa de Flaky:** ' + pct + '% (' + failCount + ' falhas em ' + totalRuns + ' execuções)',
        '',
        '| Status | Contagem |',
        '|--------|----------|',
        '| Pass   | ' + passCount + ' |',
        '| Fail   | ' + failCount + ' |',
        '',
        '**Ações Recomendadas:**',
        '- [ ] Investigar causa raiz',
        '- [ ] Estabilizar ou mover para suite separado',
        "- [ ] Remover label 'flaky' quando resolvido",
    ].join('\n');
}

export function calculateFlakinessWithWindow(
    store: MetricsStore,
    options?: { windowSize?: number; minRuns?: number },
): FlakinessEntry[] {
    const windowSize = options?.windowSize ?? 20;
    const minRuns = options?.minRuns ?? 10;
    const recentRuns = store.runs.slice(-windowSize);

    const testMap = new Map<string, { pass: number; fail: number; skip: number }>();

    for (const run of recentRuns) {
        for (const t of run.tests) {
            const entry = testMap.get(t.title) || { pass: 0, fail: 0, skip: 0 };
            if (t.state === 'passed') entry.pass++;
            else if (t.state === 'failed') entry.fail++;
            else entry.skip++;
            testMap.set(t.title, entry);
        }
    }

    const result: FlakinessEntry[] = [];
    for (const [title, counts] of testMap) {
        const totalRunAppearances = counts.pass + counts.fail + counts.skip;
        if (totalRunAppearances < minRuns) continue;
        const rate = totalRunAppearances > 0 ? counts.fail / totalRunAppearances : 0;
        result.push({
            title,
            passCount: counts.pass,
            failCount: counts.fail,
            skipCount: counts.skip,
            totalRuns: totalRunAppearances,
            rate,
        });
    }

    result.sort((a, b) => b.rate - a.rate);
    return result;
}

async function searchExistingBug(
    jiraResource: JiraResourceLike,
    project: string,
    title: string,
): Promise<string | null> {
    const escapedTitle = title.replace(/"/g, '\\"');
    const jql =
        'project = ' + project + ' AND issuetype = Bug AND summary ~ "[Flaky] ' + escapedTitle + '" AND status != Done';
    try {
        const result = await jiraResource.searchJiraIssues(jql, 5);
        if (result.issues && result.issues.length > 0) {
            const first = result.issues[0];
            if (first) return first.key;
        }
        return null;
    } catch (err) {
        rootLogger.error('Failed to search for existing bug: ' + (err as Error).message);
        return null;
    }
}

interface FlakyBugInput {
    jiraResource: JiraResourceLike;
    project: string;
    title: string;
    rate: number;
    failCount: number;
    passCount: number;
    totalRuns: number;
    priority: string;
}

async function createFlakyBug(input: FlakyBugInput): Promise<string> {
    const { jiraResource, project, title, rate, failCount, passCount, totalRuns, priority } = input;
    const summary = '[Flaky] ' + title;
    const description = buildBugDescription(title, rate, failCount, passCount, totalRuns);
    const payload = {
        fields: {
            project: { key: project },
            summary,
            description,
            issuetype: { name: 'Bug' },
            labels: ['flaky', 'auto-generated'],
            priority: { name: priority },
        },
    };

    try {
        const response = await jiraResource.postJiraResource<{ key: string }>('issue', payload);
        const key = response.key;
        rootLogger.info('Created bug ' + key + ' for flaky test: ' + title);
        return key;
    } catch (err) {
        rootLogger.error('Failed to create flaky bug: ' + (err as Error).message);
        throw err;
    }
}

async function reenableTest(jiraResource: JiraResourceLike, existingKey: string): Promise<void> {
    try {
        const transitions = await jiraResource.getTransitionsForIssue(existingKey);
        const doneTransition = Object.entries(transitions).find(
            ([name]) => name.toLowerCase() === 'done' || name.toLowerCase() === 'closed',
        );
        if (doneTransition) {
            await jiraResource.transitionIssue(existingKey, doneTransition[1]);
        }
    } catch (err) {
        rootLogger.error('Failed to re-enable test: ' + (err as Error).message);
        throw err;
    }
}

function makeAction(
    entry: FlakinessEntry,
    action: FlakyAction['action'],
    reason: string,
    jiraBugKey?: string,
): FlakyAction {
    return {
        testTitle: entry.title,
        flakyRate: entry.rate,
        passCount: entry.passCount,
        failCount: entry.failCount,
        totalRuns: entry.totalRuns,
        lastErrorMessages: [],
        action,
        jiraBugKey,
        reason,
    };
}

async function _handleStableEntry(
    entry: FlakinessEntry,
    jiraResource: JiraResourceLike,
    project: string,
): Promise<FlakyAction | null> {
    const existingKey = await searchExistingBug(jiraResource, project, entry.title);
    if (!existingKey) return null;
    await reenableTest(jiraResource, existingKey);
    return makeAction(entry, 'reenable', 'test stabilized, closed bug ' + existingKey, existingKey);
}

async function _processFlakyEntry(
    entry: FlakinessEntry,
    jiraResource: JiraResourceLike,
    project: string,
    cfg: FlakyActionConfig,
): Promise<FlakyAction> {
    if (cfg.dedupSearch) {
        const existing = await searchExistingBug(jiraResource, project, entry.title);
        if (existing) {
            quarantineTest({
                testTitle: entry.title,
                reason: 'bug already exists: ' + existing,
                quarantinedBy: 'flaky-auto-actions',
                flakyRate: entry.rate,
                bugUrl: existing,
            });
            return makeAction(entry, 'none', 'bug already exists: ' + existing, existing);
        }
    }

    let bugKey: string | undefined;
    let action: FlakyAction['action'];
    let reason: string;

    if (cfg.autoCreateBug) {
        bugKey = await createFlakyBug({
            jiraResource,
            project,
            title: entry.title,
            rate: entry.rate,
            failCount: entry.failCount,
            passCount: entry.passCount,
            totalRuns: entry.totalRuns,
            priority: cfg.bugPriority,
        });
        action = 'create_bug';
        reason = 'bug created: ' + bugKey;
    } else {
        action = 'flag_in_report';
        reason = 'flaky rate exceeds threshold';
    }

    quarantineTest({
        testTitle: entry.title,
        reason,
        quarantinedBy: 'flaky-auto-actions',
        flakyRate: entry.rate,
        bugUrl: bugKey,
    });
    return makeAction(entry, action, reason, bugKey);
}

export async function executeFlakyActions(
    metricsStore: MetricsStore,
    jiraResource: JiraResourceLike,
    project: string,
    config?: Partial<FlakyActionConfig>,
): Promise<FlakyAction[]> {
    const cfg: FlakyActionConfig = { ...DEFAULT_CONFIG, ...config };
    const flakyEntries = calculateFlakinessWithWindow(metricsStore, {
        windowSize: cfg.windowSize,
        minRuns: cfg.minTotalRuns,
    });

    const actions: FlakyAction[] = [];

    for (const entry of flakyEntries) {
        if (entry.rate <= cfg.threshold) {
            const action = await _handleStableEntry(entry, jiraResource, project);
            if (action) actions.push(action);
            continue;
        }

        if (entry.totalRuns < cfg.minTotalRuns) continue;

        const action = await _processFlakyEntry(entry, jiraResource, project, cfg);
        actions.push(action);
    }

    return actions;
}
