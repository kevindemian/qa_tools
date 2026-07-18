/**
 * Integration tests — Fase 5 (050–055): Entry Menu project selection + `--project` flag.
 *
 * Covers: 050 selectProject auto-select (no prompt) + D-U4 protection, 053 moduleEnv propagation,
 * 055 `--project` global parse (cli-args) and priority resolution (cli-dispatch applyProjectContext).
 * Interactive branches of selectProject/manageProjects are exercised manually (require TTY).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Config from '../../config-accessor.js';
import { addProject } from '../../project-registry.js';
import {
    clearCurrentProject,
    getCurrentProject,
    getCurrentProjectDir,
    setCurrentProject,
} from '../../project-context.js';
import { isProjectProtected, moduleEnv, selectProject } from '../../ui/entry-menu.js';
import { _extractProject } from '../../../git_triggers/cli-args.js';
import { applyProjectContext } from '../../../git_triggers/cli-dispatch.js';

describe('Fase 5 — Entry Menu project selection + --project flag (integration)', () => {
    let TMP: string;
    let PROJ: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fase5-test-'));
        PROJ = fs.mkdtempSync(path.join(os.tmpdir(), 'fase5-proj-'));

        process.env['XDG_CONFIG_HOME'] = TMP;
        process.env['XDG_STATE_HOME'] = TMP;
        delete process.env['QA_CURRENT_PROJECT'];
        delete process.env['QA_PROJECT_DIR'];

        Config.reset();
    });

    afterEach(() => {
        clearCurrentProject();
        Config.reset();

        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['XDG_STATE_HOME'];
        delete process.env['QA_CURRENT_PROJECT'];
        delete process.env['QA_PROJECT_DIR'];

        fs.rmSync(TMP, { recursive: true, force: true });
        fs.rmSync(PROJ, { recursive: true, force: true });
    });

    describe('SelectProject e moduleEnv (050/053)', () => {
        it('moduleEnv propaga QA_CURRENT_PROJECT e QA_PROJECT_DIR quando há projeto ativo', () => {
            expect.hasAssertions();

            addProject({ name: 'alpha', dir: PROJ });
            setCurrentProject('alpha');

            const env = moduleEnv();

            expect(env['QA_CURRENT_PROJECT']).toBe('alpha');
            expect(env['QA_PROJECT_DIR']).toBe(PROJ);
        });

        it('moduleEnv retorna strings vazias quando nenhum projeto está ativo', () => {
            expect.hasAssertions();

            const env = moduleEnv();

            expect(env['QA_CURRENT_PROJECT']).toBe('');
            expect(env['QA_PROJECT_DIR']).toBe('');
        });

        it('selectProject auto-seleciona o único projeto registrado (sem prompt)', async () => {
            expect.hasAssertions();

            addProject({ name: 'solo', dir: PROJ });

            const selected = await selectProject();

            expect(selected).toBeTruthy();
            expect(getCurrentProject()).toBe('solo');
            expect(getCurrentProjectDir()).toBe(PROJ);
        });
    });

    describe('D-U4 protection migrated (050/052)', () => {
        it('isProjectProtected é true somente quando migrated=true', () => {
            expect.hasAssertions();

            expect(isProjectProtected({ name: 'a', dir: '/x', valid: true })).toBeFalsy();
            expect(isProjectProtected({ name: 'a', dir: '/x', valid: true, migrated: true })).toBeTruthy();
        });
    });

    describe('ExtractProject global scan (055)', () => {
        it('extrai --project', () => {
            expect.hasAssertions();

            expect(_extractProject(['--project', 'demo', 'other'])).toBe('demo');
        });

        it('extrai -p (alias)', () => {
            expect.hasAssertions();

            expect(_extractProject(['-p', 'demo'])).toBe('demo');
        });

        it('ignora valor que parece flag', () => {
            expect.hasAssertions();

            expect(_extractProject(['--project', '--batch'])).toBeUndefined();
        });

        it('retorna undefined sem flag', () => {
            expect.hasAssertions();

            expect(_extractProject(['--batch'])).toBeUndefined();
        });
    });

    describe('ApplyProjectContext prioridade (055)', () => {
        it('flag vence a env var', () => {
            expect.hasAssertions();

            addProject({ name: 'flagp', dir: PROJ });
            addProject({ name: 'envp', dir: PROJ });

            process.env['QA_CURRENT_PROJECT'] = 'envp';

            const resolved = applyProjectContext({ project: 'flagp' });

            expect(resolved).toBe('flagp');
            expect(getCurrentProject()).toBe('flagp');
        });

        it('usa env var quando não há flag', () => {
            expect.hasAssertions();

            addProject({ name: 'envp', dir: PROJ });

            process.env['QA_CURRENT_PROJECT'] = 'envp';

            const resolved = applyProjectContext({});

            expect(resolved).toBe('envp');
            expect(getCurrentProject()).toBe('envp');
        });

        it('retorna undefined quando nenhuma fonte define projeto', () => {
            expect.hasAssertions();

            const resolved = applyProjectContext({});

            expect(resolved).toBeUndefined();
            expect(getCurrentProject()).toBeUndefined();
        });

        it('lança (fail-loud) para projeto inválido/desconhecido', () => {
            expect.hasAssertions();

            expect(() => applyProjectContext({ project: 'inexistente' })).toThrow(/não registrado/);
        });
    });
});
