/** Regression guard: .env.example must mirror CONFIG_SCHEMA.
 *
 *  The example file is AUTO-GENERATED from shared/config-schema.ts
 *  (see scripts/generate-env-example.ts). It must contain every schema env var,
 *  otherwise developers following .env.example will miss required configuration
 *  (e.g. JIRA_USER_EMAIL was previously missing after the schema gained it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG_SCHEMA } from '../shared/config-schema.js';

describe('Env example stays in sync with CONFIG_SCHEMA', () => {
    const example = readFileSync(resolve(import.meta.dirname, '..', '.env.example'), 'utf-8');

    it('contains every CONFIG_SCHEMA envVar', () => {
        const missing = CONFIG_SCHEMA.filter((f) => !example.includes(f.envVar + '=')).map((f) => f.envVar);

        expect(missing, `env vars missing from .env.example: ${missing.join(', ')}`).toStrictEqual([]);
    });
});
