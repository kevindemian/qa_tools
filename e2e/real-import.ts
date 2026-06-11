import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import JiraResource from '../jira_management/jira_resource.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import CsvResource from '../jira_management/csv_resource.js';
import createTestsModule from '../jira_management/create_tests.js';
const { createTestsFromCsv } = createTestsModule;
import { rootLogger } from '../shared/logger.js';
import { gracefulExit } from '../shared/cli_base.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

const envBaseUrl = process.env['JIRA_BASE_URL'];
const envXrayUrl = process.env['XRAY_BASE_URL'];
const envToken = process.env['JIRA_PERSONAL_TOKEN'];

if (!envBaseUrl || !envXrayUrl || !envToken) {
    rootLogger.error('ERRO: .env com JIRA_BASE_URL, XRAY_BASE_URL e JIRA_PERSONAL_TOKEN obrigatorios');
    process.exit(1);
}

const BASE_URL: string = envBaseUrl;
const XRAY_URL: string = envXrayUrl;
const TOKEN: string = envToken;

const csvPath = path.resolve(import.meta.dirname, '../jira_management/teste_real.csv');

process.env['CSV_PATH'] = csvPath;
process.env['CSV_LABELS'] = 'e2e';
process.env['AUTO_CONFIRM'] = 'true';
process.env['ON_ERROR'] = 'abort';
process.env['JIRA_PROJECT'] = 'ECSPOL';
process.env['QUIET'] = 'false';

if (!fs.existsSync(csvPath)) {
    rootLogger.error('CSV nao encontrado:', csvPath);
    process.exit(1);
}

const jiraResource = new JiraResource(TOKEN, BASE_URL + '/rest/api/2');
const jiraResourceXray = new JiraResource(TOKEN, XRAY_URL);
const linkManager = new JiraLinkManager(jiraResource);
const linkManagerXray = new JiraLinkManager(jiraResourceXray);
const csvResource = new CsvResource();

const state = {
    jiraResource,
    jiraResourceXray,
    linkManager,
    linkManagerXray,
    csvResource,
    project_name: 'ECSPOL',
    base_url: BASE_URL,
    sessionLog: rootLogger.child({ session: 'real-import' }),
    onBusy: (val: boolean) => {
        rootLogger.info('  [onBusy:', val + ']');
    },
};

async function main() {
    rootLogger.info('');
    rootLogger.info('='.repeat(60));
    rootLogger.info('  IMPORTACAO REAL DE TESTES NO JIRA');
    rootLogger.info('  Projeto: ECSPOL');
    rootLogger.info('  CSV: ' + csvPath);
    rootLogger.info('  Jira: ' + BASE_URL);
    rootLogger.info('  Xray: ' + XRAY_URL);
    rootLogger.info('='.repeat(60));
    rootLogger.info('');

    rootLogger.info('Iniciando importacao...');
    const start = Date.now();

    try {
        const result = await createTestsFromCsv(state);

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        rootLogger.info('');
        rootLogger.info('-'.repeat(60));
        rootLogger.info('  RESULTADO (' + elapsed + 's)');
        rootLogger.info('-'.repeat(60));
        rootLogger.info('  Status:    ' + (result ? result.status : 'undefined'));
        rootLogger.info('  Summary:   ' + (result ? result.summary : 'N/A'));
        rootLogger.info('  Issues:    ' + (result ? result.inMemoryTasksId.join(', ') : 'N/A'));
        rootLogger.info('  Titles:    ' + (result ? result.inMemoryTasksText.join(', ') : 'N/A'));
        rootLogger.info('-'.repeat(60));

        if (result && result.status === 'ok') {
            const issues = result.inMemoryTasksId;
            rootLogger.info('');
            rootLogger.info('  Issues criadas:');
            issues.forEach((id) => rootLogger.info('    ' + BASE_URL + '/browse/' + id));
            rootLogger.info('');
        }

        gracefulExit(result && result.status === 'ok' ? 0 : 1);
    } catch (err: unknown) {
        rootLogger.error('');
        rootLogger.error('ERRO nao tratado durante importacao:');
        rootLogger.error('  ' + ((err as { message?: string }).message || String(err)));
        if ((err as { response?: { status?: number; data?: unknown } }).response) {
            const e = err as { response: { status: number; data: unknown } };
            rootLogger.error('  Status: ' + e.response.status);
            rootLogger.error('  Data:   ' + JSON.stringify(e.response.data).slice(0, 500));
        }
        gracefulExit(1);
    }
}

void main();
