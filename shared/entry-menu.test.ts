import { EventEmitter } from 'events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Output, defaultOutput } from './output.js';
import * as entryMenuModule from './entry-menu.js';
import * as promptModule from './prompt.js';
import { type ChildProcess } from 'child_process';

vi.mock('./splash', () => ({ showSplash: vi.fn() }));
vi.mock('./prompt', () => ({ showSelect: vi.fn(), confirm: vi.fn(), info: vi.fn(), warn: vi.fn(), divider: vi.fn() }));
vi.mock('./output', () => {
    const mockOutput = { box: vi.fn(), print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn() },
        defaultOutput: mockOutput,
    };
});

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('./migration/migrate-projects.js', () => ({
    migrateLegacyProjects: vi.fn(() => ({ migrated: 0, skipped: 0, renamed: false })),
}));

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

describe('RunModule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('spawns npx tsx for jira module', async () => {
        expect.hasAssertions();

        mockSpawnWithExit(0);

        const promise = entryMenu.runModule('jira');

        expect(mockSpawn).toHaveBeenCalledWith(
            process.execPath,
            [expect.stringContaining('.bin/tsx'), expect.stringContaining('jira_management/main.ts')],
            expect.any(Object),
        );
        await expect(promise).resolves.toBeUndefined();
    });

    it('spawns npx tsx for git module', async () => {
        expect.hasAssertions();

        mockSpawnWithExit(0);

        const promise = entryMenu.runModule('git');

        expect(mockSpawn).toHaveBeenCalledWith(
            process.execPath,
            [expect.stringContaining('.bin/tsx'), expect.stringContaining('git_triggers/main.ts')],
            expect.any(Object),
        );
        await expect(promise).resolves.toBeUndefined();
    });

    it('rejects on non-zero exit code', async () => {
        expect.hasAssertions();

        mockSpawnWithExit(1);

        const promise = entryMenu.runModule('jira');

        await expect(promise).rejects.toThrow('código 1');
    });

    it('rejects on spawn error', async () => {
        expect.hasAssertions();

        const cp = makeMockChildProcess();
        mockSpawn.mockImplementation(() => {
            setImmediate(() => cp.emit('error', new Error('ENOENT')));
            return cp;
        });

        const promise = entryMenu.runModule('jira');

        await expect(promise).rejects.toThrow('ENOENT');
    });
});

describe('Main', () => {
    let printSpy: ReturnType<typeof vi.spyOn>;
    let xdg: string;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'clear').mockImplementation(() => {});
        printSpy = vi.spyOn(defaultOutput, 'print');
        // Isola registry/state XDG para o boot do menu não enxergar projetos
        // de outras suítes nem migrar config/projects.json do cwd (coberto por
        // testes dedicados de _initInfrastructure).
        xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'em-main-xdg-'));
        process.env['XDG_CONFIG_HOME'] = xdg;
        process.env['XDG_STATE_HOME'] = xdg;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(xdg, { recursive: true, force: true });
    });

    it('prints usage when not TTY', async () => {
        expect.hasAssertions();

        vi.spyOn(Output, 'isTTY').mockReturnValue(false);

        await entryMenu.main();

        expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('npm run jira'));
        expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('npm run git'));
    });

    it('loops and exits on /exit choice', async () => {
        expect.hasAssertions();

        vi.spyOn(Output, 'isTTY').mockReturnValue(true);
        vi.spyOn(Output, 'isCI').mockReturnValue(false);
        const showSelectMock = vi.spyOn(promptModule, 'showSelect');
        showSelectMock.mockResolvedValue('exit');

        await entryMenu.main();

        expect(showSelectMock).toHaveBeenCalledTimes(1);
    });

    it('launches jira module when selected and exits on failure', async () => {
        expect.hasAssertions();

        vi.spyOn(Output, 'isTTY').mockReturnValue(true);
        vi.spyOn(Output, 'isCI').mockReturnValue(false);
        vi.spyOn(promptModule, 'showSelect').mockResolvedValue('jira');
        mockSpawnWithExit(1);

        await entryMenu.main();

        expect(mockSpawn).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([expect.stringContaining('.bin/tsx')]),
            expect.objectContaining({ stdio: 'inherit' }),
        );
    });

    it('continues loop on unknown choice', async () => {
        expect.hasAssertions();

        vi.spyOn(Output, 'isTTY').mockReturnValue(true);
        vi.spyOn(Output, 'isCI').mockReturnValue(false);
        const showSelectMock = vi.spyOn(promptModule, 'showSelect');
        showSelectMock.mockResolvedValueOnce('unknown').mockResolvedValueOnce('exit');

        await entryMenu.main();

        expect(showSelectMock).toHaveBeenCalledTimes(2);
    });
});
