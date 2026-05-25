import path from 'path';
import AdmZip from 'adm-zip';
import glob from 'glob';
import Config from '../shared/config';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import { warn, info, success, printError, withSpinner, ask } from '../shared/prompt';
import { load as loadState } from '../shared/state';
import { parseMochawesome } from '../shared/result_parser';
import type { MochawesomeData, ParseResult } from '../shared/result_parser';
import { matchResultsToTests, createTestExecutionFromResults } from '../jira_management/result_reporter';
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
        return matches.length > 0 ? path.resolve(matches[0]) : null;
    } catch {
        return null;
    }
}

async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number) {
    const artifacts = await withSpinner('Buscando artifacts...', () => m.listPipelineArtifacts(pipelineId));
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        warn('Nenhum artifact encontrado na pipeline #' + pipelineId);
        return null;
    }
    const art = artifacts.find((a) => /mochawesome|test-result/i.test(a.name)) || artifacts[0];
    info('Artifact: ' + art.name + ' (id=' + art.id + ')');

    let buffer: Buffer;
    try {
        buffer = await withSpinner('Baixando artifact...', async () => {
            const dl = await m.downloadArtifact(art.id);
            return dl.buffer;
        });
    } catch (err) {
        printError('Falha ao baixar artifact', err);
        return null;
    }

    let jsonData: unknown;
    try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const mochaEntry = entries.find((e) => e.entryName.includes('mochawesome.json') && !e.isDirectory);
        if (!mochaEntry) {
            warn(
                'mochawesome.json não encontrado no artifact. Entradas: ' + entries.map((e) => e.entryName).join(', '),
            );
            return null;
        }
        const raw = mochaEntry.getData().toString('utf8');
        jsonData = JSON.parse(raw);
    } catch (err) {
        printError('Falha ao ler mochawesome.json', err);
        return null;
    }

    const parsed = parseMochawesome(jsonData as MochawesomeData);
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

async function parseTestResults(parsed: ParseResult) {
    const cypressDir = Config.cypressProjectPath || (loadState().lastCypressPath as string) || '';
    const defaultMapping = cypressDir ? path.join(path.resolve(cypressDir), '*jira-mapping.json') : '';
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
) {
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
    }
}

async function collectTestResults(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    currentProvider: 'gitlab' | 'github',
    pushHistory: (op: string, detail: string, status: string) => void,
) {
    const jira = _jiraEnv();
    if (!jira) {
        warn('Variáveis JIRA não configuradas. Defina JIRA_BASE_URL, JIRA_PERSONAL_TOKEN e XRAY_BASE_URL.');
        return;
    }

    const parsed = await downloadTestArtifacts(m, pipelineId);
    if (!parsed) return;

    const mapping = await parseTestResults(parsed);
    if (!mapping) return;

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
}

export { _jiraEnv, _resolveGlob, downloadTestArtifacts, parseTestResults, createTestExecution, collectTestResults };
