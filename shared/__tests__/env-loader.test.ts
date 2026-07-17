import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi, type MockInstance } from 'vitest';
import {
    ensureDotenv,
    envVal,
    toBool,
    toInt,
    __resetDotenvLoaded,
    applyProjectEnvOverlay,
    writeProjectEnvOverlay,
    reloadDotenv,
    warnSecretsInFile,
} from '../env-loader.js';
import { rootLogger } from '../logger.js';
import { projectEnvPath, projectConfigDir } from '../project-paths.js';
import type { ProjectEntry } from '../types/project.js';

describe('Env-loader — dotenv wrapper', () => {
    beforeEach(() => {
        __resetDotenvLoaded();
    });

    describe('EnsureDotenv', () => {
        it('is idempotent', () => {
            ensureDotenv();

            expect(() => ensureDotenv()).not.toThrow();
        });
    });

    describe('EnvVal', () => {
        it('returns empty string for missing key', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__');

            expect(val).toBe('');
        });

        it('returns process.env value when set', () => {
            process.env['__TEST_VAR__'] = 'hello';
            const val = envVal('__TEST_VAR__');

            expect(val).toBe('hello');

            delete process.env['__TEST_VAR__'];
        });

        it('returns fallback when key is missing', () => {
            const val = envVal('__NONEXISTENT_VAR_12345__', 'fallback');

            expect(val).toBe('fallback');
        });
    });

    describe('ToBool', () => {
        it('returns false for undefined', () => {
            expect(toBool(undefined)).toBeFalsy();
        });

        it('returns boolean value as-is', () => {
            expect(toBool(true)).toBeTruthy();
            expect(toBool(false)).toBeFalsy();
        });

        it('parses string "true"', () => {
            expect(toBool('true')).toBeTruthy();
        });

        it('returns false for other strings', () => {
            expect(toBool('false')).toBeFalsy();
            expect(toBool('yes')).toBeFalsy();
            expect(toBool('')).toBeFalsy();
        });
    });

    describe('ToInt', () => {
        it('returns fallback for undefined', () => {
            expect(toInt(undefined, 10)).toBe(10);
        });

        it('returns number as-is', () => {
            expect(toInt(42, 0)).toBe(42);
        });

        it('parses number string', () => {
            expect(toInt('42', 0)).toBe(42);
        });

        it('returns fallback for NaN', () => {
            expect(toInt('abc', 10)).toBe(10);
        });
    });

    describe('Reset dotenv loaded', () => {
        it('resets the loaded flag', () => {
            ensureDotenv();
            __resetDotenvLoaded();

            expect(() => ensureDotenv()).not.toThrow();
        });
    });

    describe('ReloadDotenv', () => {
        it('re-runs ensureDotenv after resetting the flag (idempotent, no throw)', () => {
            ensureDotenv();

            expect(() => reloadDotenv()).not.toThrow();
        });
    });
});

describe('Env-loader — per-project overlay (real filesystem, hermetic XDG root)', () => {
    let tmpXdg: string;
    let prevXdg: string | undefined;

    const PROJECT = 'acme-web';

    beforeEach(() => {
        prevXdg = process.env['XDG_CONFIG_HOME'];
        tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-env-loader-'));
        process.env['XDG_CONFIG_HOME'] = tmpXdg;
    });

    afterEach(() => {
        if (prevXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
        else process.env['XDG_CONFIG_HOME'] = prevXdg;
        fs.rmSync(tmpXdg, { recursive: true, force: true });
    });

    describe('WriteProjectEnvOverlay', () => {
        it('writes only the whitelisted override keys present on the entry', () => {
            expect.assertions(4);

            const entry: ProjectEntry = {
                name: PROJECT,
                dir: '/home/user/acme-web',
                provider: 'github',
                projectId: 'org/repo',
                jiraKey: 'ACME',
                framework: 'vitest',
            };

            writeProjectEnvOverlay(PROJECT, entry);
            const written = fs.readFileSync(projectEnvPath(PROJECT), 'utf8');

            expect(written).toContain('QA_PROJECT_PROVIDER=github');
            expect(written).toContain('QA_PROJECT_PROJECT_ID=org/repo');
            expect(written).toContain('QA_PROJECT_JIRA_KEY=ACME');
            expect(written).toContain('QA_PROJECT_FRAMEWORK=vitest');
        });

        it('omits keys that are absent on the entry (does not emit empty assignments)', () => {
            expect.assertions(3);

            const entry: ProjectEntry = { name: PROJECT, dir: '/home/user/acme-web', provider: 'gitlab' };

            writeProjectEnvOverlay(PROJECT, entry);
            const written = fs.readFileSync(projectEnvPath(PROJECT), 'utf8');

            expect(written).toContain('QA_PROJECT_PROVIDER=gitlab');
            expect(written).not.toContain('QA_PROJECT_PROJECT_ID');
            expect(written).not.toContain('QA_PROJECT_JIRA_KEY');
        });

        it('writes an empty file body when no override keys are present', () => {
            expect.assertions(1);

            writeProjectEnvOverlay(PROJECT, { name: PROJECT, dir: '/home/user/acme-web' });
            const written = fs.readFileSync(projectEnvPath(PROJECT), 'utf8');

            expect(written).toBe('');
        });

        it('creates the per-project config directory when missing', () => {
            expect.assertions(1);

            writeProjectEnvOverlay(PROJECT, { name: PROJECT, dir: '/home/user/acme-web', provider: 'github' });

            expect(fs.existsSync(projectConfigDir(PROJECT))).toBeTruthy();
        });

        it('throws on an invalid project name (path traversal guard) — never silent', () => {
            expect.assertions(1);

            expect(() =>
                writeProjectEnvOverlay('../escape', { name: 'x', dir: '/home/user/x', provider: 'github' }),
            ).toThrow(/path traversal/);
        });
    });

    describe('ApplyProjectEnvOverlay', () => {
        it('is a no-op for an empty project name', () => {
            expect.assertions(1);

            expect(() => applyProjectEnvOverlay('')).not.toThrow();
        });

        it('throws on an invalid project name (path traversal guard) — never silent', () => {
            expect.assertions(1);

            expect(() => applyProjectEnvOverlay('../escape')).toThrow(/path traversal/);
        });

        it('is a no-op when the overlay file does not exist', () => {
            expect.assertions(1);

            expect(() => applyProjectEnvOverlay(PROJECT)).not.toThrow();
        });

        it('throws (never silently swallows) when the overlay path exists but cannot be read as a file', async () => {
            expect.assertions(2);

            const { rootLogger } = await import('../logger.js');
            const errorSpy: MockInstance<(msg: string, data?: unknown) => void> = vi
                .spyOn(rootLogger, 'error')
                .mockImplementation(() => undefined);

            fs.mkdirSync(projectConfigDir(PROJECT), { recursive: true });
            fs.mkdirSync(projectEnvPath(PROJECT));

            expect(() => applyProjectEnvOverlay(PROJECT)).toThrow(/EISDIR|directory/i);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(PROJECT));

            errorSpy.mockRestore();
        });

        it('applies the written overlay values into process.env (round-trip with writeProjectEnvOverlay)', () => {
            expect.assertions(2);

            const key = 'QA_PROJECT_PROVIDER';
            delete process.env[key];

            writeProjectEnvOverlay(PROJECT, { name: PROJECT, dir: '/home/user/acme-web', provider: 'gitlab' });
            applyProjectEnvOverlay(PROJECT);

            expect(process.env[key]).toBe('gitlab');

            delete process.env[key];

            expect(process.env[key]).toBeUndefined();
        });
    });
});

async function flushAsyncLogger(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Env-loader — secret scanning (real filesystem, safety mechanism §25)', () => {
    let tmpDir: string;
    let warnSpy: MockInstance<(msg: string, data?: unknown) => void>;

    const SECRET_FIXTURES: { label: string; value: string }[] = [
        { label: 'GitHub PAT', value: 'github_pat_ABC123def456' },
        { label: 'OpenRouter key', value: 'sk-or-v1-abcdef0123456789' },
        { label: 'Groq key', value: 'gsk_ABCdef123456' },
        { label: 'Gemini key', value: 'AIzaSyAbcDef123456' },
        { label: 'NVIDIA key', value: 'nvapi-abcdef123456' },
        { label: 'HuggingFace key', value: 'hf_ABCdef123456' },
    ];

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-secret-scan-'));
        warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.each(SECRET_FIXTURES)('warns when a $label is present in the scanned file', async ({ label, value }) => {
        expect.assertions(1);

        const filePath = path.join(tmpDir, '.env');
        fs.writeFileSync(filePath, `SOME_KEY=${value}\n`, 'utf8');

        warnSecretsInFile(filePath, '.env');
        await flushAsyncLogger();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(label));
    });

    it('does not warn when the file contains no secret patterns', async () => {
        expect.assertions(1);

        const filePath = path.join(tmpDir, '.env');
        fs.writeFileSync(filePath, 'QA_PROJECT_PROVIDER=github\nQA_LEVEL=info\n', 'utf8');

        warnSecretsInFile(filePath, '.env');
        await flushAsyncLogger();

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('ignores comment lines and lines without an assignment', async () => {
        expect.assertions(1);

        const filePath = path.join(tmpDir, '.env');
        fs.writeFileSync(filePath, '# github_pat_commented_out\nNAKED_LINE_NO_EQUALS\n\n', 'utf8');

        warnSecretsInFile(filePath, '.env');
        await flushAsyncLogger();

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not throw and does not warn when the scanned file is absent (§25: explicit stderr, never crash)', async () => {
        expect.assertions(2);

        const missing = path.join(tmpDir, 'does-not-exist.env');

        expect(() => warnSecretsInFile(missing, '.env')).not.toThrow();

        await flushAsyncLogger();

        expect(warnSpy).not.toHaveBeenCalled();
    });
});

describe('Env-loader — ensureDotenv production path (isTest=false, injected project root)', () => {
    let tmpRoot: string;
    let prevVitest: string | undefined;
    let prevNodeEnv: string | undefined;
    let prevCurrentProject: string | undefined;
    let prevXdg: string | undefined;
    let warnSpy: MockInstance<(msg: string, data?: unknown) => void>;

    beforeEach(() => {
        prevVitest = process.env['VITEST'];
        prevNodeEnv = process.env['NODE_ENV'];
        prevCurrentProject = process.env['QA_CURRENT_PROJECT'];
        prevXdg = process.env['XDG_CONFIG_HOME'];

        delete process.env['VITEST'];
        process.env['NODE_ENV'] = 'development';

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ensure-dotenv-'));
        warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
        __resetDotenvLoaded();
    });

    afterEach(() => {
        if (prevVitest === undefined) delete process.env['VITEST'];
        else process.env['VITEST'] = prevVitest;
        if (prevNodeEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = prevNodeEnv;
        if (prevCurrentProject === undefined) delete process.env['QA_CURRENT_PROJECT'];
        else process.env['QA_CURRENT_PROJECT'] = prevCurrentProject;
        if (prevXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
        else process.env['XDG_CONFIG_HOME'] = prevXdg;

        warnSpy.mockRestore();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
        __resetDotenvLoaded();
    });

    it('loads .env and .env.local from the injected project root into process.env', () => {
        expect.assertions(2);

        delete process.env['QA_CURRENT_PROJECT'];
        delete process.env['__ENSURE_ENV_TEST__'];
        delete process.env['__ENSURE_LOCAL_TEST__'];

        fs.writeFileSync(path.join(tmpRoot, '.env'), '__ENSURE_ENV_TEST__=from_env\n', 'utf8');
        fs.writeFileSync(path.join(tmpRoot, '.env.local'), '__ENSURE_LOCAL_TEST__=from_local\n', 'utf8');

        ensureDotenv(tmpRoot);

        expect(process.env['__ENSURE_ENV_TEST__']).toBe('from_env');
        expect(process.env['__ENSURE_LOCAL_TEST__']).toBe('from_local');

        delete process.env['__ENSURE_ENV_TEST__'];
        delete process.env['__ENSURE_LOCAL_TEST__'];
    });

    it('applies the per-project overlay when QA_CURRENT_PROJECT is a valid project name', () => {
        expect.assertions(1);

        const tmpXdg = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ensure-xdg-'));
        process.env['XDG_CONFIG_HOME'] = tmpXdg;
        process.env['QA_CURRENT_PROJECT'] = 'acme-web';
        delete process.env['QA_PROJECT_PROVIDER'];

        try {
            fs.writeFileSync(path.join(tmpRoot, '.env'), 'BASE_KEY=base\n', 'utf8');
            writeProjectEnvOverlay('acme-web', {
                name: 'acme-web',
                dir: '/home/user/acme-web',
                provider: 'gitlab',
            });

            ensureDotenv(tmpRoot);

            expect(process.env['QA_PROJECT_PROVIDER']).toBe('gitlab');
        } finally {
            delete process.env['QA_PROJECT_PROVIDER'];
            fs.rmSync(tmpXdg, { recursive: true, force: true });
        }
    });

    it('warns (does not throw) when QA_CURRENT_PROJECT is an invalid project name', async () => {
        expect.assertions(2);

        process.env['QA_CURRENT_PROJECT'] = '../escape';
        fs.writeFileSync(path.join(tmpRoot, '.env'), 'BASE_KEY=base\n', 'utf8');

        expect(() => ensureDotenv(tmpRoot)).not.toThrow();

        await flushAsyncLogger();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('../escape'));
    });
});
