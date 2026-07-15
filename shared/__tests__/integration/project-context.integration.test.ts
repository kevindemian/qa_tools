import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Config from '../../config-accessor.js';
import {
    getCurrentProject,
    getCurrentProjectDir,
    setCurrentProject,
    clearCurrentProject,
} from '../../project-context.js';
import { addProject, projectEnvPath } from '../../project-registry.js';

describe('Integration: Project Context', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-int-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        Config.reset();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['QA_CURRENT_PROJECT'];
        delete process.env['QA_PROJECT_PROVIDER'];
        Config.reset();
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('registry -> setCurrentProject -> context reflects dir (end-to-end)', () => {
        expect.hasAssertions();

        addProject({ name: 'alpha', dir: path.join(TMP, 'alpha') });
        addProject({ name: 'beta', dir: path.join(TMP, 'beta') });

        setCurrentProject('alpha');

        expect(getCurrentProject()).toBe('alpha');
        expect(getCurrentProjectDir()).toBe(path.join(TMP, 'alpha'));

        clearCurrentProject();

        expect(getCurrentProject()).toBeUndefined();
    });

    it('overlay applied end-to-end on project switch', () => {
        expect.hasAssertions();

        addProject({ name: 'alpha', dir: path.join(TMP, 'alpha'), provider: 'gitlab' });
        fs.mkdirSync(path.dirname(projectEnvPath('alpha')), { recursive: true });
        fs.writeFileSync(projectEnvPath('alpha'), 'QA_PROJECT_PROVIDER=github\n');

        setCurrentProject('alpha');

        expect(process.env['QA_PROJECT_PROVIDER']).toBe('github');
    });

    it('rejects unknown and path-traversal names', () => {
        expect.hasAssertions();

        addProject({ name: 'alpha', dir: path.join(TMP, 'alpha') });

        expect(() => setCurrentProject('ghost')).toThrow(/não registrado/);
        expect(() => setCurrentProject('../x')).toThrow(/path traversal/);
    });
});
