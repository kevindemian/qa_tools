/** Parsing and resolution — dry-run handler, CSV/JSON path resolution, label parsing, JSON test parsing. */
import * as fs from 'fs';
import * as path from 'path';
import Config from '../shared/config.js';
import { rootLogger } from '../shared/logger.js';
import { load as loadState } from '../shared/state.js';
import { isPreconditionKey } from '../shared/quoted-string.js';
import { ImportJsonSchema, ImportJsonItemSchema } from './csv-import-schema.js';
import { warn, prompt, printSummary, askFilePath } from '../shared/prompt.js';
import type { TestCase } from '../shared/types.js';
import { z } from '../shared/validation.js';

type JsonTestItem = z.infer<typeof ImportJsonItemSchema>;

const csvDefaultPath = Config.get('csvDefaultPath') || path.join(import.meta.dirname, 'test_steps.csv');

export function handleDryRun(
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
    if (!Config.get('dryRun')) return null;

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

export async function resolveCsvPath(csvPathInput: string | undefined): Promise<string> {
    const state = loadState();
    return (
        csvPathInput ||
        Config.get('csvPath') ||
        (await askFilePath('Caminho do arquivo CSV', {
            extensions: ['.csv'],
            default: (state.lastCsvPath as string) || csvDefaultPath,
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
            hint: state.lastLabels ? 'último: ' + (state.lastLabels as string) : 'vazio para nenhuma',
            default: (state.lastLabels as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
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

export function parseJsonTests(jsonPath: string): TestCase[] {
    let raw: string;
    try {
        raw = fs.readFileSync(jsonPath, 'utf8');
    } catch (err) {
        rootLogger.error(`Falha ao ler arquivo JSON: ${jsonPath} — ${(err as Error).message}`);
        warn(`Não foi possível ler o arquivo: ${jsonPath}. Operação cancelada.`);
        return [];
    }
    let parsed: Array<Record<string, unknown>>;
    try {
        parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    } catch (err) {
        rootLogger.error(`JSON malformado em ${jsonPath}: ${(err as Error).message}`);
        warn(`Arquivo JSON inválido: ${jsonPath}. Verifique o formato. Operação cancelada.`);
        return [];
    }
    let validated: JsonTestItem[];
    try {
        validated = ImportJsonSchema.parse(parsed);
    } catch (err) {
        rootLogger.error(`Schema JSON inválido em ${jsonPath}: ${(err as Error).message}`);
        warn(`Formato JSON não corresponde ao schema esperado: ${jsonPath}. Operação cancelada.`);
        return [];
    }
    let aliasWarned = false;
    return validated.map(
        (item: JsonTestItem): TestCase => ({
            title: item.title,
            description: item.description || '',
            steps: item.steps.map((s) => {
                const expectedResult = s['Expected Result'] ?? s.ExpectedResult ?? '';
                if (!aliasWarned && s.ExpectedResult && !s['Expected Result']) {
                    aliasWarned = true;
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
            ...(item.precondition
                ? {
                      precondition: isPreconditionKey(item.precondition)
                          ? { type: 'reference' as const, value: item.precondition }
                          : { type: 'inline' as const, value: item.precondition },
                  }
                : {}),
            group: item.group || '',
            linkedIssues: Array.isArray(item.linkedIssues)
                ? item.linkedIssues.map((li) => {
                      if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                      return { key: li.key, linkType: li.linkType || 'Tests' };
                  })
                : [],
        }),
    );
}
