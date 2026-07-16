import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess, SpawnOptions } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Config from '../config-accessor.js';
import { addProject, removeProject } from '../project-registry.js';
import { clearCurrentProject, getCurrentProject, isProjectSelected, setCurrentProject } from '../project-context.js';
import { type MenuUI, moduleEnv, runModule, selectProject, _initInfrastructure } from '../entry-menu.js';
import { listProjects } from '../project-registry.js';

function makeUI(selectQueue: string[], promptQueue: string[] = [], confirmQueue: boolean[] = []) {
    const infoCalls: string[] = [];
    const warnCalls: string[] = [];

    const ui: MenuUI = {
        showSelect: (_label: string, _choices?: unknown) => {
            const v = selectQueue.shift();
            if (v === undefined) throw new Error('showSelect queue empty');
            return Promise.resolve(v);
        },
        smartPrompt: (_question: string, _options?: unknown) => {
            const v = promptQueue.shift();
            if (v === undefined) throw new Error('smartPrompt queue empty');
            return Promise.resolve(v);
        },
        confirm: (_label: string, _defaultYes = false) => confirmQueue.shift() ?? false,
        info: (message: string) => {
            infoCalls.push(message);
        },
        warn: (message: string) => {
            warnCalls.push(message);
        },
        divider: () => {},
    };

    return { ui, infoCalls, warnCalls };
}

function fakeSpawn(code = 0): typeof import('child_process').spawn {
    return ((_cmd: string, _args: string[], _opts: SpawnOptions) => {
        const c = new EventEmitter() as unknown as ChildProcess;
        queueMicrotask(() => c.emit('exit', code));
        return c;
    }) as typeof import('child_process').spawn;
}

describe('Entry-menu (Fase 5 interactive wrappers, DI)', () => {
    let TMP: string;
    let PROJ: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'em-di-'));
        PROJ = fs.mkdtempSync(path.join(os.tmpdir(), 'em-di-proj-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        process.env['XDG_STATE_HOME'] = TMP;
        Config.reset();
    });

    afterEach(() => {
        clearCurrentProject();
        Config.reset();
        fs.rmSync(TMP, { recursive: true, force: true });
        fs.rmSync(PROJ, { recursive: true, force: true });
    });

    it('com 0 projetos escolhe modo legado e retorna false', async () => {
        expect.hasAssertions();

        const { ui } = makeUI(['__legacy__']);

        await expect(selectProject(ui)).resolves.toBeFalsy();
    });

    it('com 0 projetos adicionar com diretório vazio emite warning', async () => {
        expect.hasAssertions();

        const { ui, warnCalls } = makeUI(['__add__'], ['']);

        await expect(selectProject(ui)).resolves.toBeFalsy();
        expect(warnCalls.some((w) => w.includes('vazio'))).toBeTruthy();
    });

    it('com 0 projetos adicionar com diretório válido dispara setup', async () => {
        expect.hasAssertions();

        const { ui } = makeUI(['__add__'], [PROJ]);

        await expect(selectProject(ui)).resolves.toBeFalsy();
    });

    it('com 1 projeto auto-seleciona sem prompt', async () => {
        expect.hasAssertions();

        addProject({ name: 'solo', dir: PROJ });
        const { ui } = makeUI([]);

        await expect(selectProject(ui)).resolves.toBeTruthy();
    });

    it('com 1 projeto inválido selectSingle emite warning de diretório', async () => {
        expect.hasAssertions();

        const badDir = path.join(PROJ, 'missing-dir');
        addProject({ name: 'bad', dir: badDir });
        const { ui, warnCalls } = makeUI([]);

        await expect(selectProject(ui)).resolves.toBeTruthy();
        expect(warnCalls.some((w) => w.includes('inválido'))).toBeTruthy();
    });

    it('com vários projetos seleciona projeto existente', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        addProject({ name: 'b', dir: PROJ });
        const { ui } = makeUI(['a']);

        await expect(selectProject(ui)).resolves.toBeTruthy();
    });

    it('com vários projetos escolha inválida retorna false', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        addProject({ name: 'b', dir: PROJ });
        const { ui } = makeUI(['zzz']);

        await expect(selectProject(ui)).resolves.toBeFalsy();
    });

    it('com vários projetos adicionar vazio e depois legado', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        addProject({ name: 'b', dir: PROJ });
        const { ui } = makeUI(['__add__', '__legacy__'], ['']);

        await expect(selectProject(ui)).resolves.toBeFalsy();
    });

    it('com vários projetos gerencia projeto migrado protegido e seleciona válido', async () => {
        expect.hasAssertions();

        addProject({ name: 'm', dir: PROJ, migrated: true });
        addProject({ name: 'a', dir: PROJ });
        const { ui, warnCalls } = makeUI(['__manage__', 'm', '__back__', 'a']);

        await expect(selectProject(ui)).resolves.toBeTruthy();
        expect(warnCalls.some((w) => w.includes('protegido'))).toBeTruthy();
        expect(getCurrentProject()).toBe('a');
    });

    it('com vários projetos gerencia editar diretório', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        addProject({ name: 'b', dir: PROJ });
        const newDir = path.join(PROJ, 'edit');
        const { ui, infoCalls } = makeUI(['__manage__', 'a', 'edit', '__back__', 'a'], [newDir]);

        await expect(selectProject(ui)).resolves.toBeTruthy();
        expect(infoCalls.some((i) => i.includes('atualizado'))).toBeTruthy();
        expect(getCurrentProject()).toBe('a');
    });

    it('com vários projetos gerencia remover e seleciona outro', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        addProject({ name: 'b', dir: PROJ });
        const { ui, infoCalls } = makeUI(['__manage__', 'a', 'remove', '__back__', 'b']);

        await expect(selectProject(ui)).resolves.toBeTruthy();
        expect(infoCalls.some((i) => i.includes('removido'))).toBeTruthy();
        expect(removeProject('a')).toBeFalsy();
        expect(getCurrentProject()).toBe('b');
    });

    it('moduleEnv propaga projeto ativo', () => {
        expect.hasAssertions();

        addProject({ name: 'alpha', dir: PROJ });
        setCurrentProject('alpha');
        const env = moduleEnv();

        expect(env['QA_CURRENT_PROJECT']).toBe('alpha');
        expect(env['QA_PROJECT_DIR']).toBe(PROJ);
    });

    it('moduleEnv retorna strings vazias sem projeto ativo', () => {
        expect.hasAssertions();

        const env = moduleEnv();

        expect(env['QA_CURRENT_PROJECT']).toBe('');
        expect(env['QA_PROJECT_DIR']).toBe('');
    });

    it('runModule resolve com código 0 para jira e git', async () => {
        expect.hasAssertions();

        await expect(runModule('jira', fakeSpawn(0))).resolves.toBeUndefined();
    });

    it('_initInfrastructure migra config/projects.json legado para o registry XDG (Fase 8.081)', () => {
        expect.hasAssertions();

        const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-legacy-'));
        fs.mkdirSync(path.join(legacyDir, 'config'), { recursive: true });
        fs.writeFileSync(
            path.join(legacyDir, 'config', 'projects.json'),
            JSON.stringify({ legacyproj: 'LEG-1' }),
            'utf8',
        );

        _initInfrastructure(legacyDir);

        const names = listProjects().map((p) => p.name);

        expect(names).toContain('legacyproj');

        const entry = listProjects().find((p) => p.name === 'legacyproj');

        expect(entry?.projectId).toBe('LEG-1');
        expect(entry?.migrated).toBeTruthy();
        expect(fs.existsSync(path.join(legacyDir, 'config', 'projects.json'))).toBeFalsy();
        expect(fs.existsSync(path.join(legacyDir, 'config', 'projects.json.migrated'))).toBeTruthy();
    });

    it('_initInfrastructure é no-op quando não há legado', () => {
        expect.hasAssertions();

        const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-empty-'));

        expect(() => _initInfrastructure(emptyDir)).not.toThrow();
        expect(listProjects()).toHaveLength(0);
    });

    it('runModule rejeita em código não-zero', async () => {
        expect.hasAssertions();

        await expect(runModule('jira', fakeSpawn(1))).rejects.toThrow(/código/);
    });

    it('isProjectSelected reflete seleção', async () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: PROJ });
        const { ui } = makeUI(['a']);

        await selectProject(ui);

        expect(isProjectSelected()).toBeTruthy();
    });
});
