/**
 * Integration + property-based tests — Per-Project State (Fase 3, 030–032).
 *
 * Validates:
 * - Routing: global keys (`lastProject`, `_llm*`) → global.json; operational → <proj>/state.json.
 * - Auto-route: load/save without projectName follow qaCurrentProject; legacy fallback otherwise.
 * - Isolation: state A vs B are strictly separated; global keys are shared across projects.
 * - Migration: legacy state.json split into global.json + operational state.json (atomic/idempotent).
 * - Safeguards: invalid project names throw (path-traversal guard); corrupt qaCurrentProject throws.
 *
 * Uses real filesystem in isolated temp directories. The active project is driven via the
 * fake config's closure variable (not the global Config singleton) to stay deterministic under
 * `vi.resetModules()`.
 */
import * as fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootLogger } from '../../logger.js';

let TEST_DIR: string;
let CURRENT_PROJECT = '';
let stateModule: typeof import('../../state.js');

function getConfig() {
    return {
        get(key: string): unknown {
            if (key === 'xdgStateHome') return TEST_DIR;
            if (key === 'qaCurrentProject') return CURRENT_PROJECT;
            return undefined;
        },
    } as never;
}

function qaToolsDir(): string {
    return path.join(TEST_DIR, 'qa-tools');
}

describe('Fase 3 — Per-Project State', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.resetModules();
        CURRENT_PROJECT = '';
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-state-project-'));
        stateModule = await import('../../state.js');
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn('Cleanup failed for test dir: ' + String(err));
        }
        CURRENT_PROJECT = '';
    });

    describe('Routing (global vs operational)', () => {
        it('writes global keys to global.json and operational keys to <proj>/state.json', () => {
            const config = getConfig();
            stateModule.saveState(
                'projA',
                { lastProject: 'projA', _llmConfigured: true, lastCsvPath: '/x.csv', counter: 1 },
                config,
            );

            const global = JSON.parse(fs.readFileSync(path.join(qaToolsDir(), 'global.json'), 'utf8')) as Record<
                string,
                unknown
            >;
            const proj = JSON.parse(fs.readFileSync(path.join(qaToolsDir(), 'projA', 'state.json'), 'utf8')) as Record<
                string,
                unknown
            >;

            expect(global).toStrictEqual({ lastProject: 'projA', _llmConfigured: true });
            expect(proj).toStrictEqual({ lastCsvPath: '/x.csv', counter: 1 });
            expect(fs.existsSync(path.join(qaToolsDir(), 'state.json'))).toBeFalsy();
        });

        it('loadState merges operational + global keys', () => {
            const config = getConfig();
            stateModule.saveState('projA', { lastProject: 'projA', lastCsvPath: '/x.csv' }, config);

            const loaded = stateModule.loadState('projA', config);

            expect(loaded).toStrictEqual({ lastProject: 'projA', lastCsvPath: '/x.csv' });
        });

        it('save with no global keys still creates global.json (so deletions propagate)', () => {
            const config = getConfig();
            stateModule.saveState('projA', { lastCsvPath: '/x.csv' }, config);

            expect(fs.existsSync(path.join(qaToolsDir(), 'global.json'))).toBeTruthy();
            expect(fs.existsSync(path.join(qaToolsDir(), 'projA', 'state.json'))).toBeTruthy();
        });
    });

    describe('Auto-route (no explicit projectName)', () => {
        it('routes to qaCurrentProject when set', () => {
            const config = getConfig();
            CURRENT_PROJECT = 'projA';
            stateModule.save({ lastCsvPath: '/x.csv', lastProject: 'projA' }, config);

            expect(fs.existsSync(path.join(qaToolsDir(), 'projA', 'state.json'))).toBeTruthy();
            expect(fs.existsSync(path.join(qaToolsDir(), 'state.json'))).toBeFalsy();

            const loaded = stateModule.load(config);

            expect(loaded['lastCsvPath']).toBe('/x.csv');
        });

        it('falls back to legacy state.json when no project selected', () => {
            const config = getConfig();
            CURRENT_PROJECT = '';
            stateModule.save({ lastCsvPath: '/x.csv', lastProject: 'projA' }, config);

            expect(fs.existsSync(path.join(qaToolsDir(), 'state.json'))).toBeTruthy();
            expect(fs.existsSync(path.join(qaToolsDir(), 'projA', 'state.json'))).toBeFalsy();

            const loaded = stateModule.load(config);

            expect(loaded['lastCsvPath']).toBe('/x.csv');
        });
    });

    describe('Safeguards', () => {
        it('throws on invalid explicit projectName (path traversal) for save', () => {
            const config = getConfig();

            expect(() => stateModule.saveState('../evil', { a: 1 }, config)).toThrow(
                'Nome de projeto inválido para state',
            );
        });

        it('throws on invalid explicit projectName (path traversal) for load', () => {
            const config = getConfig();

            expect(() => stateModule.loadState('../evil', config)).toThrow('Nome de projeto inválido para state');
        });

        it('throws when qaCurrentProject is corrupt (invalid) — never silent fallback', () => {
            const config = getConfig();
            CURRENT_PROJECT = '../evil';

            expect(() => stateModule.save({ a: 1 }, config)).toThrow('qaCurrentProject inválido');
            expect(() => stateModule.load(config)).toThrow('qaCurrentProject inválido');
        });

        it('allows valid project names with dots/underscores/hyphens', () => {
            const config = getConfig();

            expect(() => stateModule.saveState('my.proj_1', { lastCsvPath: '/x' }, config)).not.toThrow();
            expect(fs.existsSync(path.join(qaToolsDir(), 'my.proj_1', 'state.json'))).toBeTruthy();
        });
    });

    describe('Migration (legacy → global split)', () => {
        it('splits legacy state.json into global.json + operational state.json', () => {
            const config = getConfig();
            fs.mkdirSync(qaToolsDir(), { recursive: true });
            fs.writeFileSync(
                path.join(qaToolsDir(), 'state.json'),
                JSON.stringify({ lastProject: 'LEG', lastCsvPath: '/old.csv', counter: 9 }),
                'utf8',
            );

            stateModule.migrateLegacyState(config);

            const global = JSON.parse(fs.readFileSync(path.join(qaToolsDir(), 'global.json'), 'utf8')) as Record<
                string,
                unknown
            >;
            const legacy = JSON.parse(fs.readFileSync(path.join(qaToolsDir(), 'state.json'), 'utf8')) as Record<
                string,
                unknown
            >;

            expect(global).toStrictEqual({ lastProject: 'LEG' });
            expect(legacy).toStrictEqual({ lastCsvPath: '/old.csv', counter: 9 });

            const loaded = stateModule.load(config);

            expect(loaded).toStrictEqual({ lastProject: 'LEG', lastCsvPath: '/old.csv', counter: 9 });
        });

        it('is idempotent: second run does not overwrite or error', () => {
            const config = getConfig();
            fs.mkdirSync(qaToolsDir(), { recursive: true });
            fs.writeFileSync(
                path.join(qaToolsDir(), 'state.json'),
                JSON.stringify({ lastProject: 'LEG', counter: 1 }),
                'utf8',
            );
            stateModule.migrateLegacyState(config);
            stateModule.migrateLegacyState(config);

            expect(fs.readFileSync(path.join(qaToolsDir(), 'global.json'), 'utf8')).toContain('LEG');
        });

        it('does nothing when legacy state.json is absent', () => {
            const config = getConfig();
            fs.mkdirSync(qaToolsDir(), { recursive: true });

            expect(() => stateModule.migrateLegacyState(config)).not.toThrow();
            expect(fs.existsSync(path.join(qaToolsDir(), 'global.json'))).toBeFalsy();
        });
    });

    describe('Isolation property (A vs B)', () => {
        const ProjNameArb = fc.stringMatching(/^[A-Za-z0-9._-]+$/).filter((s) => s.length >= 1 && s.length <= 10);
        const OpKeyArb = fc.constantFrom('lastCsvPath', 'lastCypressPath', 'lastLabels', 'counter', 'note');
        const OpValArb = fc.oneof(fc.string({ maxLength: 12 }), fc.integer());
        const StateArb = fc.dictionary(OpKeyArb, OpValArb, { maxKeys: 5 });

        it('state written under A never overwrites B (isolation)', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(ProjNameArb, ProjNameArb, StateArb, (a, b, data) => {
                    fc.pre(a !== b);
                    const config = getConfig();
                    stateModule.saveState(b, { lastCsvPath: '/b-seed.csv', counter: 99 }, config);
                    stateModule.saveState(a, { ...data, lastProject: a }, config);

                    const bLoaded = stateModule.loadState(b, config);

                    expect(bLoaded['lastCsvPath']).toBe('/b-seed.csv');
                    expect(bLoaded['counter']).toBe(99);

                    const aLoaded = stateModule.loadState(a, config);
                    for (const [k, v] of Object.entries(data)) {
                        expect(aLoaded[k]).toStrictEqual(v);
                    }
                }),
                { numRuns: 30 },
            );
        });

        it('global key written under A is visible under B (shared)', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(ProjNameArb, ProjNameArb, (a, b) => {
                    fc.pre(a !== b);
                    const config = getConfig();
                    stateModule.saveState(a, { lastProject: a, _llmConfigured: true }, config);

                    const bLoaded = stateModule.loadState(b, config);

                    expect(bLoaded['lastProject']).toBe(a);
                    expect(bLoaded['_llmConfigured']).toBeTruthy();
                }),
                { numRuns: 30 },
            );
        });

        it('load ∘ save = identity for any operational state under a project', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(ProjNameArb, StateArb, (a, data) => {
                    const config = getConfig();
                    const full = { ...data, lastProject: a, _llmConfigured: true };
                    stateModule.saveState(a, full, config);
                    const loaded = stateModule.loadState(a, config);

                    expect(loaded).toStrictEqual(full);
                }),
                { numRuns: 30 },
            );
        });
    });
});
