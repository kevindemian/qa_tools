import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadRegistry,
    saveRegistry,
    addProject,
    updateProject,
    removeProject,
    listProjects,
    getProject,
} from '../project-registry.js';

const registryFile = (tmp: string): string => path.join(tmp, 'qa-tools', 'projects.json');
const backupFile = (tmp: string): string => path.join(tmp, 'qa-tools', 'projects.json.bak');

describe('Project Registry (unit)', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-test-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
    });

    afterEach(() => {
        delete process.env['XDG_CONFIG_HOME'];
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('loads empty registry when no file exists', () => {
        expect.hasAssertions();
        expect(Object.keys(loadRegistry())).toStrictEqual([]);
    });

    it('adds and retrieves a project', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP });
        const got = getProject('ibabs');

        expect(got?.name).toBe('ibabs');
        expect(got?.dir).toBe(TMP);
    });

    it('marks valid=true when dir exists, false when missing', () => {
        expect.hasAssertions();

        addProject({ name: 'ok', dir: TMP });
        addProject({ name: 'missing', dir: path.join(TMP, 'does-not-exist') });

        expect(getProject('ok')?.valid).toBeTruthy();
        expect(getProject('missing')?.valid).toBeFalsy();
    });

    it('recognizes a valid symlink as valid and a broken symlink as invalid', () => {
        expect.hasAssertions();

        const target = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-target-'));
        const validLink = path.join(TMP, 'valid-link');
        const brokenLink = path.join(TMP, 'broken-link');
        fs.symlinkSync(target, validLink);
        fs.symlinkSync(path.join(TMP, 'nope'), brokenLink);
        addProject({ name: 'vlink', dir: validLink });
        addProject({ name: 'blink', dir: brokenLink });

        expect(getProject('vlink')?.valid).toBeTruthy();
        expect(getProject('blink')?.valid).toBeFalsy();

        fs.rmSync(target, { recursive: true, force: true });
    });

    it('removes a project', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP });

        expect(removeProject('ibabs')).toBeTruthy();
        expect(getProject('ibabs')).toBeUndefined();
        expect(removeProject('ibabs')).toBeFalsy();
    });

    it('removes nothing for an unknown name', () => {
        expect.hasAssertions();
        expect(removeProject('ghost')).toBeFalsy();
    });

    it('updates an existing project', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP, provider: 'gitlab' });
        updateProject('ibabs', { provider: 'github' });

        expect(getProject('ibabs')?.provider).toBe('github');
    });

    it('lists projects with computed validity', () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: TMP });
        addProject({ name: 'b', dir: path.join(TMP, 'gone') });
        const list = listProjects();

        expect(Array.isArray(list)).toBeTruthy();
        expect(list).toHaveLength(2);

        const a = list.find((p) => p.name === 'a');
        const b = list.find((p) => p.name === 'b');

        expect(a?.valid).toBeTruthy();
        expect(b?.valid).toBeFalsy();
    });

    it('is idempotent: re-adding the same name updates instead of duplicating', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP, provider: 'gitlab' });
        addProject({ name: 'ibabs', dir: TMP, provider: 'github' });

        expect(Object.keys(loadRegistry())).toStrictEqual(['ibabs']);
        expect(getProject('ibabs')?.provider).toBe('github');
    });

    it('throws when adding an invalid entry (missing dir)', () => {
        expect.hasAssertions();
        expect(() => addProject({ name: 'bad' } as never)).toThrow(/ProjectEntry inválido/);
    });

    it('throws when adding an entry with empty name', () => {
        expect.hasAssertions();
        expect(() => addProject({ name: '', dir: TMP })).toThrow(/ProjectEntry inválido/);
    });

    it('throws when updating a non-existent project', () => {
        expect.hasAssertions();
        expect(() => updateProject('ghost', { provider: 'github' })).toThrow(/não encontrado/);
    });

    it('throws when the update merge is invalid (empty dir)', () => {
        expect.hasAssertions();

        addProject({ name: 'ibabs', dir: TMP });

        expect(() => updateProject('ibabs', { dir: '' })).toThrow(/ProjectEntry resultante inválido/);
    });

    it('returns undefined for empty/unknown getProject', () => {
        expect.hasAssertions();
        expect(getProject('')).toBeUndefined();
        expect(getProject('nope')).toBeUndefined();
    });

    it('writes a last-good backup on each save', () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: TMP });
        addProject({ name: 'b', dir: TMP });

        expect(fs.existsSync(backupFile(TMP))).toBeTruthy();

        const bak = JSON.parse(fs.readFileSync(backupFile(TMP), 'utf8')) as Record<string, unknown>;

        expect(Object.keys(bak).sort((a, b) => a.localeCompare(b))).toStrictEqual(['a', 'b']);
    });

    it('recovers from backup when the registry file is corrupt', () => {
        expect.hasAssertions();

        addProject({ name: 'a', dir: TMP });
        addProject({ name: 'b', dir: TMP });
        // corrupt the current registry, keep a valid backup
        fs.writeFileSync(registryFile(TMP), '{ not valid json');
        const recovered = loadRegistry();

        expect(Object.keys(recovered).sort((a, b) => a.localeCompare(b))).toStrictEqual(['a', 'b']);
    });

    it('throws when the registry is corrupt and no valid backup exists', () => {
        expect.hasAssertions();

        fs.mkdirSync(path.dirname(registryFile(TMP)), { recursive: true });
        fs.writeFileSync(registryFile(TMP), '{ corrupt');

        expect(() => loadRegistry()).toThrow(/Registry corrompido/);
    });

    it('throws when registry is corrupt and backup is also corrupt', () => {
        expect.hasAssertions();

        fs.mkdirSync(path.dirname(registryFile(TMP)), { recursive: true });
        fs.writeFileSync(registryFile(TMP), '{ corrupt');
        fs.writeFileSync(backupFile(TMP), '{ also corrupt');

        expect(() => loadRegistry()).toThrow(/Registry corrompido/);
    });

    it('saveRegistry throws on an invalid registry payload', () => {
        expect.hasAssertions();
        expect(() => saveRegistry({ bad: { name: 'bad' } } as never)).toThrow(/Registry inválido/);
    });
});
