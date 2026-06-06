import { EventEmitter } from 'events';
import { Output, defaultOutput } from './output.js';
import * as entryMenuModule from './entry-menu.js';
import * as promptModule from './prompt.js';
import { type ChildProcess } from 'child_process';

vi.mock('./splash', async () => ({ showSplash: vi.fn() }));
vi.mock('./prompt', async () => ({ showSelect: vi.fn() }));
vi.mock('./output', () => {
    const mockOutput = { box: vi.fn(), print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn() },
        defaultOutput: mockOutput,
    };
});

vi.mock('child_process', async () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
const mockSpawn = vi.mocked(spawn);
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
        vi.clearAllMocks();
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
        vi.clearAllMocks();
        vi.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints usage when not TTY', async () => {
        vi.mocked(Output.isTTY).mockReturnValue(false);

        await entryMenu.main();

        expect(defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('npm run jira'));
        expect(defaultOutput.print).toHaveBeenCalledWith(expect.stringContaining('npm run git'));
    });

    it('loops and exits on /exit choice', async () => {
        vi.mocked(Output.isTTY).mockReturnValue(true);
        vi.mocked(Output.isCI).mockReturnValue(false);
        const promptMod = vi.mocked(promptModule);
        promptMod.showSelect.mockResolvedValue('exit');

        await entryMenu.main();

        expect(promptMod.showSelect).toHaveBeenCalledTimes(1);
    });

    it('launches jira module when selected and exits on failure', async () => {
        vi.mocked(Output.isTTY).mockReturnValue(true);
        vi.mocked(Output.isCI).mockReturnValue(false);
        vi.mocked(promptModule).showSelect.mockResolvedValue('jira');
        mockSpawnWithExit(1);

        await entryMenu.main();

        expect(mockSpawn).toHaveBeenCalled();
    });

    it('continues loop on unknown choice', async () => {
        vi.mocked(Output.isTTY).mockReturnValue(true);
        vi.mocked(Output.isCI).mockReturnValue(false);
        vi.mocked(promptModule).showSelect.mockResolvedValueOnce('unknown').mockResolvedValueOnce('exit');

        await entryMenu.main();

        expect(vi.mocked(promptModule).showSelect).toHaveBeenCalledTimes(2);
    });
});
