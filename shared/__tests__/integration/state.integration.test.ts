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
import { rootLogger } from '../../logger.js';

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
        } catch (err) {
            rootLogger.warn('Cleanup failed for test dir: ' + String(err));
        }
    });

    describe('FT-03a: load returns empty when no state file exists', () => {
        it('returns empty object for fresh state directory', () => {
            const config = getConfig();
            const state = stateModule.load(config);

            expect(state).toStrictEqual({});
        });
    });

    describe('FT-03b: save and load round-trip', () => {
        it('persists state to disk and reloads it', () => {
            const config = getConfig();
            const data = { lastProject: 'qa_tools', csvPath: '/data/tests.csv', counter: 42 };

            stateModule.save(data, config);
            const loaded = stateModule.load(config);

            expect(loaded).toStrictEqual(data);
        });

        it('creates backup file alongside main state', () => {
            const config = getConfig();
            stateModule.save({ key: 'value' }, config);

            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const statePath = path.join(stateDir, 'state.json');
            const bakPath = path.join(stateDir, 'state.json.bak');

            expect(fs.existsSync(path.resolve(statePath))).toBeTruthy();
            expect(fs.existsSync(path.resolve(bakPath))).toBeTruthy();
        });
    });

    describe('FT-03c: update callback pattern', () => {
        it('load→mutate→save via update()', () => {
            const config = getConfig();
            stateModule.save({ count: 1 }, config);

            const result = stateModule.update((s) => {
                s['count'] = 5;
                s['newKey'] = 'newValue';
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
                s['a'] = 99;
            }, config);

            expect(updated['a']).toBe(99);
            expect(original['a']).toBe(1);
        });
    });

    describe('FT-03d: state file structure', () => {
        it('state.json contains valid JSON', () => {
            const config = getConfig();
            stateModule.save({ test: true }, config);

            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const raw = fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            expect(parsed['test']).toBeTruthy();
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

            expect(main).toStrictEqual(bak);
        });
    });

    describe('FT-03e: getStatePath returns correct path', () => {
        it('returns path containing state.json', () => {
            const config = getConfig();
            const sp = stateModule.getStatePath(config);

            expect(sp).toContain('state.json');
        });
    });

    describe('FT-03f: backup recovery on corruption', () => {
        it('recovers from backup when state.json is corrupted', async () => {
            expect.hasAssertions();

            const config = getConfig();
            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const statePath = path.join(stateDir, 'state.json');
            const bakPath = path.join(stateDir, 'state.json.bak');

            stateModule.save({ lastProject: 'ORIGINAL', counter: 42 }, config);
            const beforeCorruption = stateModule.load(config);

            expect(beforeCorruption).toStrictEqual({ lastProject: 'ORIGINAL', counter: 42 });

            fs.writeFileSync(path.resolve(statePath), '{corrupted json!!!', 'utf8');

            expect(fs.existsSync(path.resolve(bakPath))).toBeTruthy();

            vi.resetModules();
            const freshModule = await import('../../state.js');
            const recovered = freshModule.load(config);

            expect(recovered).toStrictEqual({ lastProject: 'ORIGINAL', counter: 42 });
        });

        it('returns empty object when both state and backup are corrupted', async () => {
            expect.hasAssertions();

            const config = getConfig();
            const stateDir = path.join(TEST_DIR, 'qa-tools');
            const statePath = path.join(stateDir, 'state.json');
            const bakPath = path.join(stateDir, 'state.json.bak');

            stateModule.save({ data: 'valid' }, config);

            fs.writeFileSync(path.resolve(statePath), '{garbage}', 'utf8');
            fs.writeFileSync(path.resolve(bakPath), 'also{broken}', 'utf8');

            vi.resetModules();
            const freshModule = await import('../../state.js');
            const result = freshModule.load(config);

            expect(result).toStrictEqual({});
        });
    });
});
