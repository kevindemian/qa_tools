/**
 * Environment loader — isolates dotenv for dependency management.
 *
 * All .env loading must go through this module.
 * Replacing dotenv requires changing only this file.
 *
 * @module env-loader
 */
import dotenv from 'dotenv';
import * as path from 'path';

let dotenvLoaded = false;

/** Load `.env` file once (idempotent). Silent on failure. */
export function ensureDotenv(): void {
    if (dotenvLoaded) return;
    try {
        dotenv.config({ path: path.resolve(__dirname, '../.env') });
    } catch {
        /* env file optional */
    }
    dotenvLoaded = true;
}

/** Read an env var with optional fallback. Calls `ensureDotenv` on each read. */
export function envVal(key: string, fallback = ''): string {
    ensureDotenv();
    return process.env[key] || fallback;
}

/** Parse a string/boolean/undefined into a strict boolean. */
export function toBool(val: string | boolean | undefined): boolean {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    return val === 'true';
}

/** Parse a string/number/undefined into an integer with a fallback default. */
export function toInt(val: string | number | undefined, fallback: number): number {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

/** Reset dotenv loaded flag for testing. */
export function __resetDotenvLoaded(): void {
    dotenvLoaded = false;
}
