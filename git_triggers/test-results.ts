import path from 'path';
import AdmZip from 'adm-zip';
import glob from 'glob';
import Config from '../shared/config';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import { warn, info, success, printError, withSpinner, ask } from '../shared/prompt';
import { reportsDir } from '../shared/temp-dir';
import { parseTestResults as detectAndParseTestResults } from '../shared/result_parser';
import type { ParseResult } from '../shared/result_parser';
import { matchResultsToTests, createTestExecutionFromResults } from '../jira_management/result_reporter';
import { saveParseResult } from '../shared/metrics';
import type { GitProvider } from '../shared/types';

function _jiraEnv(): { base: string; token: string; xray: string } | null {
    const base = Config.jiraBaseUrl;
    const token = Config.jiraPersonalToken;
    const xray = Config.xrayBaseUrl;
    if (!base || !token || !xray) return null;
    return { base, token, xray };
}

function _resolveGlob(pattern: string): string | null {
    try {
        const matches = glob.sync(pattern);
        const m = matches[0];
        return m ? path.resolve(m) : null;
    } catch {
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

async function createTestExecution(
    matched: MatchedTestItem[],
    csvName: string,
    jira: { base: string; token: string; xray: string },
    projectName: string,
    pipelineId: string | number,
    branch: string,
    currentProvider: 'gitlab' | 'github',
    pushHistory: (op: string, detail: string, status: string) => void,
): Promise<void> {
    try {
        const te = await withSpinner('Criando Test Execution no Jira...', async () => {
            const jiraRes = new JiraResource(jira.token, jira.base + '/rest/api/2');
            const linkJiraRes = new JiraResource(jira.token, jira.base + '/rest/api/2');
            const linkMgr = new JiraLinkManager(linkJiraRes);
            return createTestExecutionFromResults(jiraRes, linkMgr, projectName, matched, csvName, {
                pipelineId,
                branch,
                provider: currentProvider,
            });
        });
        success('Test Execution criado: ' + jira.base + '/browse/' + te.key);
        success(te.passed + ' passed / ' + te.failed + ' failed / ' + te.skipped + ' skipped');
        pushHistory('resultados', te.key + ': ' + te.passed + '/' + te.failed, 'ok');
    } catch (err) {
        printError('Falha ao criar Test Execution', err);
        pushHistory('resultados', 'erro', 'error');
        throw err;
    }
}

async function collectTestResults(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    currentProvider: 'gitlab' | 'github',
    pushHistory: (op: string, detail: string, status: string) => void,
): Promise<ParseResult | null> {
    const jira = _jiraEnv();
    if (!jira) {
        warn('Variáveis JIRA não configuradas. Defina JIRA_BASE_URL, JIRA_PERSONAL_TOKEN e XRAY_BASE_URL.');
        return null;
    }

    const parsed = await downloadTestArtifacts(m, pipelineId);
    if (!parsed) return null;

    saveParseResult(projectName, parsed);

    const mapping = await parseTestResults(parsed);
    if (!mapping) return parsed;

    await createTestExecution(
        mapping.matched,
        mapping.csvName,
        jira,
        projectName,
        pipelineId,
        branch,
        currentProvider,
        pushHistory,
    );

    return parsed;
}

export { _jiraEnv, _resolveGlob, downloadTestArtifacts, parseTestResults, createTestExecution, collectTestResults };
