import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { md } from '../shared/markdown';
import Config from '../shared/config';
import type { JsonObject, TestCase } from '../shared/types';
import { isPreconditionKey } from '../shared/quoted-string';
import TestCaseValidator from './test-case-validator';
import { rootLogger } from '../shared/logger';
import { load as loadState } from '../shared/state';
import { OPERATION_CANCELLED } from './constants';
import { confirm, info, warn, print, title, divider, prompt, error, printSummary, ask } from '../shared/prompt';

const csvDefaultPath = Config.csvDefaultPath || path.join(__dirname, 'test_steps.csv');

function _checkResumeCheckpoint(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): { resumeFrom: number; inMemoryTasksId: string[]; inMemoryTasksText: string[] } {
    const cp = loadState()._checkpoint as JsonObject | undefined;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    let resumeFrom = 0;
    const inMemoryTasksId: string[] = [];
    const inMemoryTasksText: string[] = [];

    if (
        cp &&
        cp[cpKey] === sourcePath &&
        cp.project === projectName &&
        cp.testCount === tests.length &&
        Array.isArray(cp.done)
    ) {
        const age = Date.now() - new Date((cp.ts as string) ?? '').getTime();
        if (age < 86400000 && (cp.done as Array<unknown>).length < tests.length) {
            const ans = confirm(
                (cp.done as Array<unknown>).length + '/' + tests.length + ' testes ja criados. Continuar?',
                true,
            );
            if (ans) {
                resumeFrom = (cp.done as Array<{ key: string; title: string }>).length;
                for (const d of cp.done as Array<{ key: string; title: string }>) {
                    inMemoryTasksId.push(d.key);
                    inMemoryTasksText.push(d.title);
                }
                info('Retomando do teste ' + (resumeFrom + 1) + '...');
            }
        }
    }

    return { resumeFrom, inMemoryTasksId, inMemoryTasksText };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _renderHtmlHead(): string {
    return (
        '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n' +
        '<title>Preview — Importação de Testes</title>\n' +
        '<style>\n' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#f9fafb;color:#111827;}\n' +
        'h1{font-size:1.25rem;margin:0 0 16px 0;color:#111827;}\n' +
        '.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;}\n' +
        '.card{background:#fff;border-radius:6px;padding:12px 16px;box-shadow:0 1px 2px rgba(0,0,0,0.06);min-width:80px;flex:1;}\n' +
        '.card .lbl{font-size:0.65rem;text-transform:uppercase;color:#9ca3af;letter-spacing:0.5px;}\n' +
        '.card .val{font-size:1.25rem;font-weight:700;margin-top:2px;}\n' +
        '.card .val.sub{font-size:0.85rem;font-weight:400;color:#6b7280;word-break:break-all;}\n' +
        '.test-card{background:#fff;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.06);margin-bottom:10px;border-left:4px solid #e5e7eb;overflow:hidden;}\n' +
        '.test-card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.1);}\n' +
        '.card-header{padding:10px 14px;display:flex;align-items:center;gap:8px;background:#fafbfc;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;}\n' +
        '.card-header .num{color:#9ca3af;font-size:0.75rem;font-weight:600;min-width:24px;}\n' +
        '.card-header .ttl{font-weight:600;font-size:0.9rem;flex:1;}\n' +
        '.card-header .badge{display:inline-block;background:#e5e7eb;padding:1px 7px;border-radius:9999px;font-size:0.7rem;font-weight:600;color:#374151;white-space:nowrap;}\n' +
        '.card-header .badge.group{background:#dbeafe;color:#1d4ed8;}\n' +
        '.card-body{padding:10px 14px;font-size:0.8rem;line-height:1.5;}\n' +
        '.card-body .desc{color:#4b5563;margin-bottom:8px;}\n' +
        '.card-body .desc.empty{color:#d1d5db;font-style:italic;}\n' +
        '.steps{margin:8px 0;padding:0;list-style:none;}\n' +
        '.steps li{padding:4px 0;border-bottom:1px solid #f9fafb;}\n' +
        '.steps li:last-child{border-bottom:none;}\n' +
        '.steps .action{color:#111827;font-weight:500;}\n' +
        '.steps .data{color:#6b7280;margin-left:12px;}\n' +
        '.steps .expected{color:#059669;margin-left:12px;}\n' +
        '.steps .label{color:#9ca3af;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.3px;display:inline-block;min-width:60px;}\n' +
        '.meta{display:flex;gap:12px;flex-wrap:wrap;font-size:0.75rem;color:#6b7280;margin-top:6px;border-top:1px solid #f3f4f6;padding-top:6px;}\n' +
        '.meta .mlbl{color:#9ca3af;}\n' +
        '.footer{margin-top:12px;font-size:0.7rem;color:#9ca3af;text-align:center;}\n' +
        '</style>\n</head>\n<body>\n'
    );
}

function _renderSummaryCards(tests: TestCase[], jiraLabels: string[], totalSteps: number, groupsCount: number): string {
    const labelText =
        jiraLabels.length <= 3
            ? jiraLabels.join(', ')
            : jiraLabels.slice(0, 3).join(', ') + ' +' + (jiraLabels.length - 3);
    let html = '<h1>Preview dos testes a serem criados</h1>\n<div class="summary">\n';
    html += '<div class="card"><div class="lbl">Testes</div><div class="val">' + tests.length + '</div></div>\n';
    html += '<div class="card"><div class="lbl">Steps</div><div class="val">' + totalSteps + '</div></div>\n';
    if (groupsCount > 0) {
        html += '<div class="card"><div class="lbl">Grupos</div><div class="val">' + groupsCount + '</div></div>\n';
    }
    if (jiraLabels.length > 0) {
        html +=
            '<div class="card"><div class="lbl">Labels</div><div class="val sub">' +
            escapeHtml(labelText) +
            '</div></div>\n';
    }
    html += '</div>\n';
    return html;
}

function _renderTestCard(test: TestCase, index: number): string {
    const t = test;
    let html = '<div class="test-card">\n<div class="card-header">\n';
    html += '<span class="num">#' + (index + 1) + '</span>';
    html += '<span class="ttl">' + escapeHtml(t.title) + '</span>';
    if (t.group) {
        html += '<span class="badge group">' + escapeHtml(t.group) + '</span>';
    }
    html += '<span class="badge">' + t.steps.length + ' step(s)</span>';
    html += '</div>\n<div class="card-body">\n';

    html += t.description
        ? '<div class="desc">' + escapeHtml(t.description) + '</div>\n'
        : '<div class="desc empty">—</div>\n';

    html += '<ul class="steps">\n';
    for (let j = 0; j < t.steps.length; j++) {
        const s = t.steps[j];
        html += '<li>';
        html +=
            '<div><span class="label">Acao</span><span class="action">' +
            escapeHtml(s.fields.Action || '') +
            '</span></div>';
        if (s.fields.Data) {
            html +=
                '<div><span class="label">Dados</span><span class="data">' +
                escapeHtml(s.fields.Data) +
                '</span></div>';
        }
        html +=
            '<div><span class="label">Esperado</span><span class="expected">' +
            escapeHtml(s.fields.ExpectedResult || '') +
            '</span></div>';
        html += '</li>\n';
    }
    html += '</ul>\n';

    html += '<div class="meta">\n';
    if (t.precondition) {
        html += '<span><span class="mlbl">Pre-cond:</span> ' + escapeHtml(t.precondition.value) + '</span>\n';
    }
    if (t.linkedIssues && t.linkedIssues.length > 0) {
        const linkText = t.linkedIssues.map((li) => li.key).join(', ');
        html += '<span><span class="mlbl">Links:</span> ' + escapeHtml(linkText) + '</span>\n';
    }
    html += '</div>\n</div>\n</div>\n';
    return html;
}

function renderPreviewHtml(tests: TestCase[], jiraLabels: string[], totalSteps: number, groupsCount: number): string {
    let html = _renderHtmlHead();
    html += _renderSummaryCards(tests, jiraLabels, totalSteps, groupsCount);
    for (let i = 0; i < tests.length; i++) {
        html += _renderTestCard(tests[i], i);
    }
    html += '<div class="footer">Gerado por QA Tools — import-prep</div>\n';
    html += '</body>\n</html>\n';
    return html;
}

function generatePreviewMarkdown(tests: TestCase[]): string {
    let markdown = '| # | Titulo | Descricao | Passos | Pre-cond. | Links | Grupo |\n';
    markdown += '|---|--------|-----------|--------|-----------|-------|-------|\n';
    for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        const desc = t.description ? t.description.substring(0, 50).replace(/\|/g, '\\|') : '—';
        const pre = t.precondition ? escapeHtml(t.precondition.value.substring(0, 30)) : '—';
        const links = t.linkedIssues?.length ? String(t.linkedIssues.length) : '0';
        const group = t.group || '—';
        markdown +=
            '| ' +
            (i + 1) +
            ' | ' +
            t.title.replace(/\|/g, '\\|') +
            ' | ' +
            desc +
            ' | ' +
            t.steps.length +
            ' | ' +
            pre +
            ' | ' +
            links +
            ' | ' +
            group +
            ' |\n';
    }
    return markdown;
}

function showPreview(tests: TestCase[], jiraLabels: string[], totalSteps: number, groupsCount: number): void {
    title('Preview dos testes a serem criados');

    const mdContent = generatePreviewMarkdown(tests);
    print(md(mdContent));

    divider();

    if (jiraLabels.length > 0) {
        info('Labels: ' + jiraLabels.join(', '));
    }
    info(
        'Total: ' +
            tests.length +
            ' teste(s), ' +
            totalSteps +
            ' step(s)' +
            (groupsCount > 0 ? ', ' + groupsCount + ' grupo(s)' : ''),
    );

    const html = renderPreviewHtml(tests, jiraLabels, totalSteps, groupsCount);
    const outPath = path.join(os.tmpdir(), 'qa-preview.html');
    fs.writeFileSync(outPath, html, 'utf8');
    info('Preview HTML: ' + outPath);
}

function filterTests(tests: TestCase[]): TestCase[] | null {
    if (Config.autoConfirm) return tests;

    const filterText = prompt('Filtrar testes por titulo? (Enter para todos)');
    if (!filterText.trim()) return tests;

    const filtered = tests.filter((t) => t.title.toLowerCase().includes(filterText.trim().toLowerCase()));
    if (filtered.length === 0) {
        warn('Nenhum teste corresponde a "' + filterText.trim() + '".');
        return null;
    }
    info(filtered.length + '/' + tests.length + ' testes correspondem a "' + filterText.trim() + '"');
    if (!confirm('Criar apenas estes ' + filtered.length + ' testes?')) {
        warn(OPERATION_CANCELLED);
        return null;
    }
    return filtered;
}

function confirmOrCancel(): boolean {
    if (Config.autoConfirm) return true;
    return confirm('Criar estes testes no Jira?');
}

interface ValidationResult {
    resumeFrom: number;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    opLog: ReturnType<typeof rootLogger.child>;
}

function validateImportBatch(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): ValidationResult | undefined {
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText } = _checkResumeCheckpoint(
        tests,
        sourcePath,
        sourceType,
        projectName,
    );

    if (resumeFrom === 0) {
        const validator = new TestCaseValidator();
        const { errors, warnings } = validator.validate(tests);
        if (warnings.length > 0) {
            warn('Avisos (' + warnings.length + '):');
            warnings.slice(0, 5).forEach((w) => warn('  ' + w));
            if (warnings.length > 5) warn('  ... e mais ' + (warnings.length - 5) + ' aviso(s)');
        }
        if (errors.length > 0) {
            error('Erros (' + errors.length + '):');
            errors.forEach((e) => error('  ' + e));
            warn('Corrija os dados antes de importar.');
            return;
        }
    }

    const opLog = rootLogger.child({ operation: sourceType + '-import', sourcePath });
    return { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog };
}

function handleDryRun(
    tests: TestCase[],
    onBusy: (busy: boolean) => void,
    sourcePath: string,
): {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
} | null {
    if (!Config.dryRun) return null;

    warn('MODO DRY-RUN: Nenhuma operação sera executada.');
    printSummary(tests.map((t) => ({ status: 'ok' as const, label: t.title, message: 'simulado' })));
    onBusy(false);
    return {
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        summary: 'DRY-RUN: ' + tests.length + ' testes simulados',
        status: 'ok',
        sourcePath,
    };
}

async function resolveCsvPath(csvPathInput: string | undefined): Promise<string> {
    const state = loadState();
    return (
        csvPathInput ||
        Config.csvPath ||
        (await ask('Caminho do arquivo CSV', { default: (state.lastCsvPath as string) || csvDefaultPath }))
    );
}

function resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config[configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels'] as string | undefined;
    const labels =
        configValue ||
        prompt('Labels Jira (separadas por virgula)', {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            hint: state.lastLabels ? 'último: ' + String(state.lastLabels) : 'vazio para nenhuma',
            default: (state.lastLabels as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

async function resolveJsonPath(jsonPathInput: string | undefined): Promise<string | undefined> {
    const state = loadState();
    const rawPath =
        jsonPathInput ||
        Config.jsonPath ||
        (await ask('Caminho do arquivo JSON ou TXT (formato JSON)', {
            default: (state.lastJsonPath as string) || '',
        }));

    let jsonPath = rawPath.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir as string, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
    }
    return jsonPath;
}

function parseJsonTests(jsonPath: string): TestCase[] {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array de casos de teste');
    return parsed.map((item: JsonObject, i: number) => {
        if (!item.title || !item.steps || !Array.isArray(item.steps)) {
            throw new Error('Item ' + (i + 1) + ': campos obrigatórios: title (string), steps (array)');
        }
        return {
            title: item.title as string,
            description: (item.description as string) || '',
            steps: (item.steps as Array<Record<string, string>>).map((s) => ({
                fields: {
                    Action: s.Action || '',
                    Data: s.Data || '',
                    ExpectedResult: s.ExpectedResult || '',
                },
            })),
            precondition: item.precondition
                ? isPreconditionKey(item.precondition as string)
                    ? { type: 'reference' as const, value: item.precondition as string }
                    : { type: 'inline' as const, value: item.precondition as string }
                : undefined,
            group: (item.group as string) || '',
            linkedIssues: Array.isArray(item.linkedIssues)
                ? (item.linkedIssues as Array<unknown>).map((li) => {
                      if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                      const liObj = li as { key: string; linkType?: string };
                      return { key: liObj.key, linkType: liObj.linkType || 'Tests' };
                  })
                : [],
        };
    });
}

export {
    _checkResumeCheckpoint,
    showPreview,
    filterTests,
    confirmOrCancel,
    validateImportBatch,
    handleDryRun,
    resolveCsvPath,
    resolveLabels,
    resolveJsonPath,
    parseJsonTests,
    renderPreviewHtml,
    generatePreviewMarkdown,
    escapeHtml,
};
export type { ValidationResult };
