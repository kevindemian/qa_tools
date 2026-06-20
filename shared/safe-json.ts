import { rootLogger } from './logger.js';

/** Type-safe JSON.parse wrapper. Confines the unavoidable `any` cast to this file.
 *  Returns `fallback` when parsing fails or the result is `undefined`.
 *  @example
 *    const data = safeParseJson(raw, []) as Foo[]     // caller provides fallback
 *    const data = safeParseJson<Foo[]>(raw, [])        // cleaner: generic + fallback
 */
export function safeParseJson<T>(raw: string, fallback: T): T {
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed as T;
    } catch (err) {
        rootLogger.warn(
            'safeParseJson: invalid JSON, returning fallback: ' + (err instanceof Error ? err.message : String(err)),
        );
        return fallback;
    }
}
