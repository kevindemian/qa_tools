import { rootLogger } from './logger';

export interface HandleErrorOptions {
    returnNull?: boolean;
    context?: string;
}

export function handleError(err: unknown, options: HandleErrorOptions = {}): null | never {
    const message = err instanceof Error ? err.message : String(err);
    rootLogger.error(`Erro em ${options.context || 'operação'}: ${message}`);
    if (options.returnNull) {
        return null;
    }
    throw err;
}
