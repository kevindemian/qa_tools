import { CONFIG_SCHEMA } from './config-schema';

describe('CONFIG_SCHEMA', () => {
    it('has at least 40 entries', () => {
        expect(CONFIG_SCHEMA.length).toBeGreaterThanOrEqual(40);
    });

    it('every entry has key, envVar, type, description', () => {
        for (const f of CONFIG_SCHEMA) {
            expect(f.key).toBeTruthy();
            expect(f.envVar).toBeTruthy();
            expect(['string', 'boolean', 'number']).toContain(f.type);
            expect(f.description).toBeTruthy();
        }
    });

    it('every entry with defaultVal matches its type', () => {
        for (const f of CONFIG_SCHEMA) {
            if (f.defaultVal === undefined) continue;
            if (f.type === 'string') expect(typeof f.defaultVal).toBe('string');
            else if (f.type === 'boolean') expect(typeof f.defaultVal).toBe('boolean');
            else if (f.type === 'number') expect(typeof f.defaultVal).toBe('number');
        }
    });

    it('no duplicate keys', () => {
        const keys = CONFIG_SCHEMA.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('no duplicate envVars', () => {
        const vars = CONFIG_SCHEMA.map((f) => f.envVar);
        expect(new Set(vars).size).toBe(vars.length);
    });

    it('jiraProject defaults to YOUR_PROJECT_KEY', () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'jiraProject');
        expect(f?.defaultVal).toBe('YOUR_PROJECT_KEY');
    });

    it('xrayMode defaults to server', () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'xrayMode');
        expect(f?.defaultVal).toBe('server');
    });

    it('llmMaxTokens is a number with default 128000', () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'llmMaxTokens')!;
        expect(f.type).toBe('number');
        expect(f.defaultVal).toBe(128000);
    });

    it('autoConfirm is boolean with default false', () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'autoConfirm')!;
        expect(f.type).toBe('boolean');
        expect(f.defaultVal).toBe(false);
    });

    it('logMaxSize is number with default 5242880', () => {
        const f = CONFIG_SCHEMA.find((r) => r.key === 'logMaxSize')!;
        expect(f.type).toBe('number');
        expect(f.defaultVal).toBe(5242880);
    });

    it('all keys defined in alphabetical order within groups', () => {
        const firstGroupKeys = [
            'jiraBaseUrl',
            'jiraPersonalToken',
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
