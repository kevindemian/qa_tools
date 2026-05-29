/**
 * E2E real: testa Jira + Xray + GitHub em ambiente prod.
 * Uso: npx ts-node e2e/run-e2e.ts
 *
 * Fases:
 *   1 — Diagnóstico (conexão, ler issues existentes)
 *   2 — Update ECSPOL-1255 description + rollback
 *   3 — Criar CSV + 1 test case novo (label e2e, precond ECSPOL-1202, linked ECSPOL-1255)
 *   4 — Criar Test Execution com ECSPOL-1255 + novo test
 *   5 — Verificar resultados
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import CsvResource from '../jira_management/csv_resource';
import createTestsModule from '../jira_management/create_tests';
import { rootLogger } from '../shared/logger';

const { createTestsFromCsv, createTestExecutionWithLinks } = createTestsModule;

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = process.env.JIRA_BASE_URL!;
const XRAY_URL = process.env.XRAY_BASE_URL!;
const TOKEN = process.env.JIRA_PERSONAL_TOKEN!;
const PROJECT = 'ECSPOL';
const EXISTING_TEST = 'ECSPOL-1255';
const EXISTING_PRECOND = 'ECSPOL-1202';
const LABEL = 'e2e';

// CSV temporário para o novo test case
const CSV_PATH = path.resolve(__dirname, '../e2e/e2e-test-data.csv');

const jiraResource = new JiraResource(TOKEN, BASE_URL + '/rest/api/2');
const jiraResourceXray = new JiraResource(TOKEN, XRAY_URL);
const linkManager = new JiraLinkManager(jiraResource);
const linkManagerXray = new JiraLinkManager(jiraResourceXray);
const csvResource = new CsvResource();
const sessionLog = rootLogger.child({ session: 'e2e-real' });

let passed = 0;
let failed = 0;
let createdIssueKey: string | null = null;
let createdTestExecKey: string | null = null;
let originalDescription: string | null = null;

function ok(label: string) {
    console.log(`  ✅ ${label}`);
    passed++;
}
function fail(label: string, detail?: string) {
    console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
}
function section(title: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'='.repeat(60)}`);
}

// ── Helpers ─────────────────────────────────────────────────────
async function getIssueRaw(key: string): Promise<unknown> {
    return jiraResource.getJiraResource(`issue/${key}?fields=summary,description,labels,issuetype,customfield_13708`);
}

async function getSteps(issueKey: string): Promise<unknown[]> {
    const steps = await jiraResourceXray.getJiraResource(`test/${issueKey}/steps`);
    return (steps as unknown).steps || [];
}

// ── Fase 1: Diagnóstico ────────────────────────────────────────
async function fase1Diagnostico() {
    section('FASE 1 — Diagnóstico');

    try {
        const myself = await jiraResource.getJiraResource<{ displayName: string; emailAddress: string }>('myself');
        ok(`Autenticado como: ${myself.displayName} (${myself.emailAddress})`);
    } catch (e: unknown) {
        fail('Autenticação Jira', e.message);
        return false;
    }

    try {
        const issue = await getIssueRaw(EXISTING_TEST);
        const f = issue.fields;
        originalDescription = f.description || '';
        ok(`Test ${EXISTING_TEST} lido: "${f.summary}"`);
        if (f.labels?.includes(LABEL)) ok(`Label "${LABEL}" presente`);
        else fail(`Label "${LABEL}" ausente em ${EXISTING_TEST}`);
        if (f.issuetype?.name === 'Test') ok(`Issue type = Test`);
        else fail(`Issue type = ${f.issuetype?.name}`);
        if (f.customfield_13708?.includes(EXISTING_PRECOND)) ok(`Pre-condition ${EXISTING_PRECOND} linkada`);
        else fail(`Pre-condition não encontrada`);
    } catch (e: unknown) {
        fail(`Ler ${EXISTING_TEST}`, e.message);
        return false;
    }

    try {
        const steps = await getSteps(EXISTING_TEST);
        ok(`Steps: ${steps.length} steps em ${EXISTING_TEST}`);
    } catch (e: unknown) {
        fail(`Ler steps de ${EXISTING_TEST}`, e.message);
    }

    try {
        const prec = await getIssueRaw(EXISTING_PRECOND);
        ok(`Pre-condition ${EXISTING_PRECOND} lida: "${prec.fields.summary}"`);
    } catch (e: unknown) {
        fail(`Ler ${EXISTING_PRECOND}`, e.message);
    }

    try {
        const projectData = await jiraResource.getJiraResource<{ id: string; name: string }>(`project/${PROJECT}`);
        ok(`Projeto ${PROJECT} OK (id=${projectData.id})`);
    } catch (e: unknown) {
        fail(`Projeto ${PROJECT}`, e.message);
    }

    return true;
}

// ── Fase 2: Update + Rollback ──────────────────────────────────
async function fase2UpdateRollback() {
    section('FASE 2 — Update + Rollback ECSPOL-1255');

    const testDesc = `[E2E TEST] Modificado em ${new Date().toISOString()} — será revertido em segundos.`;

    // Salvar description original (já salva em fase1, mas vamos confirmar)
    if (!originalDescription) {
        // already saved in fase1
        return;
    }

    // Update
    try {
        await jiraResource.putJiraResource(`issue/${EXISTING_TEST}`, {
            fields: { description: testDesc },
        });
        ok(`PUT description = "${testDesc}"`);
    } catch (e: unknown) {
        fail('PUT description', e.message);
        return;
    }

    // Verificar
    try {
        const issue2 = await getIssueRaw(EXISTING_TEST);
        const newDesc = issue2.fields.description || '';
        if (newDesc === testDesc) ok('Description atualizada confirmada via GET');
        else fail(`Description mismatch: "${newDesc.slice(0, 80)}..."`);
    } catch (e: unknown) {
        fail('GET após update', e.message);
    }

    // Rollback
    try {
        await jiraResource.putJiraResource(`issue/${EXISTING_TEST}`, {
            fields: { description: originalDescription },
        });
        ok(`Rollback description = "${originalDescription.slice(0, 80)}..."`);
    } catch (e: unknown) {
        fail('Rollback PUT', e.message);
    }

    // Confirmar rollback
    try {
        const issue3 = await getIssueRaw(EXISTING_TEST);
        const finalDesc = issue3.fields.description || '';
        if (finalDesc === originalDescription) ok('Rollback confirmado via GET');
        else fail('Rollback não refletido');
    } catch (e: unknown) {
        fail('GET após rollback', e.message);
    }
}

// ── Fase 3: Criar CSV + Test Case ──────────────────────────────
function criarCsv() {
    const csvContent =
        [
            'Title: TC E2E - Teste automatizado de integracao',
            'Description: Teste criado pelo e2e real para validar pipeline CSV -> Jira -> Xray',
            'Pre-condition: ' + EXISTING_PRECOND,
            'Linked Issues: ' + EXISTING_TEST + ' (is a test for)',
            'Group: E2E-TEST',
            'Action,Data,Expected Result',
            'Acessar sistema,E2E-URL,Sistema carregado',
            'Executar acao de teste,,Acao concluida',
            'Validar resultado,,Resultado conforme esperado',
        ].join('\n') + '\n';

    fs.writeFileSync(CSV_PATH, csvContent, 'utf8');
    console.log(`  CSV criado: ${CSV_PATH}`);
}

async function fase3CriarTest() {
    section('FASE 3 — Criar Test Case via CSV');

    process.env.CSV_PATH = CSV_PATH;
    process.env.CSV_LABELS = LABEL;
    process.env.AUTO_CONFIRM = 'true';
    process.env.ON_ERROR = 'abort';
    process.env.QUIET = 'true';

    try {
        const result = await createTestsFromCsv({
            jiraResource,
            jiraResourceXray,
            linkManager,
            linkManagerXray,
            csvResource,
            project_name: PROJECT,
            base_url: BASE_URL,
            sessionLog,
            onBusy: (_val: boolean) => {},
            csvPath: CSV_PATH,
            jiraLabels: [LABEL],
        });

        if (result && result.status === 'ok' && result.inMemoryTasksId.length > 0) {
            createdIssueKey = result.inMemoryTasksId[0]!;
            ok(`Test criado: ${createdIssueKey} — "${result.inMemoryTasksText[0]}"`);
            console.log(`  ${BASE_URL}/browse/${createdIssueKey}`);
            return true;
        } else {
            fail('createTestsFromCsv', result ? `status=${result.status}` : 'undefined');
            return false;
        }
    } catch (e: unknown) {
        fail('createTestsFromCsv exception', e.message);
        if (e.response) {
            console.log(`  Status: ${e.response.status}`);
            console.log(`  Data: ${JSON.stringify(e.response.data).slice(0, 400)}`);
        }
        return false;
    }
}

// ── Fase 4: Criar Test Execution ───────────────────────────────
async function fase4CriarTestExecution() {
    section('FASE 4 — Criar Test Execution');

    const testKeys = [EXISTING_TEST];
    if (createdIssueKey) testKeys.push(createdIssueKey);

    try {
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const result = await createTestExecutionWithLinks(jiraResource, linkManager, PROJECT, testKeys, 'E2E-Smoke', {
            title: `E2E Smoke - ${timestamp}`,
            description: 'Teste automatizado e2e - qa_tools',
        });
        if (result && result.key) {
            createdTestExecKey = result.key;
            ok(`Test Execution criada: ${result.key}`);
            console.log(`  ${BASE_URL}/browse/${result.key}`);
            console.log(`  Summary: ${result.summary}`);
        } else {
            fail('createTestExecutionWithLinks retornou sem key');
        }
    } catch (e: unknown) {
        fail('createTestExecutionWithLinks', e.message);
        if (e.response) {
            console.log(`  Status: ${e.response.status}`);
            console.log(`  Data: ${JSON.stringify(e.response.data).slice(0, 400)}`);
        }
    }
}

// ── Fase 5: Verificação ────────────────────────────────────────
async function fase5Verificar() {
    section('FASE 5 — Verificação Final');

    let allOk = true;

    // Verificar novo test case
    if (createdIssueKey) {
        try {
            const issue = await getIssueRaw(createdIssueKey);
            const f = issue.fields;
            ok(`${createdIssueKey} existe, type=${f.issuetype?.name}`);
            if (f.labels?.includes(LABEL)) ok(`Label "${LABEL}" presente`);
            else fail(`Label "${LABEL}" ausente`);
            if (f.customfield_13708?.includes(EXISTING_PRECOND)) ok(`Pre-condition ${EXISTING_PRECOND} linkada`);
            else fail(`Pre-condition ausente`);
            console.log(`  Summary: ${f.summary}`);
            console.log(`  Description: ${(f.description || '').slice(0, 100)}`);

            // Verificar steps
            const steps = await getSteps(createdIssueKey);
            ok(`Steps: ${steps.length} steps`);
            for (const s of steps) {
                const a = s.fields?.Action?.value?.raw || '';
                const e = s.fields?.['Expected Result']?.value?.raw || '';
                console.log(`    Step ${s.index}: ${a} → ${e}`);
            }
        } catch (e: unknown) {
            fail(`Verificar ${createdIssueKey}`, e.message);
            allOk = false;
        }
    }

    // Verificar Test Execution
    if (createdTestExecKey) {
        try {
            const te = await jiraResource.getJiraResource<{
                fields: {
                    summary: string;
                    issuelinks?: Array<{ outwardIssue?: { key: string } }>;
                };
            }>(`issue/${createdTestExecKey}?fields=summary,issuelinks`);

            const links = te.fields?.issuelinks || [];
            const linkedKeys = links.map((l) => l.outwardIssue?.key).filter(Boolean);
            ok(`TE ${createdTestExecKey} criada: "${te.fields?.summary}"`);
            ok(`TE contém ${linkedKeys.length} link(s): ${linkedKeys.join(', ')}`);
            const found1255 = linkedKeys.includes(EXISTING_TEST);
            const foundNew = createdIssueKey ? linkedKeys.includes(createdIssueKey) : false;
            if (found1255) ok(`TE contém ${EXISTING_TEST}`);
            else fail(`TE não contém ${EXISTING_TEST}`);
            if (foundNew) ok(`TE contém ${createdIssueKey}`);
        } catch (e: unknown) {
            fail(`Verificar ${createdTestExecKey}`, e.message);
            allOk = false;
        }
    }

    return allOk;
}

// ── Fase 6: Xray History (bônus) ───────────────────────────────
async function fase6XrayHistory() {
    section('FASE 6 — Xray History (bônus)');
    try {
        const { createHistoryProvider } = await import('../jira_management/xray-history.js');
        const history = createHistoryProvider(jiraResource, 'server');
        const result = await history.getHistory(EXISTING_TEST);
        if (result.length > 0) {
            ok(`History para ${EXISTING_TEST}: ${result.length} entrada(s)`);
            result.slice(0, 3).forEach((h: unknown) => {
                console.log(`    ${h.date || '?'}: ${h.status || h.evolution || 'N/A'}`);
            });
        } else {
            // Pode não ter histórico ainda
            console.log(`  ℹ️ Nenhum histórico encontrado para ${EXISTING_TEST} (pode ser normal)`);
        }
    } catch (e: unknown) {
        // Xray history pode não estar disponível dependendo da versão
        console.log(`  ℹ️ XrayHistory indisponível: ${e.message}`);
    }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`  QA TOOLS — E2E REAL EM PRODUÇÃO`);
    console.log(`  Jira: ${BASE_URL}`);
    console.log(`  Projeto: ${PROJECT}`);
    console.log(`  Issues: ${EXISTING_TEST}, ${EXISTING_PRECOND}`);
    console.log(`  Data: ${new Date().toISOString()}`);
    console.log(`${'#'.repeat(60)}\n`);

    try {
        await fase1Diagnostico();
        await fase2UpdateRollback();
        criarCsv();
        const criou = await fase3CriarTest();
        if (criou) {
            await fase4CriarTestExecution();
        } else {
            fail('Fase 3 falhou — pulando Fase 4');
        }
        await fase5Verificar();
        await fase6XrayHistory();
    } catch (e: unknown) {
        fail('ERRO INESPERADO', e.message);
        console.error(e);
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
    if (createdIssueKey) console.log(`  Novo test: ${BASE_URL}/browse/${createdIssueKey}`);
    if (createdTestExecKey) console.log(`  TE criada: ${BASE_URL}/browse/${createdTestExecKey}`);
    console.log(`${'='.repeat(60)}\n`);

    // Cleanup CSV
    if (fs.existsSync(CSV_PATH)) {
        fs.unlinkSync(CSV_PATH);
    }

    process.exit(failed > 0 ? 1 : 0);
}

void main();
