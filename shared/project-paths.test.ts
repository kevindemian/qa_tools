import { afterEach, describe, expect, it } from 'vitest';

import { isValidProjectName, registryDir, projectConfigDir, projectEnvPath } from './project-paths.js';

describe('Shared/project-paths', () => {
    describe('IsValidProjectName', () => {
        it.each([
            ['my-project', true],
            ['proj.1', true],
            ['a_b-c', true],
            ['', false],
            ['..', true],
            ['/etc', false],
            ['a/b', false],
            ['proj name', false],
            ['proj\tname', false],
        ])('validates %s as %s', (name, expected) => {
            expect.hasAssertions();
            expect(isValidProjectName(name)).toBe(expected);
        });

        it('rejects non-string input', () => {
            expect.hasAssertions();
            expect(isValidProjectName(undefined as unknown as string)).toBeFalsy();
        });
    });

    describe('RegistryDir', () => {
        afterEach(() => {
            delete process.env['XDG_CONFIG_HOME'];
        });

        it('uses XDG_CONFIG_HOME when set', () => {
            expect.hasAssertions();

            process.env['XDG_CONFIG_HOME'] = '/custom/xdg';

            expect(registryDir()).toBe('/custom/xdg/qa-tools');
        });

        it('falls back to ~/.config/qa-tools when XDG unset', () => {
            expect.hasAssertions();

            delete process.env['XDG_CONFIG_HOME'];

            expect(registryDir()).toContain('qa-tools');
        });
    });

    describe('ProjectConfigDir / projectEnvPath', () => {
        it('builds config dir for a valid name', () => {
            expect.hasAssertions();

            const dir = projectConfigDir('proj');

            expect(dir.endsWith('proj')).toBeTruthy();
            expect(dir).toContain('qa-tools');
        });

        it('builds .env overlay path for a valid name', () => {
            expect.hasAssertions();
            expect(projectEnvPath('proj').endsWith('proj/.env')).toBeTruthy();
        });

        it('throws on invalid project name (config dir)', () => {
            expect.hasAssertions();
            expect(() => projectConfigDir('../evil')).toThrow(/path traversal/);
        });

        it('throws on invalid project name (.env path)', () => {
            expect.hasAssertions();
            expect(() => projectEnvPath('')).toThrow(/path traversal/);
        });
    });
});
