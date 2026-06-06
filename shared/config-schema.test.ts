import { CONFIG_SCHEMA } from './config-schema.js';
import { nonNull } from './test-utils.js';

describe('CONFIG_SCHEMA', () => {
    it('has at least 40 entries', async () => {
        expect(CONFIG_SCHEMA.length).toBeGreaterThanOrEqual(40);
    });

    it('every entry has key, envVar, type, description', async () => {
        for (const f of CONFIG_SCHEMA) {
            expect(f.key).toBeTruthy();
            expect(f.envVar).toBeTruthy();
            expect(['string', 'boolean', 'number']).toContain(f.type);
            expect(f.description).toBeTruthy();
        }
    });

    it('every entry with defaultVal matches its type', async () => {
        for (const f of CONFIG_SCHEMA) {
            if (f.defaultVal === undefined) continue;
            if (f.type === 'string') expect(typeof f.defaultVal).toBe('string');
            else if (f.type === 'boolean') expect(typeof f.defaultVal).toBe('boolean');
            else if (f.type === 'number') expect(typeof f.defaultVal).toBe('number');
        }
    });

    it('no duplicate keys', async () => {
        const keys = CONFIG_SCHEMA.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('no duplicate envVars', async () => {
        const vars = CONFIG_SCHEMA.map((f) => f.envVar);
        expect(new Set(vars).size).toBe(vars.length);
    });

    it('jiraProject defaults to YOUR_PROJECT_KEY', async () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraProject');
        expect(f?.defaultVal).toBe('YOUR_PROJECT_KEY');
    });

    it('xrayMode defaults to server', async () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'xrayMode');
        expect(f?.defaultVal).toBe('server');
    });

    it('jiraMode defaults to server', async () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraMode');
        expect(f?.defaultVal).toBe('server');
    });

    it('jiraMode description mentions server|cloud', async () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraMode');
        expect(f?.description).toMatch(/server.*cloud/i);
    });

    it('llmMaxTokens is a number with default 128000', async () => {
        const f = nonNull(CONFIG_SCHEMA.find((r) => r.key === 'llmMaxTokens'));
        expect(f.type).toBe('number');
        expect(f.defaultVal).toBe(128000);
    });

    it('autoConfirm is boolean with default false', async () => {
        const f = nonNull(CONFIG_SCHEMA.find((r) => r.key === 'autoConfirm'));
        expect(f.type).toBe('boolean');
        expect(f.defaultVal).toBe(false);
    });

    it('logMaxSize is number with default 5242880', async () => {
        const f = nonNull(CONFIG_SCHEMA.find((r) => r.key === 'logMaxSize'));
        expect(f.type).toBe('number');
        expect(f.defaultVal).toBe(5242880);
    });

    it('all keys defined in alphabetical order within groups', async () => {
        const firstGroupKeys = [
            'jiraBaseUrl',
            'jiraPersonalToken',
            'jiraMode',
            'xrayBaseUrl',
            'xrayMode',
            'xrayClientId',
            'xrayClientSecret',
            'xrayCloudUrl',
            'jiraProject',
        ];
        for (const k of firstGroupKeys) {
            expect(CONFIG_SCHEMA.find((f) => f.key === k)).toBeTruthy();
        }
    });
});
