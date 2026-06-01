import { EventEmitter } from 'events';
import { Output, defaultOutput } from './output';

jest.mock('./splash', () => ({ showSplash: jest.fn() }));
jest.mock('./prompt', () => ({ showSelect: jest.fn() }));
jest.mock('./output', () => {
    const mockOutput = { box: jest.fn(), print: jest.fn() };
    return {
        Output: { isTTY: jest.fn(), isCI: jest.fn() },
        defaultOutput: mockOutput,
    };
});

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({ spawn: mockSpawn }));

let entryMenu: { runModule: (module: 'jira' | 'git') => Promise<void>; main: () => Promise<void> };
beforeAll(() => {
    entryMenu = require('./entry-menu') as typeof entryMenu;
});

function makeMockChildProcess() {
    const cp = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; pid: number };
    cp.stdout = new EventEmitter();
    cp.stderr = new EventEmitter();
    cp.pid = 12345;
    return cp;
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
        const expectedScript = expect.stringContaining('jira_management/main.ts');
        expect(mockSpawn).toHaveBeenCalledWith('npx', ['tsx', expectedScript], expect.any(Object));
        await expect(promise).resolves.toBeUndefined();
    });

    it('spawns npx tsx for git module', async () => {
        mockSpawnWithExit(0);

        const promise = entryMenu.runModule('git');
        const expectedScript = expect.stringContaining('git_triggers/main.ts');
        expect(mockSpawn).toHaveBeenCalledWith('npx', ['tsx', expectedScript], expect.any(Object));
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
        const promptMod = require('./prompt') as { showSelect: jest.Mock };
        promptMod.showSelect.mockResolvedValue('exit');

        await entryMenu.main();

        expect(promptMod.showSelect).toHaveBeenCalledTimes(1);
    });

    it('launches jira module when selected and exits on failure', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(true);
        jest.mocked(Output.isCI).mockReturnValue(false);
        const promptMod = require('./prompt') as { showSelect: jest.Mock };
        promptMod.showSelect.mockResolvedValue('jira');
        mockSpawnWithExit(1);

        await entryMenu.main();

        expect(mockSpawn).toHaveBeenCalled();
    });

    it('continues loop on unknown choice', async () => {
        jest.mocked(Output.isTTY).mockReturnValue(true);
        jest.mocked(Output.isCI).mockReturnValue(false);
        const promptMod = require('./prompt') as { showSelect: jest.Mock };
        promptMod.showSelect.mockResolvedValueOnce('unknown').mockResolvedValueOnce('exit');

        await entryMenu.main();

        expect(promptMod.showSelect).toHaveBeenCalledTimes(2);
    });
});
