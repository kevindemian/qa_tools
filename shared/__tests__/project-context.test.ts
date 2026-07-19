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
    ensureSelfHostProject,
    getSelfHostEntry,
} from '../project-context.js';
import { addProject, projectEnvPath } from '../project-registry.js';
import { registryDir } from '../project-paths.js';

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

describe('EnsureSelfHostProject (self-host resolution)', () => {
    let TMP: string;
    let repoDir: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'self-host-test-'));
        repoDir = path.join(TMP, 'repo');
        fs.mkdirSync(repoDir, { recursive: true });
        process.env['XDG_CONFIG_HOME'] = TMP;
        Config.reset();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        Config.reset();
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    function initRepo(name: string, remoteUrl: string | null): void {
        fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }), 'utf8');
        const gitDir = path.join(repoDir, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const urlLine = remoteUrl ? `\n\turl = ${remoteUrl}\n` : '';
        fs.writeFileSync(
            path.join(gitDir, 'config'),
            `[core]\n\trepositoryformatversion = 0\n[remote "origin"]${urlLine}`,
            'utf8',
        );
    }

    it('resolves a github self-host repo and injects in-memory without writing the registry', () => {
        expect.hasAssertions();

        initRepo('my_proj', 'git@github.com:acme/my_proj.git');

        ensureSelfHostProject('my_proj', repoDir);

        expect(getCurrentProject()).toBe('my_proj');
        expect(getCurrentProjectDir()).toBe(path.resolve(repoDir));

        const self = getSelfHostEntry();

        expect(self?.provider).toBe('github');
        expect(self?.projectId).toBe('acme/my_proj');

        const registryFile = path.join(registryDir(), 'projects.json');

        expect(fs.existsSync(registryFile)).toBeFalsy();
    });

    it('resolves an https gitlab self-host repo', () => {
        expect.hasAssertions();

        initRepo('gl_proj', 'https://gitlab.com/group/gl_proj.git');

        ensureSelfHostProject('gl_proj', repoDir);

        const self = getSelfHostEntry();

        expect(self?.provider).toBe('gitlab');
        expect(self?.projectId).toBe('group/gl_proj');
    });

    it('throws (never silent) when package.json name does not match the requested project', () => {
        expect.hasAssertions();

        initRepo('other_proj', 'git@github.com:acme/other_proj.git');

        expect(() => ensureSelfHostProject('my_proj', repoDir)).toThrow(/não registrado/);
        expect(getSelfHostEntry()).toBeUndefined();
    });

    it('throws when the repo has no classifiable origin remote', () => {
        expect.hasAssertions();

        initRepo('my_proj', null);

        expect(() => ensureSelfHostProject('my_proj', repoDir)).toThrow(/não registrado/);
    });

    it('falls back to the registry when the project is already registered', () => {
        expect.hasAssertions();

        addProject({ name: 'reg_proj', dir: repoDir });
        fs.writeFileSync(
            path.join(repoDir, 'package.json'),
            JSON.stringify({ name: 'different', version: '1.0.0' }),
            'utf8',
        );

        ensureSelfHostProject('reg_proj', repoDir);

        expect(getCurrentProject()).toBe('reg_proj');
        expect(getSelfHostEntry()).toBeUndefined();
    });

    it('returns undefined from getSelfHostEntry before any self-host project is active', () => {
        expect.hasAssertions();

        expect(getSelfHostEntry()).toBeUndefined();
    });

    it('resolves an ssh gitlab remote (host endsWith gitlab.com)', () => {
        expect.hasAssertions();

        initRepo('gl_ssh', 'git@gitlab.com:team/gl_ssh.git');

        ensureSelfHostProject('gl_ssh', repoDir);

        const self = getSelfHostEntry();

        expect(self?.provider).toBe('gitlab');
        expect(self?.projectId).toBe('team/gl_ssh');
    });

    it('resolves a github ssh remote even when nested in a group path', () => {
        expect.hasAssertions();

        initRepo('nested', 'git@github.com:org/sub/nested.git');

        ensureSelfHostProject('nested', repoDir);

        const self = getSelfHostEntry();

        expect(self?.provider).toBe('github');
        expect(self?.projectId).toBe('org/sub/nested');
    });

    it('resolves origin from a worktree .git pointer file', () => {
        expect.hasAssertions();

        const realGitDir = path.join(TMP, 'real.git');
        fs.mkdirSync(realGitDir, { recursive: true });
        fs.writeFileSync(
            path.join(realGitDir, 'config'),
            '[core]\n[remote "origin"]\n\turl = https://github.com/acme/worktree_proj.git\n',
            'utf8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'package.json'),
            JSON.stringify({ name: 'worktree_proj', version: '1.0.0' }),
            'utf8',
        );
        fs.writeFileSync(path.join(repoDir, '.git'), `gitdir: ${realGitDir}\n`, 'utf8');

        ensureSelfHostProject('worktree_proj', repoDir);

        const self = getSelfHostEntry();

        expect(self?.provider).toBe('github');
        expect(self?.projectId).toBe('acme/worktree_proj');
    });

    it('throws when cwd has no package.json (never silent)', () => {
        expect.hasAssertions();

        const emptyDir = path.join(TMP, 'empty');
        fs.mkdirSync(emptyDir, { recursive: true });

        expect(() => ensureSelfHostProject('my_proj', emptyDir)).toThrow(/não registrado/);
    });
});
