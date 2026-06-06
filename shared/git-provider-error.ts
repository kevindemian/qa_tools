import { rootLogger } from './logger.js';

interface HandleErrorOptions {
    returnNull?: boolean;
    context?: string;
}

/** Overload: when `returnNull: true` is explicitly passed, returns `null`. */
export function handleError(err: unknown, options: HandleErrorOptions & { returnNull: true }): null;
/** Overload: when `returnNull` is omitted or `false`, always throws — return type is `never`. */
export function handleError(err: unknown, options?: HandleErrorOptions): never;
export function handleError(err: unknown, options: HandleErrorOptions = {}): null | never {
    const message = err instanceof Error ? err.message : String(err);
    rootLogger.error(`Erro em ${options.context || 'operação'}: ${message}`);
    if (options.returnNull) {
        return null;
    }
    throw err;
}
