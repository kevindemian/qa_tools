/**
 * Integration tests — Config Accessor (FT-01)
 *
 * Validates that Config.get() resolves values correctly from:
 * - Environment variables
 * - Config schema defaults
 * - Programmatic overrides
 * - Type coercion (boolean, number, string)
 *
 * Uses real process.env with isolated resets per test.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import Config from '../../config-accessor.js';

describe('Integration: Config Accessor', () => {
    const _origEnv = process.env;

    beforeEach(() => {
        process.env = { ..._origEnv };
        Config.reset();
    });

    afterAll(() => {
        process.env = _origEnv;
    });

    describe('FT-01a: resolves values from environment variables', () => {
        it('reads JIRA_BASE_URL from env', () => {
            process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
            expect(Config.get('jiraBaseUrl')).toBe('https://jira.example.com');
        });

        it('reads JIRA_PERSONAL_TOKEN from env', () => {
            process.env['JIRA_PERSONAL_TOKEN'] = 'test-token-abc123';
            expect(Config.get('jiraPersonalToken')).toBe('test-token-abc123');
        });

        it('reads XRAY_MODE from env', () => {
            process.env['XRAY_MODE'] = 'cloud';
            expect(Config.get('xrayMode')).toBe('cloud');
        });
    });

    describe('FT-01b: resolves config schema defaults', () => {
        it('returns "server" as default xrayMode', () => {
            delete process.env['XRAY_MODE'];
            expect(Config.get('xrayMode')).toBe('server');
        });

        it('returns default logLevel when not set', () => {
            delete process.env['LOG_LEVEL'];
            expect(Config.get('logLevel')).toBeDefined();
        });
    });

    describe('FT-01c: programmatic overrides take precedence', () => {
        it('override beats env var', () => {
            process.env['JIRA_BASE_URL'] = 'https://env.example.com';
            Config.set('jiraBaseUrl', 'https://override.example.com');
            expect(Config.get('jiraBaseUrl')).toBe('https://override.example.com');
        });

        it('static set works on default instance', () => {
            Config.set('testKey', 'testValue');
            expect(Config.get('testKey')).toBe('testValue');
        });
    });

    describe('FT-01d: type coercion', () => {
        it('coerces AUTO_CONFIRM to boolean true', () => {
            process.env['AUTO_CONFIRM'] = 'true';
            expect(Config.get<boolean>('autoConfirm')).toBe(true);
        });

        it('coerces AUTO_CONFIRM to boolean false', () => {
            process.env['AUTO_CONFIRM'] = 'false';
            expect(Config.get<boolean>('autoConfirm')).toBe(false);
        });

        it('coerces numeric env var to number', () => {
            process.env['METRICS_MAX_RUNS'] = '100';
            expect(Config.get<number>('metricsMaxRuns')).toBe(100);
        });
    });

    describe('FT-01e: Config.create() produces independent instances', () => {
        it('created instance has its own overrides', () => {
            const instance = Config.create({ debug: true });
            expect(instance.get<boolean>('debug')).toBe(true);
            expect(Config.get<boolean>('debug')).not.toBe(true);
        });
    });

    describe('FT-01f: getAllPrefixed returns matching env vars', () => {
        it('collects all JIRA_ prefixed vars', () => {
            process.env['JIRA_BASE_URL'] = 'https://jira.test.com';
            process.env['JIRA_PERSONAL_TOKEN'] = 'token123';
            const result = Config.getAllPrefixed('JIRA_');
            expect(result['JIRA_BASE_URL']).toBe('https://jira.test.com');
            expect(result['JIRA_PERSONAL_TOKEN']).toBe('token123');
        });

        it('returns empty for non-existent prefix', () => {
            const result = Config.getAllPrefixed('NONEXISTENT_PREFIX_');
            expect(Object.keys(result)).toHaveLength(0);
        });
    });
});
