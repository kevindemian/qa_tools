import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyProjectContext } from '../cli-dispatch.js';
import { getCurrentProject, clearCurrentProject } from '../../shared/project-context.js';

describe('ApplyProjectContext — self-host resolution (CI post-process path)', () => {
    let TMP: string;
    let repoDir: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-project-ctx-'));
        repoDir = path.join(TMP, 'repo');
        fs.mkdirSync(repoDir, { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'package.json'),
            JSON.stringify({ name: 'qa_tools', version: '1.0.0' }),
            'utf8',
        );
        const gitDir = path.join(repoDir, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        fs.writeFileSync(
            path.join(gitDir, 'config'),
            '[core]\n[remote "origin"]\n\turl = https://github.com/kevindemian/qa_tools\n',
            'utf8',
        );
        process.env['XDG_CONFIG_HOME'] = TMP;
        clearCurrentProject();
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['QA_CURRENT_PROJECT'];
        clearCurrentProject();
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('resolves a checked-out self-host repo without a registry entry (never silent)', () => {
        expect.hasAssertions();

        const prevCwd = process.cwd();
        process.chdir(repoDir);
        try {
            const result = applyProjectContext({ project: 'qa_tools' });

            expect(result).toBe('qa_tools');

            expect(getCurrentProject()).toBe('qa_tools');
        } finally {
            process.chdir(prevCwd);
        }
    });

    it('throws when the checked-out repo is not the requested project (never silent)', () => {
        expect.hasAssertions();

        const prevCwd = process.cwd();
        process.chdir(repoDir);
        try {
            expect(() => applyProjectContext({ project: 'other_proj' })).toThrow(/não registrado/);
        } finally {
            process.chdir(prevCwd);
        }
    });
});
