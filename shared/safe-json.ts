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
        // `err` is typed `unknown` (any value can be thrown in JS). Native JSON.parse
        // only throws SyntaxError, but the non-Error arm is a required safeguard for the
        // `unknown` catch type and any future/indirect throw source — not dead code.
        rootLogger.warn(
            'safeParseJson: invalid JSON, returning fallback: ' + (err instanceof Error ? err.message : String(err)),
        );
        return fallback;
    }
}
