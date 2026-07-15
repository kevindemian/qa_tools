import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Config from '../config-accessor.js';
import {
    getCurrentProject,
    getCurrentProjectDir,
    isProjectSelected,
    setCurrentProject,
    clearCurrentProject,
    loadProjectConfig,
} from '../project-context.js';
import { addProject, projectEnvPath } from '../project-registry.js';

describe('Project Context (unit)', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-test-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        Config.reset();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['QA_CURRENT_PROJECT'];
        delete process.env['QA_PROJECT_DIR'];
        delete process.env['QA_PROJECT_PROVIDER'];
        Config.reset();
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('returns undefined when no project is selected (legado)', () => {
        expect.hasAssertions();

        expect(getCurrentProject()).toBeUndefined();
        expect(getCurrentProjectDir()).toBeUndefined();
        expect(isProjectSelected()).toBeFalsy();
    });

    it('setCurrentProject reflects in getters and isProjectSelected', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP });
        setCurrentProject('ibabs');

        expect(getCurrentProject()).toBe('ibabs');
        expect(getCurrentProjectDir()).toBe(TMP);
        expect(isProjectSelected()).toBeTruthy();
    });

    it('clearCurrentProject resets selection', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP });
        setCurrentProject('ibabs');
        clearCurrentProject();

        expect(getCurrentProject()).toBeUndefined();
        expect(getCurrentProjectDir()).toBeUndefined();
        expect(isProjectSelected()).toBeFalsy();
    });

    it('throws when selecting an unregistered project', () => {
        expect.hasAssertions();

        expect(() => setCurrentProject('ghost')).toThrow(/não registrado/);
    });

    it('throws on path-traversal / invalid project name', () => {
        expect.hasAssertions();

        expect(() => setCurrentProject('../escape')).toThrow(/path traversal/);
        expect(() => setCurrentProject('')).toThrow(/path traversal/);
    });

    it('applies the per-project .env overlay on selection', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP, provider: 'gitlab' });
        fs.mkdirSync(path.dirname(projectEnvPath('ibabs')), { recursive: true });
        fs.writeFileSync(projectEnvPath('ibabs'), 'QA_PROJECT_PROVIDER=github\n');

        setCurrentProject('ibabs');

        expect(process.env['QA_PROJECT_PROVIDER']).toBe('github');
    });

    it('loadProjectConfig returns entry + env overrides (read-only, single source)', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP, provider: 'gitlab' });
        process.env['QA_PROJECT_PROVIDER'] = 'github';

        const cfg = loadProjectConfig('ibabs');

        expect(cfg.name).toBe('ibabs');
        expect(cfg.dir).toBe(TMP);
        expect(cfg.provider).toBe('github');
        expect(cfg.envOverrides).toStrictEqual({ provider: 'github' });
    });

    it('loadProjectConfig throws for unknown project', () => {
        expect.hasAssertions();

        expect(() => loadProjectConfig('ghost')).toThrow(/não registrado/);
    });

    it('loadProjectConfig throws on invalid name', () => {
        expect.hasAssertions();

        expect(() => loadProjectConfig('../x')).toThrow(/path traversal/);
    });
});
