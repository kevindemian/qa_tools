/** Test results — collect, parse, and report test results from CI artifacts to Jira. */
import { AdmZip, globSync } from '../shared/deps.js';
import { sanitizePath } from '../shared/path-utils.js';
import Config from '../shared/config.js';
import JiraClient from '../shared/jira-client.js';
import type { JiraMode } from '../shared/jira-auth.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import { warn, info, success, printError, withSpinner, ask } from '../shared/prompt.js';
import { reportsDir } from '../shared/temp-dir.js';
import { parseTestResults as detectAndParseTestResults } from '../shared/result_parser.js';
import type { ParseResult } from '../shared/result_parser.js';
import { matchResultsToTests, createTestExecutionFromResults } from '../jira_management/result_reporter.js';
import { saveParseResult } from '../shared/metrics.js';
import type { GitProvider } from '../shared/types.js';

function _jiraEnv(): { base: string; token: string; xray: string; mode: JiraMode } | null {
    const base = Config.get('jiraBaseUrl');
    const token = Config.get('jiraPersonalToken');
    const xray = Config.get('xrayBaseUrl');
    const mode = Config.get('jiraMode');
    if (!base || !token || !xray) return null;
    return { base, token, xray, mode: mode as JiraMode };
}

function _resolveGlob(pattern: string): string | null {
    try {
        const matches = globSync(pattern);
        const m = matches[0];
        return m ? sanitizePath(process.cwd(), m) : null;
    } catch (err) {
        warn('test-results: glob resolution failed: ' + (err instanceof Error ? err.message : String(err)));
        return null;
    }
}

async function _downloadArtifactBuffer(m: GitProvider, art: { id: number | string }): Promise<Buffer | null> {
    try {
        return await withSpinner('Baixando artifact...', async () => {
            const dl = await m.downloadArtifact(art.id);
            return dl.buffer;
        });
    } catch (err) {
        printError('Falha ao baixar artifact', err);
        return null;
    }
}

function _extractTestResultsFromZip(buffer: Buffer): unknown {
    try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const resultEntry = entries.find((e) => {
            const name = e.entryName.toLowerCase();
            return (name.includes('ctrf.json') || name.includes('mochawesome.json')) && !e.isDirectory;
        });
        if (!resultEntry) {
            warn(
                'Nenhum resultado de teste (ctrf.json / mochawesome.json) encontrado no artifact. Entradas: ' +
                    entries.map((e) => e.entryName).join(', '),
            );
            return null;
        }
        const raw = resultEntry.getData().toString('utf8');
        return JSON.parse(raw);
    } catch (err) {
        printError('Falha ao ler arquivo de resultados', err);
        return null;
    }
}

async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number): Promise<ParseResult | null> {
    const artifacts = await withSpinner('Buscando artifacts...', () => m.listPipelineArtifacts(pipelineId));
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        warn('Nenhum artifact encontrado na pipeline #' + pipelineId);
        return null;
    }
    const art = artifacts.find((a) => /mochawesome|test-result/i.test(a.name)) || artifacts[0];
    if (!art) {
        warn('Nenhum artifact de resultado de teste encontrado.');
        return null;
    }
    info('Artifact: ' + art.name + ' (id=' + art.id + ')');

    const buffer = await _downloadArtifactBuffer(m, art);
    if (!buffer) return null;

    const jsonData = _extractTestResultsFromZip(buffer);
    if (!jsonData) return null;

    const parsed = detectAndParseTestResults(jsonData);
    info(
        'Resultados: ' +
            parsed.stats.passed +
            ' pass, ' +
            parsed.stats.failed +
            ' fail, ' +
            parsed.stats.skipped +
            ' skip',
    );
    if (parsed.tests.length === 0) {
        warn('Nenhum teste encontrado no report.');
        return null;
    }
    return parsed;
}

interface MatchedTestItem {
    key: string;
    title: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
}

async function parseTestResults(
    parsed: ParseResult,
): Promise<{ matched: MatchedTestItem[]; unmatched: Array<{ title: string; state: string }>; csvName: string } | null> {
    const defaultMapping = reportsDir() + '/*jira-mapping.json';
    const mappingPath = await ask('Caminho do mapping JSON', { default: defaultMapping });
    if (!mappingPath.trim()) {
        warn('Mapping necessario para criar Test Execution.');
        return null;
    }

    const resolvedPath = mappingPath.includes('*') ? _resolveGlob(mappingPath) || mappingPath : mappingPath;

    const { matched, unmatched } = matchResultsToTests(parsed.tests, resolvedPath);
    if (matched.length === 0) {
        warn('Nenhum teste pode ser mapeado. Mapping: ' + resolvedPath);
        return null;
    }
    info('Mapeados: ' + matched.length + '/' + parsed.tests.length + ' testes');
    if (unmatched.length > 0) {
        warn(unmatched.length + ' teste(s) não encontrados no mapping');
        unmatched.slice(0, 3).forEach((u: { title?: string }) => warn('  - ' + u.title));
    }

    const csvName =
        resolvedPath
            .replace(/-jira-mapping\.json$/, '')
            .split(/[/\\]/)
            .pop() || 'pipeline';
    return { matched, unmatched, csvName };
}

export interface CreateTestExecutionOptions {
    matched: Array<{ key: string; title: string; status: 'passed' | 'failed' | 'skipped'; duration: number }>;
    csvName: string;
    jiraResource: JiraClient;
    linkManager: JiraLinkManager;
    jiraBaseUrl: string;
    projectName: string;
    pipelineId: string | number;
    branch: string;
    currentProvider: 'gitlab' | 'github';
    pushHistory: (op: string, detail: string, status: string) => void;
    teKey?: string;
}

async function createTestExecution(opts: CreateTestExecutionOptions): Promise<void> {
    const {
        matched,
        csvName,
        jiraResource,
        linkManager,
        jiraBaseUrl,
        projectName,
        pipelineId,
        branch,
        currentProvider,
        pushHistory,
        teKey,
    } = opts;
    try {
        const spinnerMsg = teKey
            ? 'Adicionando resultados ao Test Execution ' + teKey + '...'
            : 'Criando Test Execution no Jira...';
        const te = await withSpinner(spinnerMsg, async () => {
            return createTestExecutionFromResults({
                jiraResource,
                linkManager,
                projectName,
                matchedResults: matched,
                csvName,
                pipelineInfo: { pipelineId, branch, provider: currentProvider },
                ...(teKey ? { existingTeKey: teKey } : {}),
            });
        });
        if (teKey) {
            success('Test Execution atualizado: ' + jiraBaseUrl + '/browse/' + te.key);
        } else {
            success('Test Execution criado: ' + jiraBaseUrl + '/browse/' + te.key);
        }
        success(te.passed + ' passed / ' + te.failed + ' failed / ' + te.skipped + ' skipped');
        pushHistory('resultados', te.key + ': ' + te.passed + '/' + te.failed, 'ok');
    } catch (err) {
        printError('Falha ao criar/atualizar Test Execution', err);
        pushHistory('resultados', 'erro', 'error');
        throw err;
    }
}

export interface CollectTestResultsOptions {
    m: GitProvider;
    pipelineId: string | number;
    branch: string;
    projectName: string;
    currentProvider: 'gitlab' | 'github';
    pushHistory: (op: string, detail: string, status: string) => void;
    teKey?: string;
    jiraResource: JiraClient;
    linkManager: JiraLinkManager;
    jiraBaseUrl: string;
}

async function collectTestResults(opts: CollectTestResultsOptions): Promise<ParseResult | null> {
    const {
        m,
        pipelineId,
        branch,
        projectName,
        currentProvider,
        pushHistory,
        teKey,
        jiraResource,
        linkManager,
        jiraBaseUrl,
    } = opts;

    const parsed = await downloadTestArtifacts(m, pipelineId);
    if (!parsed) return null;

    saveParseResult(projectName, parsed);

    const mapping = await parseTestResults(parsed);
    if (!mapping) return parsed;

    await createTestExecution({
        matched: mapping.matched,
        csvName: mapping.csvName,
        jiraResource,
        linkManager,
        jiraBaseUrl,
        projectName,
        pipelineId,
        branch,
        currentProvider,
        pushHistory,
        ...(teKey ? { teKey } : {}),
    });

    return parsed;
}

export { _jiraEnv, _resolveGlob, downloadTestArtifacts, parseTestResults, createTestExecution, collectTestResults };
