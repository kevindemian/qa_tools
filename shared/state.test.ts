const mockRootLogger = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    filePath: undefined as string | undefined,
    writeFileOnly: vi.fn(),
    file: vi.fn(),
    writeSplash: vi.fn(),
    updateSplashStep: vi.fn(),
}));

vi.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: function () {},
}));

import { nonNull } from './test-utils.js';

import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config.js';
import * as stateModule from './state.js';

const XDG_HOME = '/tmp/test-xdg-state';
const STATE_PATH = path.join(XDG_HOME, 'qa-tools', 'state.json');

function makeConfig(): Config {
    return Config.create({ xdgStateHome: XDG_HOME });
}

function mockFs(files: Record<string, string>) {
    const exists = vi.spyOn(fs, 'existsSync').mockImplementation((p) => p.toString() in files);
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation((p: Parameters<typeof fs.readFileSync>[0]) => {
        const ps = p.toString();
        if (!(ps in files)) throw new Error('ENOENT');
        return nonNull(files[ps]);
    });
    const write = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(
            (p: Parameters<typeof fs.writeFileSync>[0], data: Parameters<typeof fs.writeFileSync>[1]) => {
                files[p.toString()] = typeof data === 'string' ? data : '';
            },
        );
    const rename = vi
        .spyOn(fs, 'renameSync')
        .mockImplementation((from: Parameters<typeof fs.renameSync>[0], to: Parameters<typeof fs.renameSync>[1]) => {
            const f = from.toString();
            if (f in files) {
                files[to.toString()] = nonNull(files[f]);
                delete files[f];
            }
        });
    return { exists, read, write, rename };
}

describe('State', () => {
    let state: typeof import('./state.js');

    beforeEach(() => {
        state = stateModule;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Load', () => {
        it('returns empty object when no state file', () => {
            mockFs({});
            const result = state.load(makeConfig());

            expect(result).toStrictEqual({});
        });

        it('returns parsed state when file exists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'ECSPOL' }) });
            const result = state.load(makeConfig());

            expect(result).toStrictEqual({ lastProject: 'ECSPOL' });

            const typed = state.loadTypedState(makeConfig());

            expect(typed).toStrictEqual({ lastProject: 'ECSPOL' });
        });
    });

    describe('Save', () => {
        it('writes state to backup and main paths', () => {
            const mocks = mockFs({});
            state.save({ lastProject: 'TEST' }, makeConfig());

            expect(mocks.write).toHaveBeenCalled();
        });
    });

    describe('Update', () => {
        it('applies mutation and persists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s['lastProject'] = 'NEW';
            }, makeConfig());

            expect(result['lastProject']).toBe('NEW');
        });

        it('returns state with applied mutation', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s['lastProject'] = 'NEW';
            }, makeConfig());

            expect(result['lastProject']).toBe('NEW');
        });
    });

    describe('Backup recovery', () => {
        it('recovers from backup when main file is corrupted', () => {
            const bakPath = STATE_PATH + '.bak';
            mockFs({
                [STATE_PATH]: 'corrupted{json',
                [bakPath]: JSON.stringify({ lastProject: 'RECOVERED' }),
            });
            const result = state.load(makeConfig());

            expect(result).toStrictEqual({ lastProject: 'RECOVERED' });
        });
    });

    describe('State migration from old path', () => {
        const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');

        it('copies old state to new path when old exists and new does not', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'MIGRATED' }),
            });
            const config = makeConfig();
            state.migrateOldState(config);

            expect(mocks.rename).toHaveBeenCalledWith(STATE_PATH + '.tmp', STATE_PATH);
            expect(state.load(config)).toStrictEqual({ lastProject: 'MIGRATED' });
        });

        it('does not migrate when new state file already exists', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }),
                [STATE_PATH]: JSON.stringify({ lastProject: 'NEW' }),
            });
            const config = makeConfig();
            state.migrateOldState(config);

            expect(mocks.rename).not.toHaveBeenCalled();
            expect(state.load(config)).toStrictEqual({ lastProject: 'NEW' });
        });
    });

    describe('Corrupted state without backup', () => {
        it('returns empty object when main file corrupted and no backup exists', () => {
            const config = makeConfig();
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            const result = state.load(config);

            expect(result).toStrictEqual({});
        });

        it('calls rootLogger.warn when state file is corrupted', () => {
            const config = makeConfig();
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            state.load(config);

            expect(mockRootLogger.warn).toHaveBeenCalled();
        });
    });

    describe('Load error branches', () => {
        it('warns when backup recovery fails (backup also corrupted)', () => {
            const config = makeConfig();
            const bakPath = STATE_PATH + '.bak';
            mockFs({
                [STATE_PATH]: 'corrupted{json',
                [bakPath]: 'also-bad{json',
            });
            const result = state.load(config);

            expect(result).toStrictEqual({});
            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao recuperar backup'));
        });

        it('warns when backup rename fails', () => {
            const config = makeConfig();
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
                throw new Error('rename denied');
            });
            const result = state.load(config);

            expect(result).toStrictEqual({});
            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar backup'));
        });
    });

    describe('Save error handling', () => {
        it('warns and logs error when save write fails', () => {
            const config = makeConfig();
            mockFs({});
            vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
                throw new Error('disk full');
            });
            state.save({ key: 'value' }, config);

            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar estado'));
        });
    });

    describe('EnsureStateDir', () => {
        it('returns false when mkdirSync throws (tested via load)', () => {
            const config = makeConfig();
            mockFs({});
            vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('permission denied');
            });
            const result = state.load(config);

            expect(result).toStrictEqual({});
        });
    });

    describe('MigrateOldState catch', () => {
        it('logs warn when readFileSync throws during migration', () => {
            const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
            mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'MIGRATED' }),
            });
            vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
                throw new Error('read error');
            });
            state.migrateOldState(makeConfig());

            expect(mockRootLogger.warn).toHaveBeenCalled();
        });
    });

    describe('GetStatePath', () => {
        it('returns path ending in state.json', () => {
            const result = state.getStatePath(makeConfig());

            expect(result.endsWith('state.json')).toBeTruthy();
        });
    });

    describe('UpdateTyped', () => {
        it('sets _llmConfigured via typed callback', () => {
            const s = state.updateTyped((st) => {
                st._llmConfigured = true;
            }, makeConfig());

            expect(s._llmConfigured).toBeTruthy();

            // Verify persisted
            const loaded = state.loadTypedState(makeConfig());

            expect(loaded._llmConfigured).toBeTruthy();
        });

        it('deletes field via typed callback', () => {
            // First set
            state.updateTyped((st) => {
                st._llmConfigured = true;
                st._llmConfigAttempts = 2;
            }, makeConfig());
            // Then delete
            state.updateTyped((st) => {
                delete st._llmConfigAttempts;
            }, makeConfig());
            const loaded = state.loadTypedState(makeConfig());

            expect(loaded._llmConfigured).toBeTruthy();
            expect(loaded._llmConfigAttempts).toBeUndefined();
        });
    });
});
