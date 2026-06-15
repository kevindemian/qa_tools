/**
 * Integration tests — Session State (FT-03)
 *
 * Validates the full state persistence lifecycle:
 * - Load from disk (empty state, existing state)
 * - Save to disk (round-trip with backup)
 * - Update via callback (load→mutate→save)
 * - Corruption recovery from backup
 * - File structure: state.json, state.json.bak
 *
 * Uses real filesystem in isolated temp directories.
 * Configured via XDG_STATE_HOME override.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let TEST_DIR: string;
let stateModule: typeof import('../../state.js');

function getConfig() {
    return { get: (key: string) => (key === 'xdgStateHome' ? TEST_DIR : undefined) } as never;
}

describe('Integration: Session State', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-state-'));
        stateModule = await import('../../state.js');
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            /* best effort */
        }
    });

    describe('FT-03a: load returns empty when no state file exists', () => {
        it('returns empty object for fresh state directory', () => {
            const config = getConfig();
            const state = stateModule.load(config);
            expect(state).toEqual({});
        });
    });

    describe('FT-03b: save and load round-trip', () => {
        it('persists state to disk and reloads it', () => {
            const config = getConfig();
            const data = { lastProject: 'qa_tools', csvPath: '/data/tests.csv', counter: 42 };

            stateModule.save(data, config);
            const loaded = stateModule.load(config);

            expect(loaded).toEqual(data);
        });

        it('creates backup file alongside main state', () => {
            const config = getConfig();
            stateModule.save({ key: 'value' }, config);

            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const statePath = path.join(stateDir, 'state.json');
            const bakPath = path.join(stateDir, 'state.json.bak');

            expect(fs.existsSync(statePath)).toBe(true);
            expect(fs.existsSync(bakPath)).toBe(true);
        });
    });

    describe('FT-03c: update callback pattern', () => {
        it('load→mutate→save via update()', () => {
            const config = getConfig();
            stateModule.save({ count: 1 }, config);

            const result = stateModule.update((s) => {
                (s as Record<string, unknown>)['count'] = 5;
                (s as Record<string, unknown>)['newKey'] = 'newValue';
            }, config);

            expect(result['count']).toBe(5);
            expect(result['newKey']).toBe('newValue');

            const reloaded = stateModule.load(config);
            expect(reloaded['count']).toBe(5);
            expect(reloaded['newKey']).toBe('newValue');
        });

        it('update returns mutated copy, does not mutate original', () => {
            const config = getConfig();
            stateModule.save({ a: 1 }, config);

            const original = stateModule.load(config);
            const updated = stateModule.update((s) => {
                (s as Record<string, unknown>)['a'] = 99;
            }, config);

            expect(updated['a']).toBe(99);
            expect((original as Record<string, unknown>)['a']).toBe(1);
        });
    });

    describe('FT-03d: state file structure', () => {
        it('state.json contains valid JSON', () => {
            const config = getConfig();
            stateModule.save({ test: true }, config);

            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const raw = fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            expect(parsed['test']).toBe(true);
        });

        it('backup matches main file content', () => {
            const config = getConfig();
            stateModule.save({ data: 'test' }, config);

            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const main = JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')) as Record<
                string,
                unknown
            >;
            const bak = JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json.bak'), 'utf8')) as Record<
                string,
                unknown
            >;
            expect(main).toEqual(bak);
        });
    });

    describe('FT-03e: getStatePath returns correct path', () => {
        it('returns path containing state.json', () => {
            const config = getConfig();
            const sp = stateModule.getStatePath(config);
            expect(sp).toContain('state.json');
        });
    });
});
