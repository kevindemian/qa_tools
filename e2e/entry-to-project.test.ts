import { EventEmitter } from 'events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'child_process';
import { showSplash } from '../shared/splash.js';
import { main as entryMain } from '../shared/entry-menu.js';
import { showSelect } from '../shared/prompt.js';
import { Output } from '../shared/output.js';

vi.mock('../shared/splash', () => ({ showSplash: vi.fn() }));
vi.mock('../shared/prompt', () => ({
    showSelect: vi.fn(),
    confirm: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    divider: vi.fn(),
}));
vi.mock('../shared/output', () => {
    const mockOutput = { box: vi.fn(), print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn() },
        defaultOutput: mockOutput,
    };
});
// Isola a migração legado→XDG: é coberta por testes dedicados de
// _initInfrastructure. Evita renomear config/projects.json do cwd e poluir
// o registry durante o boot do menu nesta suíte e2e.
vi.mock('../shared/migration/migrate-projects.js', () => ({
    migrateLegacyProjects: vi.fn(() => ({ migrated: 0, skipped: 0, renamed: false })),
}));

vi.mock('child_process', () => ({ spawn: vi.fn() }));
import { spawn } from 'child_process';

function makeMockChildProcess(): ChildProcess {
    return new EventEmitter() as ChildProcess;
}

function mockSpawnWithExit(code: number): void {
    const cp = makeMockChildProcess();
    vi.mocked(spawn).mockImplementation(() => {
        setImmediate(() => cp.emit('exit', code));
        return cp;
    });
}

describe('Entry-menu to module spawn — full flow (CR-3c)', () => {
    let xdg: string;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'clear').mockImplementation(() => {});
        xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-entry-xdg-'));
        process.env['XDG_CONFIG_HOME'] = xdg;
        process.env['XDG_STATE_HOME'] = xdg;
    });

    afterEach(() => {
        fs.rmSync(xdg, { recursive: true, force: true });
    });

    it('launches git module on selection and spawns correct command', async () => {
        expect.hasAssertions();

        vi.mocked(Output).isTTY.mockReturnValue(true);
        vi.mocked(Output).isCI.mockReturnValue(false);
        vi.mocked(showSelect).mockResolvedValueOnce('git').mockResolvedValueOnce('exit');
        mockSpawnWithExit(0);

        await entryMain();

        expect(showSplash).toHaveBeenCalledWith();
        expect(showSelect).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            expect.arrayContaining([expect.objectContaining({ value: 'git' })]),
        );
        expect(spawn).toHaveBeenCalledWith(
            process.execPath,
            [expect.stringContaining('.bin/tsx'), expect.stringContaining('git_triggers/main.ts')],
            expect.objectContaining({
                stdio: 'inherit',
                cwd: expect.any(String) as string,
            }),
        );
    });

    it('launches jira module on selection and spawns correct command', async () => {
        expect.hasAssertions();

        vi.mocked(Output).isTTY.mockReturnValue(true);
        vi.mocked(Output).isCI.mockReturnValue(false);
        vi.mocked(showSelect).mockResolvedValueOnce('jira').mockResolvedValueOnce('exit');
        mockSpawnWithExit(0);

        await entryMain();

        expect(spawn).toHaveBeenCalledWith(
            process.execPath,
            [expect.stringContaining('.bin/tsx'), expect.stringContaining('jira_management/main.ts')],
            expect.any(Object),
        );
    });

    it('sets stdio inherit and cwd in spawned process', async () => {
        expect.hasAssertions();

        vi.mocked(Output).isTTY.mockReturnValue(true);
        vi.mocked(Output).isCI.mockReturnValue(false);
        vi.mocked(showSelect).mockResolvedValueOnce('git').mockResolvedValueOnce('exit');
        mockSpawnWithExit(0);

        await entryMain();

        const calls = vi.mocked(spawn).mock.calls;
        const callOpts = calls[0]?.[2];

        expect(callOpts).toBeDefined();

        expect(callOpts).toHaveProperty('stdio', 'inherit');
        expect(callOpts).toHaveProperty('cwd');
        expect(callOpts?.cwd).toStrictEqual(expect.any(String));
    });

    it('exits loop on non-zero exit from module', async () => {
        expect.hasAssertions();

        vi.mocked(Output).isTTY.mockReturnValue(true);
        vi.mocked(Output).isCI.mockReturnValue(false);
        vi.mocked(showSelect).mockResolvedValueOnce('jira');
        mockSpawnWithExit(1);

        await entryMain();

        expect(showSelect).toHaveBeenCalledTimes(1);
    });
});
