/** Parsing and resolution — dry-run handler, CSV/JSON path resolution, label parsing, JSON test parsing. */
import { formatErr } from '../shared/errors.js';
import * as fs from 'fs';
import * as path from 'path';
import Config from '../shared/config-accessor.js';
import { rootLogger } from '../shared/logger.js';
import { load as loadState } from '../shared/state.js';
import { isPreconditionKey } from '../shared/quoted-string.js';
import { ImportJsonSchema, ImportJsonItemSchema, ImportJsonRootSchema } from './csv-import-schema.js';
import { warn, prompt, info, printSummary, askFilePath } from '../shared/ui/prompt.js';
import type { TestCase, BatchFields, TestExecutionDeclaration } from '../shared/types.js';
import type { JiraResourceLike } from '../shared/types.js';
import { z } from '../shared/validation/validation.js';

type JsonTestItem = z.infer<typeof ImportJsonItemSchema>;
type JsonImportRoot = z.infer<typeof ImportJsonRootSchema>;

/** Result of parsing an import file: tests plus any batch fields and optional Test Execution declaration. */
export interface ParsedImportFile {
    tests: TestCase[];
    batchFields?: BatchFields;
    testExecution?: TestExecutionDeclaration;
}

type PreconditionItem = { type: 'reference' | 'inline'; value: string };

function classifyPrecondition(raw: string): PreconditionItem {
    const trimmed = raw.trim();
    return isPreconditionKey(trimmed) ? { type: 'reference', value: trimmed } : { type: 'inline', value: trimmed };
}

function jsonPreconditionsToItems(value: string | string[]): PreconditionItem[] {
    const raws: string[] = Array.isArray(value) ? value : [value];
    if (raws.length === 1) {
        const single = raws[0];
        if (!single) return [];
        const trimmed = single.trim();
        const parts = trimmed
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length > 1 && parts.every((p) => isPreconditionKey(p))) {
            return parts.map((p) => ({ type: 'reference' as const, value: p }));
        }
        return [classifyPrecondition(trimmed)];
    }
    return raws.map((r) => classifyPrecondition(r));
}

const csvDefaultPath = Config.get('csvDefaultPath') || path.join(import.meta.dirname, 'test_steps.csv');

export async function handleDryRun(
    tests: TestCase[],
    onBusy: (busy: boolean) => void,
    sourcePath: string,
    jiraResource?: JiraResourceLike,
    targetKeys?: string[],
    project?: string,
): Promise<{
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    parentIssues: Array<{ key: string; linkType: string }>;
    summary: string;
    status: string;
    sourcePath: string;
    failedLinks: string[];
} | null> {
    if (!Config.get('dryRun')) return null;

    warn('MODO DRY-RUN: Nenhuma operação sera executada.');

    const mappedCount = Math.min(targetKeys?.length ?? 0, tests.length);
    const createCount = tests.length - mappedCount;

    if (jiraResource && project) {
        info('Validando dependências...');

        try {
            await jiraResource.getJiraResource('project/' + project);
            info('  Projeto ' + project + ' ✓');
        } catch {
            warn('  Projeto ' + project + ' ✗ (não encontrado ou sem acesso)');
        }

        const linkedKeys = new Set<string>();
        for (const t of tests) {
            if (t.linkedIssues) {
                for (const li of t.linkedIssues) {
                    if (li.key) linkedKeys.add(li.key);
                }
            }
        }
        for (const key of linkedKeys) {
            try {
                await jiraResource.getJiraResource('issue/' + key);
                info('  ' + key + ' ✓ (linked issue)');
            } catch {
                warn('  ' + key + ' ✗ (linked issue não encontrado)');
            }
        }
    }

    if (jiraResource && targetKeys && targetKeys.length > 0) {
        info('Validando target-keys...');
        for (let i = 0; i < mappedCount; i++) {
            const key = targetKeys[i];
            if (!key) continue;
            try {
                await jiraResource.getJiraResource('issue/' + key);
                info('  CSV[' + (i + 1) + '] → ' + key + ' ✓ (UPDATE)');
            } catch {
                warn('  CSV[' + (i + 1) + '] → ' + key + ' ✗ (NOT FOUND)');
            }
        }
        for (let i = mappedCount; i < tests.length; i++) {
            info('  CSV[' + (i + 1) + '] → (CREATE)');
        }
    } else {
        for (let i = 0; i < tests.length; i++) {
            info('  CSV[' + (i + 1) + '] → (CREATE)');
        }
    }

    const summaryParts = [tests.length + ' testes simulados'];
    if (mappedCount > 0) summaryParts.push(mappedCount + ' updates');
    if (createCount > 0) summaryParts.push(createCount + ' creates');

    printSummary(tests.map((t) => ({ status: 'ok' as const, label: t.title, message: 'simulado' })));
    onBusy(false);
    return {
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        parentIssues: [],
        summary: 'DRY-RUN: ' + summaryParts.join(', '),
        status: 'ok',
        sourcePath,
        failedLinks: [],
    };
}

export async function resolveCsvPath(csvPathInput: string | undefined): Promise<string> {
    const state = loadState();
    return (
        csvPathInput ||
        Config.get('csvPath') ||
        (await askFilePath('Caminho do arquivo CSV', {
            extensions: ['.csv'],
            default: (state['lastCsvPath'] as string) || csvDefaultPath,
        }))
    );
}

export function resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config.get(configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels');
    const labels =
        configValue ||
        prompt('Labels Jira (separadas por virgula)', {
            hint: state['lastLabels'] ? 'último: ' + (state['lastLabels'] as string) : 'vazio para nenhuma',
            default: (state['lastLabels'] as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

function _splitList(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

function _resolveBatchString(
    configKey: 'csvEnvironment' | 'jsonEnvironment' | 'csvPriority' | 'jsonPriority',
    fileValue: string | undefined,
): string | undefined {
    const trimmed = (fileValue ?? '').trim();
    if (trimmed) return trimmed;
    const configValue = Config.get(configKey);
    const trimmedConfig = (configValue ?? '').trim();
    return trimmedConfig || undefined;
}

function _resolveBatchList(
    configKey: 'csvComponents' | 'jsonComponents',
    fileValue: string[] | undefined,
): string[] | undefined {
    const fromFile = _splitList((fileValue ?? []).join(','));
    if (fromFile.length > 0) return fromFile;
    const fromConfig = _splitList(Config.get(configKey));
    return fromConfig.length > 0 ? fromConfig : undefined;
}

/** Resolve batch fields for a CSV import, merging file-level declarations with config. */
export function resolveCsvBatchFields(fileFields: BatchFields | undefined): BatchFields {
    const environment = _resolveBatchString('csvEnvironment', fileFields?.environment);
    const components = _resolveBatchList('csvComponents', fileFields?.components);
    const priority = _resolveBatchString('csvPriority', fileFields?.priority);
    return {
        ...(environment ? { environment } : {}),
        ...(components ? { components } : {}),
        ...(priority ? { priority } : {}),
    };
}

/** Resolve batch fields for a JSON import, merging file-level declarations with config. */
export function resolveJsonBatchFields(fileFields: BatchFields | undefined): BatchFields {
    const environment = _resolveBatchString('jsonEnvironment', fileFields?.environment);
    const components = _resolveBatchList('jsonComponents', fileFields?.components);
    const priority = _resolveBatchString('jsonPriority', fileFields?.priority);
    return {
        ...(environment ? { environment } : {}),
        ...(components ? { components } : {}),
        ...(priority ? { priority } : {}),
    };
}

export async function resolveJsonPath(jsonPathInput: string | undefined): Promise<string | undefined> {
    const rawPath =
        jsonPathInput ||
        Config.get('jsonPath') ||
        (await askFilePath('Caminho do arquivo JSON ou TXT (formato JSON)', {
            extensions: ['.json', '.txt'],
            default: Config.get('jsonPath') || '',
        }));

    const jsonPath = rawPath.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    return jsonPath;
}

function _mapJsonItems(validated: JsonTestItem[], aliasWarnedRef: { value: boolean }): TestCase[] {
    return validated.map(
        (item: JsonTestItem): TestCase => ({
            title: item.title,
            description: item.description || '',
            steps: item.steps.map((s) => {
                const expectedResult = s['Expected Result'] ?? s.ExpectedResult ?? '';
                if (!aliasWarnedRef.value && s.ExpectedResult && !s['Expected Result']) {
                    aliasWarnedRef.value = true;
                    rootLogger.warn(
                        'JSON step usa "ExpectedResult" (junto, sem espaço) em vez de "Expected Result" (com espaço). ' +
                            'Causa: template JSON desatualizado (test_cases_template.json / test_steps_template.json). ' +
                            'Solução: renomeie a chave para "Expected Result" nos seus arquivos JSON. ' +
                            'Este aviso aparece apenas uma vez por arquivo.',
                    );
                }
                return {
                    fields: {
                        Action: s.Action ?? '',
                        Data: s.Data ?? '',
                        'Expected Result': expectedResult,
                    },
                };
            }),
            ...(item.precondition ? { precondition: jsonPreconditionsToItems(item.precondition) } : {}),
            group: item.group || '',
            linkedIssues: Array.isArray(item.linkedIssues)
                ? item.linkedIssues.map((li) => {
                      if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                      return { key: li.key, linkType: li.linkType || 'Tests' };
                  })
                : [],
            ...(item.environment ? { environment: item.environment } : {}),
            ...(item.components ? { components: item.components } : {}),
            ...(item.priority ? { priority: item.priority } : {}),
        }),
    );
}

/** Parse and validate a JSON import file (array form or object form). Returns tests, batch fields, and TE declaration. */
export function parseJsonFile(jsonPath: string): ParsedImportFile {
    let raw: string;
    try {
        raw = fs.readFileSync(jsonPath, 'utf8');
    } catch (err) {
        rootLogger.error(`Falha ao ler arquivo JSON: ${jsonPath} — ${formatErr(err)}`);
        warn(`Não foi possível ler o arquivo: ${jsonPath}. Operação cancelada.`);
        return { tests: [] };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        rootLogger.error(`JSON malformado em ${jsonPath}: ${formatErr(err)}`);
        warn(`Arquivo JSON inválido: ${jsonPath}. Verifique o formato. Operação cancelada.`);
        return { tests: [] };
    }
    let validated: z.infer<typeof ImportJsonSchema>;
    try {
        validated = ImportJsonSchema.parse(parsed);
    } catch (err) {
        rootLogger.error(`Schema JSON inválido em ${jsonPath}: ${formatErr(err)}`);
        warn(`Formato JSON não corresponde ao schema esperado: ${jsonPath}. Operação cancelada.`);
        return { tests: [] };
    }
    const aliasWarnedRef = { value: false };
    if (Array.isArray(validated)) {
        return { tests: _mapJsonItems(validated, aliasWarnedRef) };
    }
    const root = validated as JsonImportRoot;
    const tests = _mapJsonItems(root.tests, aliasWarnedRef);
    const batchFields: BatchFields = {
        ...(root.environment ? { environment: root.environment } : {}),
        ...(root.components ? { components: root.components } : {}),
        ...(root.priority ? { priority: root.priority } : {}),
    };
    const hasBatch = Object.keys(batchFields).length > 0;
    const testExecution: TestExecutionDeclaration | undefined = root.testExecution
        ? {
              ...(root.testExecution.title ? { title: root.testExecution.title } : {}),
              ...(root.testExecution.description ? { description: root.testExecution.description } : {}),
              ...(root.testExecution.linkedIssues && root.testExecution.linkedIssues.length > 0
                  ? { linkedIssues: root.testExecution.linkedIssues }
                  : {}),
              ...(root.testExecution.labels ? { labels: root.testExecution.labels } : {}),
          }
        : undefined;
    return {
        tests,
        ...(hasBatch ? { batchFields } : {}),
        ...(testExecution ? { testExecution } : {}),
    };
}

export function parseJsonTests(jsonPath: string): TestCase[] {
    return parseJsonFile(jsonPath).tests;
}
