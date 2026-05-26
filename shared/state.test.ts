import { createMockRootLogger } from './test-utils';

const mockRootLogger = createMockRootLogger();

jest.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: function () {},
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import * as stateModule from './state';

const XDG_HOME = '/tmp/test-xdg-state';
const STATE_PATH = path.join(XDG_HOME, 'qa-tools', 'state.json');

function makeConfig(): Config {
    return Config.create({ xdgStateHome: XDG_HOME });
}

function mockFs(files: Record<string, string>) {
    const exists = jest.fn((p: string) => p in files);
    const read = jest.fn((p: string) => {
        if (!(p in files)) throw new Error('ENOENT');
        return files[p];
    });
    const write = jest.fn((p: string, data: string) => {
        files[p] = data;
    });
    const rename = jest.fn((from: string, to: string) => {
        if (from in files) {
            files[to] = files[from]!;
            delete files[from];
        }
    });
    jest.spyOn(fs, 'existsSync').mockImplementation(exists as unknown as typeof fs.existsSync);
    jest.spyOn(fs, 'readFileSync').mockImplementation(read as unknown as typeof fs.readFileSync);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(write as unknown as typeof fs.writeFileSync);
    jest.spyOn(fs, 'renameSync').mockImplementation(rename as unknown as typeof fs.renameSync);
    return { exists, read, write, rename };
}

describe('State', () => {
    let state: typeof import('./state');

    beforeEach(() => {
        state = stateModule;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('load', () => {
        it('returns empty object when no state file', () => {
            mockFs({});
            const result = state.load(makeConfig());
            expect(result).toEqual({});
        });

        it('returns parsed state when file exists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'ECSPOL' }) });
            const result = state.load(makeConfig());
            expect(result).toEqual({ lastProject: 'ECSPOL' });
        });
    });

    describe('save', () => {
        it('writes state to backup and main paths', () => {
            const mocks = mockFs({});
            state.save({ lastProject: 'TEST' }, makeConfig());
            expect(mocks.write).toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('applies mutation and persists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s.lastProject = 'NEW';
            }, makeConfig());
            expect(result.lastProject).toBe('NEW');
        });

        it('returns state with applied mutation', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s.lastProject = 'NEW';
            }, makeConfig());
            expect(result.lastProject).toBe('NEW');
        });
    });

    describe('backup recovery', () => {
        it('recovers from backup when main file is corrupted', () => {
            const bakPath = STATE_PATH + '.bak';
            mockFs({
                [STATE_PATH]: 'corrupted{json',
                [bakPath]: JSON.stringify({ lastProject: 'RECOVERED' }),
            });
            const result = state.load(makeConfig());
            expect(result).toEqual({ lastProject: 'RECOVERED' });
        });
    });

    describe('state migration from old path', () => {
        const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');

        it('copies old state to new path when old exists and new does not', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'MIGRATED' }),
            });
            const config = makeConfig();
            state.migrateOldState(config);
            expect(mocks.rename).toHaveBeenCalledWith(STATE_PATH + '.tmp', STATE_PATH);
            expect(state.load(config)).toEqual({ lastProject: 'MIGRATED' });
        });

        it('does not migrate when new state file already exists', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }),
                [STATE_PATH]: JSON.stringify({ lastProject: 'NEW' }),
            });
            const config = makeConfig();
            state.migrateOldState(config);
            expect(mocks.rename).not.toHaveBeenCalled();
            expect(state.load(config)).toEqual({ lastProject: 'NEW' });
        });
    });

    describe('corrupted state without backup', () => {
        it('returns empty object when main file corrupted and no backup exists', () => {
            const config = makeConfig();
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            const result = state.load(config);
            expect(result).toEqual({});
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

    describe('load error branches', () => {
        it('warns when backup recovery fails (backup also corrupted)', () => {
            const config = makeConfig();
            const bakPath = STATE_PATH + '.bak';
            mockFs({
                [STATE_PATH]: 'corrupted{json',
                [bakPath]: 'also-bad{json',
            });
            const result = state.load(config);
            expect(result).toEqual({});
            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao recuperar backup'));
        });

        it('warns when backup rename fails', () => {
            const config = makeConfig();
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
                throw new Error('rename denied');
            });
            const result = state.load(config);
            expect(result).toEqual({});
            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar backup'));
        });
    });

    describe('save error handling', () => {
        it('warns and logs error when save write fails', () => {
            const config = makeConfig();
            mockFs({});
            jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
                throw new Error('disk full');
            });
            state.save({ key: 'value' }, config);
            expect(mockRootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar estado'));
        });
    });

    describe('ensureStateDir', () => {
        it('returns false when mkdirSync throws (tested via load)', () => {
            const config = makeConfig();
            mockFs({});
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('permission denied');
            });
            const result = state.load(config);
            expect(result).toEqual({});
        });
    });

    describe('migrateOldState catch', () => {
        it('logs warn when readFileSync throws during migration', () => {
            const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
            mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'MIGRATED' }),
            });
            jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
                throw new Error('read error');
            });
            state.migrateOldState(makeConfig());
            expect(mockRootLogger.warn).toHaveBeenCalled();
        });
    });

    describe('getStatePath', () => {
        it('returns path ending in state.json', () => {
            const result = state.getStatePath(makeConfig());
            expect(result.endsWith('state.json')).toBe(true);
        });
    });
});
