/** Import orchestrator: coordinates CSV parsing, test-case creation, issue linking, and result reporting. */
import type { ImportMode, JiraResourceLike } from '../shared/types.js';
import JiraLinkManager from './jira_link_manager.js';
import type { TestCase, TestResult, BatchFields } from '../shared/types.js';
import TestCaseFactory from './test-case-factory.js';
import IssueLinker from './issue-linker.js';
import MappingFileGenerator from './mapping-file-generator.js';
import { rootLogger } from '../shared/logger.js';
import { update as updateState } from '../shared/state.js';
import { showPreview, confirmOrCancel, validateImportBatch, handleDryRun } from './import-prep.js';
import { executeTestCreationLoop, updateFinalState, type TestCreationLoopOptions } from './import-loop.js';
import { OPERATION_CANCELLED } from './constants.js';
import { info, warn, isQuiet, print, printSummary, prompt } from '../shared/ui/prompt.js';
import Config from '../shared/config-accessor.js';
import { createStepImporter, type XrayStepImporter } from './xray-client.js';
import { XrayCloudClient } from '../shared/jira/xray-cloud-client.js';
import type { SnapshotContext } from './issue-snapshot.js';
import { buildAutoConfirmHandler } from '../shared/ui/error-report.js';
import { deduplicateLinkedIssues, type LinkedIssue } from '../shared/issue-link-utils.js';

interface CreateTestsFromTestCasesParams {
    tests: TestCase[];
    jiraResource: JiraResourceLike;
    jiraResourceXray: JiraResourceLike;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    sourcePath: string;
    sourceType: string;
    jiraLabels: string[];
    batchFields?: BatchFields;
    targetKeys?: string[];
    importMode?: ImportMode;
}

export type CreateTestsFromTestCasesResult = {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    parentIssues: LinkedIssue[];
    summary: string;
    status: string;
    sourcePath: string;
    failedLinks?: string[];
};

type PrepareTestRunResult =
    | CreateTestsFromTestCasesResult
    | {
          tests: TestCase[];
          resumeFrom: number;
          inMemoryTasksId: string[];
          inMemoryTasksText: string[];
          opLog: ReturnType<typeof rootLogger.child>;
          targetKeys: string[];
          importMode: ImportMode;
      }
    | undefined;

interface PrepareTestRunOptions {
    tests: TestCase[];
    sourcePath: string;
    sourceType: string;
    project_name: string;
    jiraLabels: string[];
    batchFields?: BatchFields;
    onBusy: (busy: boolean) => void;
    warn: (msg: string) => void;
    jiraResource?: JiraResourceLike;
    targetKeys?: string[];
    importMode?: ImportMode;
}

async function findExistingMatches(
    jiraResource: JiraResourceLike,
    tests: TestCase[],
    project: string,
): Promise<Array<{ key: string; title: string }>> {
    const matches: Array<{ key: string; title: string }> = [];
    for (const test of tests) {
        if (!test.title) continue;
        try {
            const jql = `project = "${project.replace(/"/g, '\\"')}" AND summary ~ "${test.title.replace(/"/g, '\\"')}"`;
            const result = await jiraResource.searchJiraIssues(jql, 5);
            const found = result.issues.find(
                (i) => (i.fields['summary'] as string).trim().toLowerCase() === test.title.trim().toLowerCase(),
            );
            if (found) matches.push({ key: found.key, title: test.title });
        } catch (err) {
            rootLogger.warn('findExistingMatches: search failed: ' + String(err));
        }
    }
    return matches;
}

async function resolveTargetKeys(
    jiraResource: JiraResourceLike | undefined,
    filtered: TestCase[],
    project_name: string,
    warn: (msg: string) => void,
    info: (msg: string) => void,
    explicit?: string[],
): Promise<string[]> {
    let targetKeys = explicit ? [...explicit] : [];
    if (targetKeys.length === 0) {
        const raw = Config.get<string>('targetKeys');
        targetKeys = raw
            ? raw
                  .split(',')
                  .map((k) => k.trim())
                  .filter(Boolean)
            : [];
    }
    if (targetKeys.length === 0 && !Config.get('autoConfirm') && jiraResource) {
        const targetKeysInput = prompt('Mapear por chave Jira? (ex: ECSPOL-1605,ECSPOL-1606,... ou Enter para skip)');
        if (targetKeysInput.trim()) {
            targetKeys = targetKeysInput
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean);
        }
    }
    if (targetKeys.length > 0) {
        if (targetKeys.length !== filtered.length) {
            warn(
                'Aviso: ' +
                    targetKeys.length +
                    ' target-keys informados, mas ' +
                    filtered.length +
                    ' testes no CSV. Apenas os primeiros ' +
                    Math.min(targetKeys.length, filtered.length) +
                    ' serao mapeados.',
            );
        }
        info('Modo ordenado: ' + filtered.length + ' teste(s) serao mapeados por chave Jira');
        for (let i = 0; i < Math.min(targetKeys.length, filtered.length); i++) {
            info('  CSV[' + (i + 1) + '] → ' + targetKeys[i]);
        }
    } else if (jiraResource && !Config.get<boolean>('autoConfirm')) {
        const matches = await findExistingMatches(jiraResource, filtered, project_name);
        if (matches.length > 0) {
            info(matches.length + ' teste(s) ja existem no Jira: ' + matches.map((m) => m.key).join(', '));
            info('Politica: --update-policy=' + Config.get('updatePolicy'));
        }
    }
    return targetKeys;
}

async function prepareTestRun(opts: PrepareTestRunOptions): Promise<PrepareTestRunResult> {
    const {
        tests,
        sourcePath,
        sourceType,
        project_name,
        jiraLabels,
        batchFields,
        onBusy,
        warn,
        jiraResource,
        targetKeys,
        importMode = 'create',
    } = opts;
    const validationResult = validateImportBatch(tests, sourcePath, sourceType, project_name);
    if (validationResult === undefined) return;
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog } = validationResult;

    const totalSteps = tests.reduce((sum, t) => sum + t.steps.length, 0);
    const groupsCount = new Set(tests.map((t) => t.group).filter(Boolean)).size;
    await showPreview(tests, jiraLabels, totalSteps, groupsCount, undefined, batchFields);

    const resolvedTargetKeys = await resolveTargetKeys(jiraResource, tests, project_name, warn, info, targetKeys);

    if (!confirmOrCancel()) {
        warn(OPERATION_CANCELLED);
        return;
    }

    const dryRunResult = await handleDryRun(tests, onBusy, sourcePath);
    if (dryRunResult) {
        return {
            inMemoryTasksId: dryRunResult.inMemoryTasksId,
            inMemoryTasksText: dryRunResult.inMemoryTasksText,
            parentIssues: dryRunResult.parentIssues,
            summary: dryRunResult.summary,
            status: dryRunResult.status,
            sourcePath: dryRunResult.sourcePath,
            failedLinks: dryRunResult.failedLinks,
        };
    }

    return {
        tests,
        resumeFrom,
        inMemoryTasksId,
        inMemoryTasksText,
        opLog,
        targetKeys: resolvedTargetKeys,
        importMode,
    };
}

interface FinalizeTestCreationParams {
    results: TestResult[];
    tests: TestCase[];
    linker: IssueLinker;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    parentIssues: LinkedIssue[];
    sourcePath: string;
    sourceType: string;
    project_name: string;
    jiraLabels: string[];
    opLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    info: (msg: string) => void;
    printSummary: (results: TestResult[]) => void;
    failedLinks: string[];
}

type FinalizeTestCreationResult = {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    parentIssues: LinkedIssue[];
    summary: string;
    status: string;
    sourcePath: string;
    failedLinks: string[];
};

async function finalizeTestCreation({
    results,
    tests,
    linker,
    inMemoryTasksId,
    inMemoryTasksText,
    parentIssues: parentIssuesInput,
    sourcePath,
    sourceType,
    project_name: projectName,
    jiraLabels,
    opLog,
    onBusy,
    info,
    printSummary,
    failedLinks,
}: FinalizeTestCreationParams): Promise<FinalizeTestCreationResult | undefined> {
    info('Passo 4 de 5: Atualizando referências e gerando mapeamentos...');
    await postProcessCheckpoint({
        results,
        tests,
        projectName,
        inMemoryTasksId,
        jiraLabels,
        sourcePath,
        sourceType,
        linker,
        info,
    });

    info('Passo 5 de 5: Finalizando...');
    printSummary(results);

    const okCount = results.filter((r) => r.status === 'ok').length;
    const errored = results.some((r) => r.status === 'error');
    let summary = okCount + '/' + tests.length + ' testes criados';
    if (errored && failedLinks.length > 0) {
        summary += '; ' + failedLinks.length + ' vínculo(s) perdido(s): ' + failedLinks.join(', ');
    }
    opLog.info('Operação concluída', {
        passed: okCount,
        failed: results.length - okCount,
        total: tests.length,
        failedLinks,
    });

    onBusy(false);

    const parentIssues =
        parentIssuesInput.length > 0
            ? parentIssuesInput
            : deduplicateLinkedIssues(tests.flatMap((t) => t.linkedIssues ?? []));

    return {
        inMemoryTasksId,
        inMemoryTasksText,
        parentIssues,
        summary,
        status: errored ? 'error' : 'ok',
        sourcePath,
        failedLinks,
    };
}

interface PostProcessCheckpointOptions {
    results: TestResult[];
    tests: TestCase[];
    projectName: string;
    inMemoryTasksId: string[];
    jiraLabels: string[];
    sourcePath: string;
    sourceType: string;
    linker: IssueLinker;
    info: (msg: string) => void;
}

async function postProcessCheckpoint(opts: PostProcessCheckpointOptions): Promise<void> {
    const { results, tests, projectName, inMemoryTasksId, jiraLabels, sourcePath, sourceType, linker, info } = opts;
    if (results.filter((r) => r.status === 'ok').length === tests.length) {
        updateState((state) => {
            delete state['_checkpoint'];
        });
    }

    if (tests.some((t) => t.group) && results.length > 0) {
        info('Atualizando descrições com cross-references...');
        const crossRefFailed = await linker.updateCrossReferences(tests, inMemoryTasksId);
        if (Array.isArray(crossRefFailed) && crossRefFailed.length > 0) {
            info('Aviso: ' + crossRefFailed.length + ' cross-reference(s) falharam: ' + crossRefFailed.join(', '));
        }
    }

    info('Gerando arquivos de mapeamento...');

    const mappingGen = new MappingFileGenerator();
    mappingGen.generate(sourcePath, projectName, inMemoryTasksId, tests);

    updateFinalState(sourceType, sourcePath, projectName, jiraLabels);
}

function buildSnapshotContext(jiraResource: JiraResourceLike, linkManager: JiraLinkManager): SnapshotContext | null {
    const isCloud = (() => {
        try {
            return Config.getDefault().get('jiraMode') === 'cloud';
        } catch {
            return false;
        }
    })();
    if (!isCloud) return null;
    const clientId = Config.getDefault().get('xrayClientId');
    const clientSecret = Config.getDefault().get('xrayClientSecret');
    if (!clientId || !clientSecret) return null;
    const xrayCloud = new XrayCloudClient();
    const addTestStepMutation = `
        mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
            addTestStep(issueId: $issueId, step: $step) { id }
        }
    `;
    return {
        jiraResource,
        resolveNumericId: async (key: string) => {
            const issue = await jiraResource.getJiraResource<{ id?: string }>('issue/' + key);
            if (!issue.id) throw new Error('issue ' + key + ' has no numeric id');
            return issue.id;
        },
        xrayCloud: {
            getTestSteps: xrayCloud.getTestSteps.bind(xrayCloud),
            getTestPreconditions: xrayCloud.getTestPreconditions.bind(xrayCloud),
            removePreconditionsFromTest: xrayCloud.removePreconditionsFromTest.bind(xrayCloud),
            addPreconditionsToTest: xrayCloud.addPreconditionsToTest.bind(xrayCloud),
            removeAllTestSteps: async (id: string, cid: string, csec: string) => {
                await xrayCloud.setTestSteps(id, [], cid, csec);
            },
            addTestStep: async (
                id: string,
                step: { action: string; data: string; result: string },
                cid: string,
                csec: string,
            ) => {
                await xrayCloud.graphqlMutation(addTestStepMutation, { issueId: id, step }, cid, csec);
            },
        },
        clientId,
        clientSecret,
        linkOps: linkManager.issueLinkService,
    };
}

function testCreationSetup(
    jiraResource: JiraResourceLike,
    jiraResourceXray: JiraResourceLike,
    linkManager: JiraLinkManager,
    targetKeys: string[] = [],
): { stepImporter: XrayStepImporter; factory: TestCaseFactory; linker: IssueLinker; results: TestResult[] } {
    const xrayMode = Config.get('xrayMode');
    const mode: 'server' | 'cloud' = xrayMode === 'cloud' ? 'cloud' : 'server';
    // The step importer resource depends on the mode (root cause of BUG 8, §4):
    //  - Cloud mode: CloudStepImporter resolves the Jira numeric id via
    //    GET issue/{key} — it needs the JIRA resource (base Jira URL).
    //  - Server mode: ServerStepImporter POSTs test/{key}/steps to the Xray
    //    Server base — it needs the XRAY resource.
    // Passing a single hardcoded resource breaks one of the two modes (§7
    // system consistency): server mode got a Jira base URL, cloud mode got an
    // Xray base URL that does not serve `issue/*`.
    const stepImporter = createStepImporter(mode === 'cloud' ? jiraResource : jiraResourceXray, mode);
    const factory = new TestCaseFactory(jiraResource, stepImporter);
    factory.setTargetKeys(targetKeys);
    const snapshotCtx = buildSnapshotContext(jiraResource, linkManager);
    if (snapshotCtx) {
        factory.setSnapshotContext(snapshotCtx);
    }
    // Single-path failure handling (Rule 3/7): always deterministic via ON_ERROR
    // config. No interactive menu, no TTY dependency — manual and --auto share the
    // same tested handler. Transient errors use the xray client's embedded retry.
    const stepFailureHandler = buildAutoConfirmHandler();
    factory.setStepFailureHandler(stepFailureHandler);
    return {
        stepImporter,
        factory,
        linker: new IssueLinker(jiraResource, linkManager, stepFailureHandler),
        results: [],
    };
}

interface RunCreationLoopOptions {
    filtered: TestCase[];
    factory: TestCaseFactory;
    linker: IssueLinker;
    results: TestResult[];
    params: CreateTestsFromTestCasesParams;
    resumeFrom: number;
    opLog: ReturnType<typeof rootLogger.child>;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    importMode: ImportMode;
}

async function runCreationLoop(opts: RunCreationLoopOptions): Promise<FinalizeTestCreationResult | undefined> {
    const {
        filtered,
        factory,
        linker,
        results,
        params,
        resumeFrom,
        opLog,
        inMemoryTasksId,
        inMemoryTasksText,
        importMode,
    } = opts;
    const failedLinks: string[] = [];
    const loopOpts: TestCreationLoopOptions = {
        tests: filtered,
        factory,
        linker,
        projectName: params.project_name,
        jiraLabels: params.jiraLabels,
        ...(params.batchFields ? { batchFields: params.batchFields } : {}),
        baseUrl: params.base_url,
        opLog,
        sourcePath: params.sourcePath,
        sourceType: params.sourceType,
        inMemoryTasksId,
        inMemoryTasksText,
        results,
        resumeFrom,
        isQuiet,
        reportInfo: info,
        reportPrint: print,
        failedLinks,
        importMode,
    };
    await executeTestCreationLoop(loopOpts);
    return finalizeTestCreation({
        results,
        tests: filtered,
        linker,
        inMemoryTasksId,
        inMemoryTasksText,
        parentIssues: [],
        sourcePath: params.sourcePath,
        sourceType: params.sourceType,
        project_name: params.project_name,
        jiraLabels: params.jiraLabels,
        opLog,
        onBusy: params.onBusy,
        info,
        printSummary,
        failedLinks,
    });
}

async function createTestsFromTestCases(
    params: CreateTestsFromTestCasesParams,
): Promise<CreateTestsFromTestCasesResult | undefined> {
    info('Passo 1 de 5: Validando arquivo de entrada...');
    const prepared = await prepareTestRun({
        tests: params.tests,
        sourcePath: params.sourcePath,
        sourceType: params.sourceType,
        project_name: params.project_name,
        jiraLabels: params.jiraLabels,
        ...(params.batchFields ? { batchFields: params.batchFields } : {}),
        onBusy: params.onBusy,
        warn,
        jiraResource: params.jiraResource,
        ...(params.targetKeys && params.targetKeys.length > 0 ? { targetKeys: params.targetKeys } : {}),
        ...(params.importMode ? { importMode: params.importMode } : {}),
    });
    if (prepared === undefined || 'summary' in prepared) {
        if (prepared === undefined) {
            throw new Error(
                'Preparacao da importacao retornou resultado inesperado (undefined). ' +
                    'Verifique os logs anteriores para detalhes.',
            );
        }
        return prepared;
    }
    const { tests: filtered, resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog, targetKeys, importMode } = prepared;

    info('Passo 2 de 5: Preparando criação de testes...');
    const { factory, linker, results } = testCreationSetup(
        params.jiraResource,
        params.jiraResourceXray,
        params.linkManager,
        targetKeys,
    );
    params.onBusy(true);
    opLog.info('Iniciando criação de ' + filtered.length + ' teste(s)');

    info('Passo 3 de 5: Criando testes no Jira...');
    return runCreationLoop({
        filtered,
        factory,
        linker,
        results,
        params,
        resumeFrom,
        opLog,
        inMemoryTasksId,
        inMemoryTasksText,
        importMode,
    });
}

export { createTestsFromTestCases, prepareTestRun, finalizeTestCreation, postProcessCheckpoint, testCreationSetup };
