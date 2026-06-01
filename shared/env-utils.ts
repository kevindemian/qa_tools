/** Environment variable utilities — extracted from Config for SRP compliance. */
import * as path from 'path';
import dotenv from 'dotenv';

let dotenvLoaded = false;

/** Load `.env` file once (idempotent). Silent on failure. */
function ensureDotenv(): void {
    if (dotenvLoaded) return;
    try {
        dotenv.config({ path: path.resolve(__dirname, '../.env') });
    } catch {
        /* env file optional */
    }
    dotenvLoaded = true;
}

/** Read an env var with optional fallback. Calls `ensureDotenv` on each read. */
function envVal(key: string, fallback = ''): string {
    ensureDotenv();
    return process.env[key] || fallback;
}

/** Parse a string/boolean/undefined into a strict boolean. */
function toBool(val: string | boolean | undefined): boolean {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    return val === 'true';
}

/** Parse a string/number/undefined into an integer with a fallback default. */
function toInt(val: string | number | undefined, fallback: number): number {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

export { ensureDotenv, envVal, toBool, toInt };
