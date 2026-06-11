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
import JiraResource from '../jira_management/jira_resource.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import TestExecutionCreator from '../jira_management/test-execution-creator.js';
import CsvResource from '../jira_management/csv_resource.js';
import createTestsModule from '../jira_management/create_tests.js';
import { rootLogger } from '../shared/logger.js';
import { gracefulExit } from '../shared/cli_base.js';

const { createTestsFromCsv, createTestExecutionWithLinks } = createTestsModule;

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

// ── Config ─────────────────────────────────────────────────────
const BASE_URL = process.env['JIRA_BASE_URL'] ?? '';
const XRAY_URL = process.env['XRAY_BASE_URL'] ?? '';
const TOKEN = process.env['JIRA_PERSONAL_TOKEN'] ?? '';
if (!BASE_URL || !XRAY_URL || !TOKEN) {
    rootLogger.error('Missing required env vars: JIRA_BASE_URL, XRAY_BASE_URL, JIRA_PERSONAL_TOKEN');
    gracefulExit(1);
}
const PROJECT = 'ECSPOL';
const EXISTING_TEST = 'ECSPOL-1255';
const EXISTING_PRECOND = 'ECSPOL-1202';
const LABEL = 'e2e';

// CSV temporário para o novo test case
const CSV_PATH = path.resolve(import.meta.dirname, '../e2e/e2e-test-data.csv');

const jiraResource = new JiraResource(TOKEN, BASE_URL + '/rest/api/2');
const jiraResourceXray = new JiraResource(TOKEN, XRAY_URL);
const linkManager = new JiraLinkManager(jiraResource);
const linkManagerXray = new JiraLinkManager(jiraResourceXray);
const testExecutionCreator = new TestExecutionCreator(jiraResource, linkManager);
const csvResource = new CsvResource();
const sessionLog = rootLogger.child({ session: 'e2e-real' });

let passed = 0;
let failed = 0;
let createdIssueKey: string | null = null;
let createdTestExecKey: string | null = null;
let originalDescription: string | null = null;

function ok(label: string) {
    process.stdout.write(`  ✅ ${label}` + '\n');
    passed++;
}
function fail(label: string, detail?: string) {
    process.stdout.write(`  ❌ ${label}${detail ? ': ' + detail : ''}` + '\n');
    failed++;
}
function section(title: string) {
    process.stdout.write(`\n${'='.repeat(60)}` + '\n');
    process.stdout.write(`  ${title}` + '\n');
    process.stdout.write(`${'='.repeat(60)}` + '\n');
}

// ── Helpers ─────────────────────────────────────────────────────
async function getIssueRaw(key: string): Promise<Record<string, unknown>> {
    return jiraResource.getJiraResource<Record<string, unknown>>(
        `issue/${key}?fields=summary,description,labels,issuetype,customfield_13708`,
    );
}

async function getSteps(issueKey: string): Promise<unknown[]> {
    const response = await jiraResourceXray.getJiraResource<{ steps?: unknown[] }>(`test/${issueKey}/steps`);
    return response.steps || [];
}

// ── Fase 1: Diagnóstico ────────────────────────────────────────
async function checkAuthentication(): Promise<boolean> {
    try {
        const myself = await jiraResource.getJiraResource<{ displayName: string; emailAddress: string }>('myself');
        ok(`Autenticado como: ${myself.displayName} (${myself.emailAddress})`);
        return true;
    } catch (e: unknown) {
        fail('Autenticação Jira', (e as Error).message);
        return false;
    }
}

async function readExistingTest(): Promise<boolean> {
    try {
        const issue = await getIssueRaw(EXISTING_TEST);
        const f = issue['fields'] as Record<string, unknown> | undefined;
        if (!f) {
            fail('issue.fields missing');
            return false;
        }
        originalDescription = (f['description'] as string) || '';
        ok(`Test ${EXISTING_TEST} lido: "${f['summary'] as string}"`);
        if ((f['labels'] as string[]).includes(LABEL)) ok(`Label "${LABEL}" presente`);
        else fail(`Label "${LABEL}" ausente em ${EXISTING_TEST}`);
        if ((f['issuetype'] as Record<string, string>)['name'] === 'Test') ok(`Issue type = Test`);
        else fail(`Issue type = ${(f['issuetype'] as Record<string, string>)['name']}`);
        if ((f['customfield_13708'] as string[]).includes(EXISTING_PRECOND))
            ok(`Pre-condition ${EXISTING_PRECOND} linkada`);
        else fail(`Pre-condition não encontrada`);
        return true;
    } catch (e: unknown) {
        fail(`Ler ${EXISTING_TEST}`, (e as Error).message);
        return false;
    }
}

async function checkTestSteps(): Promise<void> {
    try {
        const steps = await getSteps(EXISTING_TEST);
        ok(`Steps: ${steps.length} steps em ${EXISTING_TEST}`);
    } catch (e: unknown) {
        fail(`Ler steps de ${EXISTING_TEST}`, (e as Error).message);
    }
}

async function checkPrecondition(): Promise<void> {
    try {
        const prec = await getIssueRaw(EXISTING_PRECOND);
        const precFields = prec['fields'] as Record<string, unknown>;
        ok(`Pre-condition ${EXISTING_PRECOND} lida: "${precFields['summary'] as string}"`);
    } catch (e: unknown) {
        fail(`Ler ${EXISTING_PRECOND}`, (e as Error).message);
    }
}

async function checkProject(): Promise<void> {
    try {
        const projectData = await jiraResource.getJiraResource<{ id: string; name: string }>(`project/${PROJECT}`);
        ok(`Projeto ${PROJECT} OK (id=${projectData.id})`);
    } catch (e: unknown) {
        fail(`Projeto ${PROJECT}`, (e as Error).message);
    }
}

async function fase1Diagnostico() {
    section('FASE 1 — Diagnóstico');

    if (!(await checkAuthentication())) return false;
    if (!(await readExistingTest())) return false;
    await checkTestSteps();
    await checkPrecondition();
    await checkProject();

    return true;
}

// ── Fase 2: Update + Rollback ──────────────────────────────────
async function updateDescription(testDesc: string): Promise<boolean> {
    try {
        await jiraResource.putJiraResource(`issue/${EXISTING_TEST}`, {
            fields: { description: testDesc },
        });
        ok(`PUT description = "${testDesc}"`);
        return true;
    } catch (e: unknown) {
        fail('PUT description', (e as Error).message);
        return false;
    }
}

async function verifyUpdateApplied(testDesc: string): Promise<void> {
    try {
        const issue2 = await getIssueRaw(EXISTING_TEST);
        const f2 = issue2['fields'] as Record<string, unknown>;
        const newDesc = (f2['description'] as string) || '';
        if (newDesc === testDesc) ok('Description atualizada confirmada via GET');
        else fail(`Description mismatch: "${newDesc.slice(0, 80)}..."`);
    } catch (e: unknown) {
        fail('GET após update', (e as Error).message);
    }
}

async function rollbackDescription(): Promise<void> {
    try {
        await jiraResource.putJiraResource(`issue/${EXISTING_TEST}`, {
            fields: { description: originalDescription ?? '' },
        });
        ok(`Rollback description = "${(originalDescription ?? '').slice(0, 80)}..."`);
    } catch (e: unknown) {
        fail('Rollback PUT', (e as Error).message);
    }
}

async function verifyRollbackApplied(): Promise<void> {
    try {
        const issue3 = await getIssueRaw(EXISTING_TEST);
        const f3 = issue3['fields'] as Record<string, unknown>;
        const finalDesc = (f3['description'] as string) || '';
        if (finalDesc === originalDescription) ok('Rollback confirmado via GET');
        else fail('Rollback não refletido');
    } catch (e: unknown) {
        fail('GET após rollback', (e as Error).message);
    }
}

async function fase2UpdateRollback() {
    section('FASE 2 — Update + Rollback ECSPOL-1255');

    if (!originalDescription) return;

    const testDesc = `[E2E TEST] Modificado em ${new Date().toISOString()} — será revertido em segundos.`;

    if (await updateDescription(testDesc)) {
        await verifyUpdateApplied(testDesc);
    }
    await rollbackDescription();
    await verifyRollbackApplied();
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
    process.stdout.write(`  CSV criado: ${CSV_PATH}` + '\n');
}

async function fase3CriarTest() {
    section('FASE 3 — Criar Test Case via CSV');

    process.env['CSV_PATH'] = CSV_PATH;
    process.env['CSV_LABELS'] = LABEL;
    process.env['AUTO_CONFIRM'] = 'true';
    process.env['ON_ERROR'] = 'abort';
    process.env['QUIET'] = 'true';

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
            createdIssueKey = result.inMemoryTasksId[0] ?? null;
            ok(`Test criado: ${createdIssueKey} — "${result.inMemoryTasksText[0]}"`);
            process.stdout.write(`  ${BASE_URL}/browse/${createdIssueKey}` + '\n');
            return true;
        } else {
            fail('createTestsFromCsv', result ? `status=${result.status}` : 'undefined');
            return false;
        }
    } catch (e: unknown) {
        const err = e as Error & { response?: { status?: number; data?: unknown } };
        fail('createTestsFromCsv exception', err.message);
        if (err.response) {
            process.stdout.write(`  Status: ${err.response.status}` + '\n');
            process.stdout.write(`  Data: ${JSON.stringify(err.response.data).slice(0, 400)}` + '\n');
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
        const result = await createTestExecutionWithLinks({
            testExecutionCreator,
            projectName: PROJECT,
            testKeys,
            csvName: 'E2E-Smoke',
            execOpts: {
                title: `E2E Smoke - ${timestamp}`,
                description: 'Teste automatizado e2e - qa_tools',
            },
        });
        if (result && result.key) {
            createdTestExecKey = result.key;
            ok(`Test Execution criada: ${result.key}`);
            process.stdout.write(`  ${BASE_URL}/browse/${result.key}` + '\n');
            process.stdout.write(`  Summary: ${result.summary}` + '\n');
        } else {
            fail('createTestExecutionWithLinks retornou sem key');
        }
    } catch (e: unknown) {
        const err = e as Error & { response?: { status?: number; data?: unknown } };
        fail('createTestExecutionWithLinks', err.message);
        if (err.response) {
            process.stdout.write(`  Status: ${err.response.status}` + '\n');
            process.stdout.write(`  Data: ${JSON.stringify(err.response.data).slice(0, 400)}` + '\n');
        }
    }
}

// ── Fase 5: Verificação ────────────────────────────────────────
async function verifyNewTestCase(): Promise<boolean> {
    if (!createdIssueKey) return true;

    try {
        const issue = await getIssueRaw(createdIssueKey);
        const f = issue['fields'] as Record<string, unknown> | undefined;
        if (!f) {
            fail('issue.fields missing');
            return false;
        }
        ok(`${createdIssueKey} existe, type=${(f['issuetype'] as Record<string, string>)['name']}`);
        if ((f['labels'] as string[]).includes(LABEL)) ok(`Label "${LABEL}" presente`);
        else fail(`Label "${LABEL}" ausente`);
        if ((f['customfield_13708'] as string[]).includes(EXISTING_PRECOND))
            ok(`Pre-condition ${EXISTING_PRECOND} linkada`);
        else fail(`Pre-condition ausente`);
        process.stdout.write(`  Summary: ${f['summary'] as string}` + '\n');
        process.stdout.write(`  Description: ${((f['description'] as string) || '').slice(0, 100)}` + '\n');

        const steps = (await getSteps(createdIssueKey)) as unknown as Record<string, unknown>[];
        ok(`Steps: ${steps.length} steps`);
        for (const s of steps) {
            const fields = s['fields'] as Record<string, unknown> | undefined;
            const a =
                ((fields?.['Action'] as Record<string, unknown> | undefined)?.['value'] as string | undefined) ?? '';
            const e =
                ((fields?.['Expected Result'] as Record<string, unknown> | undefined)?.['value'] as
                    | string
                    | undefined) ?? '';
            process.stdout.write(`    Step ${String(s['index'])}: ${a} → ${e}` + '\n');
        }
        return true;
    } catch (e: unknown) {
        fail(`Verificar ${createdIssueKey}`, (e as Error).message);
        return false;
    }
}

async function verifyTestExecution(): Promise<boolean> {
    if (!createdTestExecKey) return true;

    try {
        const te = await jiraResource.getJiraResource<{
            fields: {
                summary: string;
                issuelinks?: Array<{ outwardIssue?: { key: string } }>;
            };
        }>(`issue/${createdTestExecKey}?fields=summary,issuelinks`);

        const links = te.fields.issuelinks || [];
        const linkedKeys = links.map((l) => l.outwardIssue?.key).filter(Boolean);
        ok(`TE ${createdTestExecKey} criada: "${te.fields.summary}"`);
        ok(`TE contém ${linkedKeys.length} link(s): ${linkedKeys.join(', ')}`);
        const found1255 = linkedKeys.includes(EXISTING_TEST);
        const foundNew = createdIssueKey ? linkedKeys.includes(createdIssueKey) : false;
        if (found1255) ok(`TE contém ${EXISTING_TEST}`);
        else fail(`TE não contém ${EXISTING_TEST}`);
        if (foundNew) ok(`TE contém ${createdIssueKey}`);
        return true;
    } catch (e: unknown) {
        fail(`Verificar ${createdTestExecKey}`, (e as Error).message);
        return false;
    }
}

async function fase5Verificar() {
    section('FASE 5 — Verificação Final');

    let allOk = true;
    if (!(await verifyNewTestCase())) allOk = false;
    if (!(await verifyTestExecution())) allOk = false;
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
            result.slice(0, 3).forEach((h) => {
                const entry = h as unknown as Record<string, unknown>;
                const entryDate = typeof entry['date'] === 'string' ? entry['date'] : '?';
                const entryStatus =
                    typeof entry['status'] === 'string'
                        ? entry['status']
                        : typeof entry['evolution'] === 'string'
                          ? entry['evolution']
                          : 'N/A';
                process.stdout.write(`    ${entryDate}: ${entryStatus}` + '\n');
            });
        } else {
            process.stdout.write(`  ℹ️ Nenhum histórico encontrado para ${EXISTING_TEST} (pode ser normal)` + '\n');
        }
    } catch (e: unknown) {
        process.stdout.write(`  ℹ️ XrayHistory indisponível: ${(e as Error).message}` + '\n');
    }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
    process.stdout.write(`\n${'#'.repeat(60)}` + '\n');
    process.stdout.write(`  QA TOOLS — E2E REAL EM PRODUÇÃO` + '\n');
    process.stdout.write(`  Jira: ${BASE_URL}` + '\n');
    process.stdout.write(`  Projeto: ${PROJECT}` + '\n');
    process.stdout.write(`  Issues: ${EXISTING_TEST}, ${EXISTING_PRECOND}` + '\n');
    process.stdout.write(`  Data: ${new Date().toISOString()}` + '\n');
    process.stdout.write(`${'#'.repeat(60)}\n` + '\n');

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
        fail('ERRO INESPERADO', (e as Error).message);
        process.stderr.write(String(e) + '\n');
    }

    // Summary
    process.stdout.write(`\n${'='.repeat(60)}` + '\n');
    process.stdout.write(`  RESULTADO: ${passed} passed, ${failed} failed` + '\n');
    if (createdIssueKey) process.stdout.write(`  Novo test: ${BASE_URL}/browse/${createdIssueKey}` + '\n');
    if (createdTestExecKey) process.stdout.write(`  TE criada: ${BASE_URL}/browse/${createdTestExecKey}` + '\n');
    process.stdout.write(`${'='.repeat(60)}\n` + '\n');

    // Cleanup CSV
    if (fs.existsSync(CSV_PATH)) {
        fs.unlinkSync(CSV_PATH);
    }

    process.exit(failed > 0 ? 1 : 0);
}

void main();
