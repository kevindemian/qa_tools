import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Config from '../config-accessor.js';
import { selectProject, moduleEnv } from '../ui/entry-menu.js';
import { addProject, getProject, removeProject } from '../project-registry.js';
import type { MenuUI } from '../ui/entry-menu.js';

function makeUi(selectQueue: Array<string | undefined>): { ui: MenuUI; warns: string[]; infos: string[] } {
    const warns: string[] = [];
    const infos: string[] = [];
    let idx = 0;
    const ui: MenuUI = {
        showSelect: vi.fn((_label: string, _choices: unknown) => Promise.resolve(selectQueue[idx++] ?? '')),
        confirm: vi.fn(() => true),
        info: vi.fn((m: string) => {
            infos.push(m);
        }),
        warn: vi.fn((m: string) => {
            warns.push(m);
        }),
        divider: vi.fn(),
        smartPrompt: vi.fn(() => Promise.resolve('')),
    };
    return { ui, warns, infos };
}

describe('SelectProject entry menu (real logic, injected UI, no TTY/spawn)', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-menu-test-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        Config.reset();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        Config.reset();
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('auto-selects the single registered project (valid) and returns true', async () => {
        expect.hasAssertions();

        addProject({ name: 'solo', dir: TMP });
        const { ui } = makeUi([]);
        const result = await selectProject(ui);

        expect(result).toBeTruthy();
        expect(getProject('solo')?.name).toBe('solo');
        expect(Config.get('qaCurrentProject')).toBe('solo');
    });

    it('warns but still selects a single project with an invalid directory', async () => {
        expect.hasAssertions();

        const invalidDir = path.join(TMP, 'does-not-exist');
        addProject({ name: 'broken', dir: invalidDir });
        const { ui, warns } = makeUi([]);
        const result = await selectProject(ui);

        expect(result).toBeTruthy();
        expect(warns.some((w) => w.includes('inválido'))).toBeTruthy();
    });

    it('selects among many projects via the menu and sets the active project', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: TMP });
        addProject({ name: 'b', dir: TMP });
        const { ui } = makeUi(['b']);
        const result = await selectProject(ui);

        expect(result).toBeTruthy();
        expect(Config.get('qaCurrentProject')).toBe('b');
    });

    it('returns false when the chosen project name is unknown (many-project path)', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: TMP });
        addProject({ name: 'b', dir: TMP });
        const { ui } = makeUi(['ghost']);
        const result = await selectProject(ui);

        expect(result).toBeFalsy();
    });

    it('returns false when no projects are registered and legacy mode chosen', async () => {
        expect.hasAssertions();

        const { ui } = makeUi(['__legacy__']);
        const result = await selectProject(ui);

        expect(result).toBeFalsy();
        expect(Config.get('qaCurrentProject')).toBe('');
    });

    it('moduleEnv propagates the active project via QA_CURRENT_PROJECT / QA_PROJECT_DIR', () => {
        expect.hasAssertions();

        addProject({ name: 'envproj', dir: TMP });
        Config.set('qaCurrentProject', 'envproj');
        Config.set('qaProjectDir', TMP);
        const env = moduleEnv();

        expect(env['QA_CURRENT_PROJECT']).toBe('envproj');
        expect(env['QA_PROJECT_DIR']).toBe(TMP);
    });

    it('removing a project updates the registry (no orphaned entry)', () => {
        expect.hasAssertions();

        addProject({ name: 'tmp', dir: TMP });

        expect(getProject('tmp')).toBeDefined();

        removeProject('tmp');

        expect(getProject('tmp')).toBeUndefined();
    });
});
