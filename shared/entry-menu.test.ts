import { EventEmitter } from 'events';
import { Output, defaultOutput } from './output';
import * as entryMenuModule from './entry-menu';
import * as promptModule from './prompt';
import { type ChildProcess } from 'child_process';

jest.mock('./splash', () => ({ showSplash: jest.fn() }));
jest.mock('./prompt', () => ({ showSelect: jest.fn() }));
jest.mock('./output', () => {
    const mockOutput = { box: jest.fn(), print: jest.fn() };
    return {
        Output: { isTTY: jest.fn(), isCI: jest.fn() },
        defaultOutput: mockOutput,
    };
});

jest.mock('child_process', () => ({ spawn: jest.fn() }));

import { spawn } from 'child_process';
const mockSpawn = jest.mocked(spawn);
const entryMenu = entryMenuModule;

function makeMockChildProcess(): ChildProcess {
    return new EventEmitter() as ChildProcess;
}

function mockSpawnWithExit(code: number): void {
    const cp = makeMockChildProcess();
    mockSpawn.mockImplementation(() => {
        setImmediate(() => cp.emit('exit', code));
        return cp;
    });
}

describe('runModule', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('spawns npx tsx for jira module', async () => {
        mockSpawnWithExit(0);

        const promise = entryMenu.runModule('jira');
        expect(mockSpawn).toHaveBeenCalledWith(
            'npx',
            ['tsx', expect.stringContaining('jira_management/main.ts')],
            expect.any(Object),
        );
        await expect(promise).resolves.toBeUndefined();
    });

    it('spawns npx tsx for git module', async () => {
        mockSpawnWithExit(0);

        const promise = entryMenu.runModule('git');
        expect(mockSpawn).toHaveBeenCalledWith(
            'npx',
            ['tsx', expect.stringContaining('git_triggers/main.ts')],
            expect.any(Object),
        );
        await expect(promise).resolves.toBeUndefined();
    });

    it('rejects on non-zero exit code', async () => {
        mockSpawnWithExit(1);

        const promise = entryMenu.runModule('jira');
        await expect(promise).rejects.toThrow('código 1');
    });

    it('rejects on spawn error', async () => {
        const cp = makeMockChildProcess();
        mockSpawn.mockImplementation(() => {
            setImmediate(() => cp.emit('error', new Error('ENOENT')));
            return cp;
        });

        const promise = entryMenu.runModule('jira');
        await expect(promise).rejects.toThrow('ENOENT');
    });
});

describe('main', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('prints usage when not TTY', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(false);

        await entryMenu.main();

        expect(defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('npm run jira'));
        expect(defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('npm run git'));
    });

    it('loops and exits on /exit choice', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(true);
        jest.mocked(Output.isCI).mockReturnValue(false);
        const promptMod = jest.mocked(promptModule);
        promptMod.showSelect.mockResolvedValue('exit');

        await entryMenu.main();

        expect(promptMod.showSelect).toHaveBeenCalledTimes(1);
    });

    it('launches jira module when selected and exits on failure', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(true);
        jest.mocked(Output.isCI).mockReturnValue(false);
        jest.mocked(promptModule).showSelect.mockResolvedValue('jira');
        mockSpawnWithExit(1);

        await entryMenu.main();

        expect(mockSpawn).toHaveBeenCalled();
    });

    it('continues loop on unknown choice', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(true);
        jest.mocked(Output.isCI).mockReturnValue(false);
        jest.mocked(promptModule).showSelect.mockResolvedValueOnce('unknown').mockResolvedValueOnce('exit');

        await entryMenu.main();

        expect(jest.mocked(promptModule).showSelect).toHaveBeenCalledTimes(2);
    });
});
