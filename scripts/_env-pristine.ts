/**
 * Pristine `process.env` snapshot, captured at import time.
 *
 * MUST be imported before `../shared/logger.js` (or any module that triggers
 * `ensureDotenv()`): the logger's `ensureDotenv()` loads `.env.local` + `.env`
 * (production URLs/tokens) into `process.env`, which would then leak into the
 * D1 child via `execFileSync` and make e2e/cloud tests hit real endpoints
 * instead of the hermetic `.env.test` sandbox.
 *
 * The D1 step passes this snapshot as the child env so the full vitest suite
 * runs in the same environment as a plain-shell `npm test`.
 *
 * @module env-pristine
 */

/** Deep copy of the environment as seen before any module side effects. */
export const pristineEnv: NodeJS.ProcessEnv = { ...process.env };
