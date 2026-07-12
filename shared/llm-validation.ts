import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { rootLogger } from './logger.js';
import { LlmError } from './errors.js';

interface ValidationResult {
    valid: boolean;
    error?: string;
    response?: string;
    requiresHumanReview?: boolean;
}

interface ValidationModule {
    sanitizeAndReject: (response: string) => ValidationResult;
}

const VALIDATION_HOOK_PATH = join(homedir(), '.config', 'opencode', 'validation_hook.ts');

let _cachedValidate: ((response: string) => ValidationResult) | null = null;

async function _getValidator(): Promise<(response: string) => ValidationResult> {
    let validate = _cachedValidate;
    if (!validate) {
        // O validation_hook é LOCAL-ONLY (por design: a CI é a rede de segurança real,
        // não o hook local). A ausência do arquivo é o estado esperado fora da máquina de
        // dev do mantenedor — neste caso a validação local é ignorada (pass-through), e a
        // CI executa suas próprias gates. Se o hook ESTÁ presente mas falha ao carregar,
        // fail-closed: um hook local quebrado é um defeito real que não pode ser silenciado.
        if (!existsSync(VALIDATION_HOOK_PATH)) {
            rootLogger.debug(
                `[llm-validation] validation_hook ausente em ${VALIDATION_HOOK_PATH} — hook é local-only; validação local ignorada (a CI é a rede de segurança).`,
            );
            validate = (response: string): ValidationResult => ({ valid: true, response });
        } else {
            try {
                const mod = (await import(VALIDATION_HOOK_PATH)) as ValidationModule;
                validate = mod.sanitizeAndReject;
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                rootLogger.error(
                    `[llm-validation] validation_hook presente em ${VALIDATION_HOOK_PATH} mas falhou ao carregar (${errMsg}) — fail-closed por segurança (não silenciado).`,
                );
                validate = (response: string): ValidationResult => ({
                    valid: false,
                    error: `validation hook quebrado em ${VALIDATION_HOOK_PATH}: ${errMsg}`,
                    requiresHumanReview: true,
                    response,
                });
            }
        }
        _cachedValidate = validate;
    }
    return validate;
}

export async function validateLlmResponse(response: string): Promise<void> {
    if (!response) {
        throw new LlmError('LLM response rejected: empty response');
    }
    const validate = await _getValidator();
    const result = validate(response);
    if (!result.valid) {
        throw new LlmError(`LLM response rejected by validation hook: ${result.error ?? 'unknown reason'}`);
    }
}
