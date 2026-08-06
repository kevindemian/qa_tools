/**
 * Artifact fixtures loader — SSOT for JSON fixtures (I-9.2).
 *
 * Loads the external, committed JSON fixtures from `scripts/__fixtures__/artefactos/`
 * and returns them strongly typed for the validation harness.
 *
 * Guards (AGENTS Rule 24/25): JSON parse failure or empty root value is an
 * EXPLICIT error — never a silent default. Loaded via a single TS-serialized
 * boundary so each fixture's shape is preserved from the committed file.
 *
 * @module artifact-fixtures
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__', 'artefactos');

/**
 * Load a committed JSON fixture by its spec id.
 *
 * @param id - artifact spec id matching `<id>.json` (e.g. `backlog-health`).
 * @param dir - optional fixture directory override (defaults to the committed
 *   `scripts/__fixtures__/artefactos`). Used by hermetic tests only.
 * @returns the parsed fixture value.
 * @throws {Error} when the file is missing, malformed JSON, or the JSON root is empty.
 */
export function loadFixture<T>(id: string, dir: string = FIXTURE_DIR): T {
    const path = join(dir, `${id}.json`);
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(`[artifact-fixtures] fixture "${id}" not found at ${path}: ${(err as Error).message}`, {
            cause: err,
        });
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`[artifact-fixtures] fixture "${id}" is malformed JSON: ${(err as Error).message}`, {
            cause: err,
        });
    }
    if (parsed === null || parsed === undefined || parsed === '') {
        throw new Error(`[artifact-fixtures] fixture "${id}" has an empty root value (null/undefined/'')`);
    }
    return parsed as T;
}
