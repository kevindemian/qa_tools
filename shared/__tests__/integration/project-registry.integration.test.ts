import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addProject, loadRegistry, getProject, listProjects, removeProject } from '../../project-registry.js';

describe('Integration: Project Registry', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-int-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('create -> add 3 projects -> persist -> reload -> verify integrity', () => {
        expect.hasAssertions();

        addProject({ name: 'alpha', dir: path.join(TMP, 'alpha'), provider: 'github' });
        addProject({ name: 'beta', dir: path.join(TMP, 'beta'), jiraKey: 'BETA' });
        addProject({ name: 'gamma', dir: path.join(TMP, 'gamma'), framework: 'vitest' });

        const file = path.join(TMP, 'qa-tools', 'projects.json');

        expect(fs.existsSync(file)).toBeTruthy();

        // Reload from disk (fresh read, not in-memory cache)
        const reloaded = loadRegistry();

        expect(Object.keys(reloaded).sort((a, b) => a.localeCompare(b))).toStrictEqual(['alpha', 'beta', 'gamma']);
        expect(reloaded['beta']?.jiraKey).toBe('BETA');

        // Context accessors resolve correctly after reload
        expect(getProject('alpha')?.provider).toBe('github');
        expect(listProjects()).toHaveLength(3);

        // Mutation persists
        expect(removeProject('beta')).toBeTruthy();
        expect(Object.keys(loadRegistry()).sort((a, b) => a.localeCompare(b))).toStrictEqual(['alpha', 'gamma']);
    });
});
