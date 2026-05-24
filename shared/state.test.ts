import { createMockRootLogger } from './test-utils';

const mockRootLogger = createMockRootLogger();

jest.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: function () {},
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import * as stateModule from './state';

const XDG_HOME = '/tmp/test-xdg-state';
const STATE_PATH = path.join(XDG_HOME, 'qa-tools', 'state.json');

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
            files[to] = files[from];
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

    beforeAll(() => {
        process.env.XDG_STATE_HOME = XDG_HOME;
    });

    afterAll(() => {
        delete process.env.XDG_STATE_HOME;
    });

    beforeEach(() => {
        jest.isolateModules(() => {
            state = require('./state') as typeof import('./state');
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('load', () => {
        it('returns empty object when no state file', () => {
            mockFs({});
            const result = state.load();
            expect(result).toEqual({});
        });

        it('returns parsed state when file exists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'ECSPOL' }) });
            const result = state.load();
            expect(result).toEqual({ lastProject: 'ECSPOL' });
        });
    });

    describe('save', () => {
        it('writes state to backup and main paths', () => {
            const mocks = mockFs({});
            state.save({ lastProject: 'TEST' });
            expect(mocks.write).toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('applies mutation and persists', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s.lastProject = 'NEW';
            });
            expect(result.lastProject).toBe('NEW');
        });

        it('returns state with applied mutation', () => {
            mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
            const result = state.update((s) => {
                s.lastProject = 'NEW';
            });
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
            const result = state.load();
            expect(result).toEqual({ lastProject: 'RECOVERED' });
        });
    });

    describe('state migration from old path', () => {
        const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('copies old state to new path when old exists and new does not', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'MIGRATED' }),
            });
            jest.isolateModules(() => {
                state = require('./state') as typeof import('./state');
            });
            expect(mocks.rename).toHaveBeenCalledWith(STATE_PATH + '.tmp', STATE_PATH);
            expect(state.load()).toEqual({ lastProject: 'MIGRATED' });
        });

        it('does not migrate when new state file already exists', () => {
            const mocks = mockFs({
                [OLD_STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }),
                [STATE_PATH]: JSON.stringify({ lastProject: 'NEW' }),
            });
            jest.isolateModules(() => {
                state = require('./state') as typeof import('./state');
            });
            expect(mocks.rename).not.toHaveBeenCalled();
            expect(state.load()).toEqual({ lastProject: 'NEW' });
        });
    });

    describe('corrupted state without backup', () => {
        let rootLogger: import('./logger').Logger;

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('returns empty object when main file corrupted and no backup exists', () => {
            jest.isolateModules(() => {
                rootLogger = (require('./logger') as typeof import('./logger')).rootLogger;
                state = require('./state') as typeof import('./state');
            });
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            const result = state.load();
            expect(result).toEqual({});
        });

        it('calls rootLogger.warn when state file is corrupted', () => {
            jest.isolateModules(() => {
                rootLogger = (require('./logger') as typeof import('./logger')).rootLogger;
                state = require('./state') as typeof import('./state');
            });
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            state.load();
            expect(rootLogger.warn).toHaveBeenCalled();
        });
    });

    describe('load error branches', () => {
        let rootLogger: import('./logger').Logger;

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('warns when backup recovery fails (backup also corrupted)', () => {
            jest.isolateModules(() => {
                rootLogger = (require('./logger') as typeof import('./logger')).rootLogger;
                state = require('./state') as typeof import('./state');
            });
            const bakPath = STATE_PATH + '.bak';
            mockFs({
                [STATE_PATH]: 'corrupted{json',
                [bakPath]: 'also-bad{json',
            });
            const result = state.load();
            expect(result).toEqual({});
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao recuperar backup'));
        });

        it('warns when backup rename fails', () => {
            jest.isolateModules(() => {
                rootLogger = (require('./logger') as typeof import('./logger')).rootLogger;
                state = require('./state') as typeof import('./state');
            });
            mockFs({
                [STATE_PATH]: 'corrupted{json',
            });
            jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
                throw new Error('rename denied');
            });
            const result = state.load();
            expect(result).toEqual({});
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar backup'));
        });
    });

    describe('save error handling', () => {
        let rootLogger: import('./logger').Logger;

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('warns and logs error when save write fails', () => {
            jest.isolateModules(() => {
                rootLogger = (require('./logger') as typeof import('./logger')).rootLogger;
                state = require('./state') as typeof import('./state');
            });
            mockFs({});
            jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
                throw new Error('disk full');
            });
            state.save({ key: 'value' });
            expect(rootLogger.error).toHaveBeenCalledWith(expect.stringContaining('Falha ao salvar estado'));
        });
    });
});
