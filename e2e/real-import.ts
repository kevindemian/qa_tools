import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import CsvResource from '../jira_management/csv_resource';
import createTestsModule = require('../jira_management/create_tests');
const { createTestsFromCsv } = createTestsModule;
import { rootLogger } from '../shared/logger';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.JIRA_BASE_URL;
const XRAY_URL = process.env.XRAY_BASE_URL;
const TOKEN = process.env.JIRA_PERSONAL_TOKEN;

if (!BASE_URL || !XRAY_URL || !TOKEN) {
    console.error('ERRO: .env com JIRA_BASE_URL, XRAY_BASE_URL e JIRA_PERSONAL_TOKEN obrigatorios');
    process.exit(1);
}

const csvPath = path.resolve(__dirname, '../jira_management/teste_real.csv');

process.env.CSV_PATH = csvPath;
process.env.CSV_LABELS = 'e2e';
process.env.AUTO_CONFIRM = 'true';
process.env.ON_ERROR = 'abort';
process.env.JIRA_PROJECT = 'ECSPOL';
process.env.QUIET = 'false';

if (!fs.existsSync(csvPath)) {
    console.error('CSV nao encontrado:', csvPath);
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
        console.log('  [onBusy:', val + ']');
    },
};

async function main() {
    console.log('');
    console.log('='.repeat(60));
    console.log('  IMPORTACAO REAL DE TESTES NO JIRA');
    console.log('  Projeto: ECSPOL');
    console.log('  CSV: ' + csvPath);
    console.log('  Jira: ' + BASE_URL);
    console.log('  Xray: ' + XRAY_URL);
    console.log('='.repeat(60));
    console.log('');

    console.log('Iniciando importacao...');
    const start = Date.now();

    try {
        const result = await createTestsFromCsv(state);

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log('');
        console.log('-'.repeat(60));
        console.log('  RESULTADO (' + elapsed + 's)');
        console.log('-'.repeat(60));
        console.log('  Status:    ' + (result ? result.status : 'undefined'));
        console.log('  Summary:   ' + (result ? result.summary : 'N/A'));
        console.log('  Issues:    ' + (result ? result.inMemoryTasksId.join(', ') : 'N/A'));
        console.log('  Titles:    ' + (result ? result.inMemoryTasksText.join(', ') : 'N/A'));
        console.log('-'.repeat(60));

        if (result && result.status === 'ok') {
            const issues = result.inMemoryTasksId;
            console.log('');
            console.log('  Issues criadas:');
            issues.forEach((id) => console.log('    ' + BASE_URL + '/browse/' + id));
            console.log('');
        }

        process.exit(result && result.status === 'ok' ? 0 : 1);
    } catch (err: unknown) {
        console.error('');
        console.error('ERRO nao tratado durante importacao:');
        console.error('  ' + ((err as { message?: string }).message || err));
        if ((err as { response?: { status?: number; data?: unknown } }).response) {
            const e = err as { response: { status: number; data: unknown } };
            console.error('  Status: ' + e.response.status);
            console.error('  Data:   ' + JSON.stringify(e.response.data).slice(0, 500));
        }
        process.exit(1);
    }
}

main();
