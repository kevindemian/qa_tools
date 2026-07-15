/**
 * Integration tests — Fase 4 (040–047): Report / Artifact Isolation + DataHub store per project (T7).
 *
 * Verifies project-aware routing of reports/logs/artifacts directories and the per-project
 * DataHub store backend, plus the legacy (no-project) fallback. Negative/edge cases included.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Config from '../../config-accessor.js';
import { artifactsDir, logsDir, reportsDir, writeReport } from '../../temp-dir.js';
import { detectProjectGitDir, detectStoreBackend, FsStoreBackend, GitStoreBackend } from '../../store-backend.js';
import { addProject } from '../../project-registry.js';
import { clearCurrentProject, setCurrentProject } from '../../project-context.js';
import { formatDateISO } from '../../date-utils.js';

describe('Fase 4 — Report/Artifact Isolation (integration)', () => {
    let TMP: string;
    let PROJ: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fase4-test-'));
        PROJ = fs.mkdtempSync(path.join(os.tmpdir(), 'fase4-proj-'));
        process.env['XDG_CONFIG_HOME'] = TMP;
        process.env['XDG_STATE_HOME'] = TMP;
        delete process.env['QA_PROJECT_DIR'];
        delete process.env['QA_TOOLS_REPORTS_DIR'];
        delete process.env['QA_TOOLS_LOGS_DIR'];
        delete process.env['QA_TOOLS_ARTIFACTS_DIR'];
        delete process.env['QA_TOOLS_TEMP_DIR'];
        delete process.env['LOG_DIR'];
        Config.reset();
    });

    afterEach(() => {
        Config.reset();
        delete process.env['XDG_CONFIG_HOME'];
        delete process.env['XDG_STATE_HOME'];
        delete process.env['QA_PROJECT_DIR'];
        delete process.env['QA_TOOLS_REPORTS_DIR'];
        delete process.env['QA_TOOLS_LOGS_DIR'];
        delete process.env['QA_TOOLS_ARTIFACTS_DIR'];
        fs.rmSync(TMP, { recursive: true, force: true });
        fs.rmSync(PROJ, { recursive: true, force: true });
    });

    describe('Fase 4 (040/042/043) — project-aware directory routing', () => {
        beforeEach(() => {
            addProject({ name: 'p1', dir: PROJ });
            setCurrentProject('p1');
        });

        it('reportsDir routes to <proj>/.qa-tools/reports when project active', () => {
            expect.hasAssertions();

            expect(reportsDir()).toBe(path.join(PROJ, '.qa-tools', 'reports'));
        });

        it('logsDir routes to <proj>/.qa-tools/logs when project active', () => {
            expect.hasAssertions();

            expect(logsDir()).toBe(path.join(PROJ, '.qa-tools', 'logs'));
        });

        it('artifactsDir routes to <proj>/.qa-tools/artifacts when project active', () => {
            expect.hasAssertions();

            expect(artifactsDir()).toBe(path.join(PROJ, '.qa-tools', 'artifacts'));
        });

        it('041 — writeReport writes under the project .qa-tools/reports', () => {
            expect.hasAssertions();

            const result = writeReport('test.json', '{}');
            const expected = path.join(reportsDir(), formatDateISO(), 'test.json');

            expect(result).toBe(expected);
            expect(fs.existsSync(expected)).toBeTruthy();
            expect(result.startsWith(path.join(PROJ, '.qa-tools'))).toBeTruthy();
        });

        it('artifactsDir is usable: a writer can create the dir and persist a file', () => {
            expect.hasAssertions();

            const ad = artifactsDir();
            fs.mkdirSync(ad, { recursive: true });
            const file = path.join(ad, 'build.json');
            fs.writeFileSync(file, '{"ok":true}', 'utf8');

            expect(fs.existsSync(file)).toBeTruthy();
        });

        it('isolation: two distinct projects route to distinct .qa-tools dirs', () => {
            expect.hasAssertions();

            const proj2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fase4-proj2-'));
            try {
                addProject({ name: 'p2', dir: proj2 });
                setCurrentProject('p2');

                expect(reportsDir()).toBe(path.join(proj2, '.qa-tools', 'reports'));
                expect(reportsDir()).not.toBe(path.join(PROJ, '.qa-tools', 'reports'));
            } finally {
                fs.rmSync(proj2, { recursive: true, force: true });
            }
        });
    });

    describe('Fase 4 (040/042/043) — env-override precedence (zero silencing of operator intent)', () => {
        beforeEach(() => {
            addProject({ name: 'p1', dir: PROJ });
            setCurrentProject('p1');
        });

        it('qA_TOOLS_REPORTS_DIR wins over the project directory', () => {
            expect.hasAssertions();

            const override = path.join(TMP, 'overridden-reports');
            process.env['QA_TOOLS_REPORTS_DIR'] = override;

            expect(reportsDir()).toBe(path.resolve(override));
            expect(reportsDir()).not.toContain('.qa-tools');
        });

        it('qA_TOOLS_LOGS_DIR wins over the project directory', () => {
            expect.hasAssertions();

            const override = path.join(TMP, 'overridden-logs');
            process.env['QA_TOOLS_LOGS_DIR'] = override;

            expect(logsDir()).toBe(path.resolve(override));
        });

        it('qA_TOOLS_ARTIFACTS_DIR wins over the project directory', () => {
            expect.hasAssertions();

            const override = path.join(TMP, 'overridden-artifacts');
            process.env['QA_TOOLS_ARTIFACTS_DIR'] = override;

            expect(artifactsDir()).toBe(path.resolve(override));
        });
    });

    describe('Fase 4 (040/042/043) — legacy fallback (no project selected)', () => {
        it('reportsDir falls back to PROJECT_ROOT/reports after clearCurrentProject', () => {
            expect.hasAssertions();

            addProject({ name: 'p1', dir: PROJ });
            setCurrentProject('p1');
            clearCurrentProject();

            const dir = reportsDir();

            expect(path.isAbsolute(dir)).toBeTruthy();
            expect(dir.endsWith(path.join('reports'))).toBeTruthy();
            expect(dir).not.toContain('.qa-tools');
            expect(dir).not.toContain(PROJ);
        });

        it('artifactsDir falls back to PROJECT_ROOT/artifacts when no project selected', () => {
            expect.hasAssertions();

            const dir = artifactsDir();

            expect(path.isAbsolute(dir)).toBeTruthy();
            expect(dir.endsWith(path.join('artifacts'))).toBeTruthy();
            expect(dir).not.toContain('.qa-tools');
        });

        it('writeReport works under the legacy fallback path', () => {
            expect.hasAssertions();

            const result = writeReport('legacy.json', '{}');

            expect(fs.existsSync(result)).toBeTruthy();
            expect(result.startsWith(reportsDir())).toBeTruthy();
        });
    });

    describe('Fase 4 (046) — DataHub store per project (T7)', () => {
        it('uses GitStoreBackend at <proj>/.qa-tools when qaProjectDir is a git repo', () => {
            expect.hasAssertions();

            fs.mkdirSync(path.join(PROJ, '.git'), { recursive: true });
            Config.set('qaProjectDir', PROJ);

            const backend = detectStoreBackend();

            expect(backend).toBeInstanceOf(GitStoreBackend);

            backend.init();
            backend.write('t7.json', Buffer.from('{"v":1}'));

            expect(backend.read('t7.json')?.toString()).toBe('{"v":1}');
        });

        it('uses FsStoreBackend at <proj>/.qa-tools when qaProjectDir is not a git repo', () => {
            expect.hasAssertions();

            Config.set('qaProjectDir', PROJ);

            const backend = detectStoreBackend();

            expect(backend).toBeInstanceOf(FsStoreBackend);

            backend.write('t7.json', Buffer.from('{"v":2}'));

            expect(fs.existsSync(path.join(PROJ, '.qa-tools', 't7.json'))).toBeTruthy();
        });

        it('respects QA_PROJECT_DIR env when qaProjectDir override is not set', () => {
            expect.hasAssertions();

            process.env['QA_PROJECT_DIR'] = PROJ;

            expect(detectStoreBackend()).toBeInstanceOf(FsStoreBackend);
        });

        it('falls back to the legacy XDG store when no project is selected', () => {
            expect.hasAssertions();

            Config.reset();
            delete process.env['QA_PROJECT_DIR'];

            const backend = detectStoreBackend();
            backend.write('t7.json', Buffer.from('{"v":3}'));

            expect(backend.read('t7.json')?.toString()).toBe('{"v":3}');

            // The store must NOT land inside the (unselected) project dir.
            expect(fs.existsSync(path.join(PROJ, '.qa-tools', 't7.json'))).toBeFalsy();
        });

        it('explicit projectDir argument preserves prior behavior (git repo → project backend)', () => {
            expect.hasAssertions();

            fs.mkdirSync(path.join(PROJ, '.git'), { recursive: true });

            expect(detectStoreBackend(PROJ)).toBeInstanceOf(GitStoreBackend);
        });

        it('detectProjectGitDir starts from qaProjectDir', () => {
            expect.hasAssertions();

            fs.mkdirSync(path.join(PROJ, '.git'), { recursive: true });
            Config.set('qaProjectDir', PROJ);

            expect(detectProjectGitDir()).toBe(path.resolve(PROJ));
        });

        it('detectProjectGitDir returns null when qaProjectDir has no git ancestor', () => {
            expect.hasAssertions();

            Config.set('qaProjectDir', PROJ);

            expect(detectProjectGitDir()).toBeNull();
        });
    });
});
