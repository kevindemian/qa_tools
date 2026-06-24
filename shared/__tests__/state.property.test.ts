/**
 * Property-Based Tests — Session State (FT-03)
 *
 * Invariantes do módulo state.ts:
 * - load ∘ save = identity (round-trip): saved data é recuperado intacto
 * - update preserva chaves existentes e adiciona/sobrescreve as novas
 * - update retorna deep copy, não muta o original
 * - load retorna {} para estado vazio/inexistente
 */
import * as fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootLogger } from '../logger.js';

let TEST_DIR: string;
let stateModule: typeof import('../state.js');

function getConfig() {
    return { get: (key: string) => (key === 'xdgStateHome' ? TEST_DIR : undefined) } as never;
}

/** Arbitrário para geração de estados. */
const KeyArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== '__proto__');
const ValueArb = fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }),
);

const StateArb = fc.dictionary(KeyArb, ValueArb, { maxKeys: 10 });

describe('State Persistence — property-based invariants', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-state-'));
        stateModule = await import('../state.js');
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn('PBT cleanup failed: ' + String(err));
        }
    });

    it('load ∘ save = identity para qualquer estado válido', () => {expect.hasAssertions();

        fc.assert(
            fc.property(StateArb, (data) => {
                const config = getConfig();
                stateModule.save(data, config);
                const loaded = stateModule.load(config);

                expect(loaded).toEqual(data);
            }),
            { numRuns: 50 },
        );
    });

    it('update preserva chaves existentes e adiciona/sobrescreve as novas', () => {expect.hasAssertions();

        fc.assert(
            fc.property(StateArb, StateArb, (initial, changes) => {
                const config = getConfig();
                stateModule.save(initial, config);

                const result = stateModule.update((s) => {
                    for (const [k, v] of Object.entries(changes)) {
                        s[k] = v;
                    }
                }, config);

                // Todas as chaves de changes estão no resultado com o novo valor
                for (const [k, v] of Object.entries(changes)) {
                    expect(result[k]).toEqual(v);
                }
                // Chaves de initial que não foram sobrescritas permanecem
                for (const [k, v] of Object.entries(initial)) {
                    if (!(k in changes)) {
                        expect(result[k]).toEqual(v);
                    }
                }
            }),
            { numRuns: 50 },
        );
    });

    it('update retorna deep copy (original não é mutado pelo callback)', () => {expect.hasAssertions();

        fc.assert(
            fc.property(StateArb, (data) => {
                const config = getConfig();
                stateModule.save(data, config);

                // Carrega o estado original ANTES de update para ter referência
                const original = stateModule.load(config);
                const result = stateModule.update((s) => {
                    s['_pbt_mutated'] = true;
                }, config);

                // Original (referência pré-update) não deve ter a chave adicionada
                expect(original).not.toHaveProperty('_pbt_mutated');
                // Result deve ter a chave
                expect(result).toHaveProperty('_pbt_mutated');

                // O estado persistido após update contém a mutação
                const reloaded = stateModule.load(config);

                expect(reloaded).toHaveProperty('_pbt_mutated');
                expect(reloaded).toEqual(result);
            }),
            { numRuns: 30 },
        );
    });

    it('load retorna {} para estado vazio/inexistente', () => {expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.oneof(fc.constant(undefined), fc.constant(null), fc.dictionary(KeyArb, ValueArb, { maxKeys: 0 })),
                () => {
                    // Sempre retorna {} quando não há arquivo
                    const config = getConfig();
                    const result = stateModule.load(config);

                    expect(result).toEqual({});
                },
            ),
            { numRuns: 10 },
        );
    });

    it('save cria state.json e state.json.bak', () => {expect.hasAssertions();

        fc.assert(
            fc.property(StateArb, (data) => {
                const config = getConfig();
                stateModule.save(data, config);

                const stateDir = path.join(TEST_DIR, 'qa-tools');

                expect(fs.existsSync(path.join(stateDir, 'state.json'))).toBeTruthy();
                expect(fs.existsSync(path.join(stateDir, 'state.json.bak'))).toBeTruthy();
            }),
            { numRuns: 20 },
        );
    });
});
