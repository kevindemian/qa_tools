/**
 * User Fallback — última camada da cascata de extração.
 *
 * Só ativa em TTY. Pergunta ao usuário o path de um arquivo de resultados
 * (CTRF JSON, JUnit XML ou Mochawesome), valida o formato e retorna o
 * ParseResult. Em CI (non-TTY) retorna null silenciosamente.
 *
 * @module test-source-fallback
 */

import * as fs from 'fs';
import path from 'path';
import { parseTestResultsFile } from '../result_parser.js';
import { rootLogger } from '../logger.js';
import { askFilePath } from '../ui/prompt-input-filepath.js';
import { Output } from '../ui/output.js';
import { isCancelError, humanizeError } from '../errors.js';

export const DATAHUB_ERRORS = {
    FILE_NOT_FOUND: 'Arquivo não encontrado.',
    INVALID_FORMAT: 'Formato não reconhecido. Use CTRF (.json), JUnit (.xml) ou Mochawesome (.json).',
    EMPTY_RESULT: 'Nenhum resultado de teste encontrado no arquivo.',
    USER_SKIPPED: 'Fallback manual ignorado pelo usuário.',
    USER_CANCELLED: 'Usuário cancelou a seleção de arquivo de teste.',
    NO_TTY: 'Não é TTY — fallback manual ignorado.',
    NO_DATA_SOURCE: 'Sem fonte de dados disponível — sem TEST_REPORT_PATH e sem TTY.',
} as const;

export interface FallbackResult {
    data: import('../result_parser.js').ParseResult | null;
    error?: string;
    source?: string;
}

function isValidExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.json' || ext === '.xml';
}

function formatValidationError(
    _filePath: string,
    result: import('../result_parser.js').ParseResult & { error?: string },
): string {
    if (result.error) return `${DATAHUB_ERRORS.INVALID_FORMAT} Detalhe: ${result.error}`;
    if (result.stats.total === 0) return DATAHUB_ERRORS.EMPTY_RESULT;
    return '';
}

export function validateTestFile(filePath: string): FallbackResult {
    if (!isValidExtension(filePath)) {
        return { data: null, error: DATAHUB_ERRORS.INVALID_FORMAT, source: filePath };
    }

    const resolvedPath = path.resolve(filePath);
    const fileExists = Reflect.apply(fs.existsSync, fs, [resolvedPath]);
    if (!fileExists) {
        return { data: null, error: DATAHUB_ERRORS.FILE_NOT_FOUND, source: resolvedPath };
    }

    const stat = Reflect.apply(fs.statSync, fs, [resolvedPath]) as fs.Stats;
    if (!stat.isFile()) {
        return { data: null, error: DATAHUB_ERRORS.FILE_NOT_FOUND, source: filePath };
    }

    const parsed = parseTestResultsFile(filePath);
    if (parsed.error) {
        return { data: null, error: formatValidationError(filePath, parsed), source: filePath };
    }
    if (parsed.stats.total === 0) {
        return { data: null, error: DATAHUB_ERRORS.EMPTY_RESULT, source: filePath };
    }

    return { data: parsed, source: filePath };
}

function formatValidationSuccess(result: FallbackResult): string {
    if (!result.data) return 'Invalid result';
    const stats = result.data.stats;
    const total = stats.total;
    const passed = stats.passed;
    const failed = stats.failed;
    const skipped = stats.skipped;
    return `✓ ${total} testes (${passed} passed, ${failed} failed, ${skipped} skipped)`;
}

export interface FormattedValidation {
    success: boolean;
    message: string;
    result: FallbackResult;
}

export function formatValidationResult(result: FallbackResult): FormattedValidation {
    if (result.error || !result.data) {
        return { success: false, message: `✗ ${result.error || DATAHUB_ERRORS.INVALID_FORMAT}`, result };
    }
    return { success: true, message: formatValidationSuccess(result), result };
}

async function promptUserForFile(): Promise<FallbackResult> {
    const label = 'Caminho do arquivo de resultados (CTRF, JUnit ou Mochawesome)';

    for (let attempt = 0; attempt < 3; attempt++) {
        let filePath: string | null;
        try {
            filePath = await askFilePath(label, { extensions: ['.json', '.xml'] });
        } catch (err) {
            if (isCancelError(err)) {
                return { data: null, error: DATAHUB_ERRORS.USER_CANCELLED };
            }
            return { data: null, error: humanizeError(err, 'Falha ao solicitar arquivo de teste') };
        }
        if (!filePath) {
            rootLogger.debug('askTestSource: user skipped at file path prompt');
            return { data: null, error: DATAHUB_ERRORS.USER_SKIPPED };
        }

        const result = validateTestFile(filePath);
        const formatted = formatValidationResult(result);

        if (formatted.success) {
            rootLogger.info(formatted.message);
            return result;
        }

        rootLogger.info(formatted.message);

        if (attempt < 2) {
            rootLogger.info('Tente novamente ou pressione Enter sem digitar nada para pular.');
        }
    }

    return { data: null, error: DATAHUB_ERRORS.USER_SKIPPED };
}

export async function askTestSource(): Promise<FallbackResult> {
    // 1. Check TEST_REPORT_PATH env var (works in CI and TTY)
    const envPath = process.env['TEST_REPORT_PATH'];
    if (envPath) {
        const result = validateTestFile(envPath);
        if (result.data) return result;
        // env var set but invalid — log and continue to prompt
        rootLogger.warn(`TEST_REPORT_PATH set but invalid: ${result.error}`);
    }

    // 2. If TTY and not CI, prompt user
    if (Output.isTTY() && !Output.isCI()) {
        return promptUserForFile();
    }

    // 3. Not TTY or running in CI
    return { data: null, error: DATAHUB_ERRORS.NO_TTY };
}
