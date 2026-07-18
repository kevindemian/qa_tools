import { rootLogger } from '../logger.js';
import { extractErrorMessage, humanizeError } from '../ui/prompt-errors.js';

interface HandleErrorOptions {
    context?: string;
}

/** Always throws — return type is `never`. Errors are surfaced explicitly via ExternalError/throw. */
export function handleError(err: unknown, options?: HandleErrorOptions): never {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.error(`Erro em ${options?.context || 'operação'}: ${known ? known.msg : raw}`);
    throw err;
}
