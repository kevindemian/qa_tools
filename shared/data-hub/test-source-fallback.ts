/**
 * User Fallback — última camada da cascata de extração.
 *
 * Só ativa em TTY. Pergunta ao usuário o path de um arquivo de resultados
 * (CTRF JSON, JUnit XML ou Mochawesome), valida o formato e retorna o
 * ParseResult. Em CI (non-TTY) retorna null silenciosamente.
 *
 * @module test-source-fallback
 */

import fs from 'fs';
import path from 'path';
import { parseTestResultsFile } from '../result_parser.js';
import { rootLogger } from '../logger.js';
import { askFilePath } from '../prompt-input-filepath.js';
import { Output } from '../output.js';

export const DATAHUB_ERRORS = {
    FILE_NOT_FOUND: 'Arquivo não encontrado.',
    INVALID_FORMAT: 'Formato não reconhecido. Use CTRF (.json), JUnit (.xml) ou Mochawesome (.json).',
    EMPTY_RESULT: 'Nenhum resultado de teste encontrado no arquivo.',
    USER_SKIPPED: 'Fallback manual ignorado pelo usuário.',
    NO_TTY: 'Não é TTY — fallback manual ignorado.',
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

    if (!fs.existsSync(filePath)) {
        return { data: null, error: DATAHUB_ERRORS.FILE_NOT_FOUND, source: filePath };
    }

    const stat = fs.statSync(filePath);
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
    const stats = result.data!.stats;
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

export async function askTestSource(): Promise<FallbackResult> {
    if (!Output.isTTY() || Output.isCI()) {
        return { data: null, error: DATAHUB_ERRORS.NO_TTY };
    }

    const label = 'Caminho do arquivo de resultados (CTRF, JUnit ou Mochawesome)';

    for (let attempt = 0; attempt < 3; attempt++) {
        const filePath = await askFilePath(label, { extensions: ['.json', '.xml'] });
        if (!filePath) {
            rootLogger.debug('askTestSource: user skipped at file path prompt');
            return { data: null, error: DATAHUB_ERRORS.USER_SKIPPED };
        }

        const result = validateTestFile(filePath);
        const formatted = formatValidationResult(result);

        if (formatted.success) {
            console.log(formatted.message);
            return result;
        }

        console.log(formatted.message);

        if (attempt < 2) {
            console.log('Tente novamente ou pressione Enter sem digitar nada para pular.');
        }
    }

    return { data: null, error: DATAHUB_ERRORS.USER_SKIPPED };
}
