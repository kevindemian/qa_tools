import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { CONFIG_SCHEMA } from './config-schema.js';

// Import functions under test - need dynamic import to avoid module-level side effects
import { validateRequiredEnv, validateConfigValues, warnUnknownEnv, validateAll } from './config-validator.js';

describe('ValidateRequiredEnv', () => {
    const REQUIRED = ['JIRA_BASE_URL', 'JIRA_PERSONAL_TOKEN', 'XRAY_BASE_URL'];

    beforeEach(() => {
        REQUIRED.forEach((v) => delete process.env[v]);
    });

    afterAll(() => {
        REQUIRED.forEach((v) => delete process.env[v]);
    });

    it('throws when JIRA_BASE_URL is missing', () => {
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        process.env['XRAY_BASE_URL'] = 'url';

        expect(() => validateRequiredEnv()).toThrow(/Jira base URL/);
    });

    it('throws when JIRA_PERSONAL_TOKEN is missing', () => {
        process.env['JIRA_BASE_URL'] = 'url';
        process.env['XRAY_BASE_URL'] = 'url';

        expect(() => validateRequiredEnv()).toThrow(/Jira personal token/);
    });

    it('throws when XRAY_BASE_URL is missing', () => {
        process.env['JIRA_BASE_URL'] = 'url';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';

        expect(() => validateRequiredEnv()).toThrow(/Xray base URL/);
    });

    it('passes when all required env vars are set', () => {
        process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok-123';
        process.env['XRAY_BASE_URL'] = 'https://xray.example.com';

        expect(() => validateRequiredEnv()).not.toThrow();
    });
});

describe('ValidateConfigValues', () => {
    const STASH: Record<string, string | undefined> = {};

    beforeAll(() => {
        for (const f of CONFIG_SCHEMA) {
            STASH[f.envVar] = process.env[f.envVar];
        }
    });

    afterAll(() => {
        for (const f of CONFIG_SCHEMA) {
            if (STASH[f.envVar] === undefined) delete process.env[f.envVar];
            else process.env[f.envVar] = STASH[f.envVar];
        }
    });

    beforeEach(() => {
        // Clear all schema env vars before each test
        for (const f of CONFIG_SCHEMA) {
            delete process.env[f.envVar];
        }
    });

    it('returns no warnings when env vars are unset', () => {
        const warnings = validateConfigValues();

        expect(warnings).toEqual([]);
    });

    it('returns no warnings for valid boolean values', () => {
        process.env['AUTO_CONFIRM'] = 'true';
        process.env['DRY_RUN'] = 'false';
        const warnings = validateConfigValues();

        expect(warnings).toEqual([]);
    });

    it('warns on invalid boolean value', () => {
        process.env['AUTO_CONFIRM'] = 'notabool';
        const warnings = validateConfigValues();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain('AUTO_CONFIRM');
        expect(warnings[0]).toContain('booleano');
    });

    it('returns no warnings for valid number values', () => {
        process.env['LLM_MAX_TOKENS_PER_OP'] = '64000';
        const warnings = validateConfigValues();

        expect(warnings).toEqual([]);
    });

    it('warns on invalid number value', () => {
        process.env['LLM_MAX_TOKENS_PER_OP'] = 'not-a-number';
        const warnings = validateConfigValues();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain('LLM_MAX_TOKENS_PER_OP');
    });

    it('returns no warnings for valid allowedValues', () => {
        process.env['JIRA_MODE'] = 'cloud';
        const warnings = validateConfigValues();

        expect(warnings).toEqual([]);
    });

    it('warns on invalid allowedValues', () => {
        process.env['JIRA_MODE'] = 'invalid-mode';
        const warnings = validateConfigValues();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain('JIRA_MODE');
        expect(warnings[0]).toContain('invalid-mode');
        expect(warnings[0]).toContain('server');
        expect(warnings[0]).toContain('cloud');
    });

    it('skips allowedValues check when value is empty string', () => {
        process.env['QA_PUBLISH'] = '';
        const warnings = validateConfigValues();

        expect(warnings).toEqual([]);
    });

    it('validates multiple values and returns multiple warnings', () => {
        process.env['JIRA_MODE'] = 'bad';
        process.env['AUTO_CONFIRM'] = 'invalid-bool';
        const warnings = validateConfigValues();

        expect(warnings.length).toBeGreaterThanOrEqual(2);
    });
});

describe('WarnUnknownEnv', () => {
    const UNKNOWN_PREFIX =
        /^QA_|^LLM_|^JIRA_|^XRAY_|^GIT|^GITHUB_|^CYPRESS_|^CSV_|^DRY_|^DEBUG|^QUIET|^ON_|^LOG_|^AUTO_|^KNOWN_|^REPORT_|^METRICS_|^SKIP_|^NO_|^OPENCODE_|^BENCHMARK|^AWS_|^CI_/i;

    beforeEach(() => {
        for (const k of Object.keys(process.env)) {
            if (UNKNOWN_PREFIX.test(k)) {
                delete process.env[k];
            }
        }
    });

    it('does not warn on known env vars', () => {
        process.env['HOME'] = '/home/user';
        process.env['PATH'] = '/usr/bin';
        const warnings = warnUnknownEnv();

        expect(warnings).toEqual([]);
    });

    it('warns on unknown QA_ prefixed var', () => {
        process.env['QA_UNKNOWN_TEST'] = 'value';
        const warnings = warnUnknownEnv();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain('QA_UNKNOWN_TEST');
    });

    it('warns on unknown LLM_ prefixed var', () => {
        process.env['LLM_MYSTERY_KEY'] = 'value';
        const warnings = warnUnknownEnv();

        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0]).toContain('LLM_MYSTERY_KEY');
    });

    it('does not warn on vars not matching project prefixes', () => {
        process.env['MY_RANDOM_VAR'] = 'value';
        const warnings = warnUnknownEnv();

        expect(warnings).toEqual([]);
    });
});

describe('ValidateAll', () => {
    const REQUIRED = ['JIRA_BASE_URL', 'JIRA_PERSONAL_TOKEN', 'XRAY_BASE_URL'];

    beforeEach(() => {
        for (const k of REQUIRED) delete process.env[k];
        for (const f of CONFIG_SCHEMA) {
            delete process.env[f.envVar];
        }
    });

    it('throws when required vars are missing', () => {
        expect(() => validateAll()).toThrow(/Jira base URL/);
    });

    it('logs warnings for invalid values when required vars are set', () => {
        process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        process.env['XRAY_BASE_URL'] = 'https://xray.example.com';
        process.env['AUTO_CONFIRM'] = 'not-bool';
        const logged: string[] = [];

        expect(() => validateAll((m) => logged.push(m))).not.toThrow();
        expect(logged.length).toBeGreaterThanOrEqual(1);
        expect(logged[0]).toContain('AUTO_CONFIRM');
    });

    it('passes cleanly with all valid values', () => {
        process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        process.env['XRAY_BASE_URL'] = 'https://xray.example.com';
        const logged: string[] = [];

        expect(() => validateAll((m) => logged.push(m))).not.toThrow();
        expect(logged).toEqual([]);
    });

    it('does not throw when logFn is not provided', () => {
        process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        process.env['XRAY_BASE_URL'] = 'https://xray.example.com';
        process.env['AUTO_CONFIRM'] = 'not-bool';

        expect(() => validateAll()).not.toThrow();
    });
});
