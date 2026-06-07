import { homedir } from 'os';
import { join } from 'path';
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
        try {
            const mod = (await import(VALIDATION_HOOK_PATH)) as ValidationModule;
            validate = mod.sanitizeAndReject;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            rootLogger.warn(
                `[llm-validation] validation_hook not found at ${VALIDATION_HOOK_PATH} (${errMsg}) — validation disabled`,
            );
            validate = (response: string): ValidationResult => ({
                valid: true,
                response,
            });
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
