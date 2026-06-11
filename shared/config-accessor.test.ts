import Config from './config-accessor.js';

describe('Config (accessor)', () => {
    const _origEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ..._origEnv };
        Config.reset();
    });

    afterAll(() => {
        process.env = _origEnv;
    });

    describe('get — static', () => {
        it('returns env var value when key matches CONFIG_SCHEMA envVar', () => {
            process.env['JIRA_BASE_URL'] = 'https://jira.test.com';
            expect(Config.get('jiraBaseUrl')).toBe('https://jira.test.com');
        });

        it('returns default value from CONFIG_SCHEMA when env var is unset', () => {
            delete process.env['XRAY_MODE'];
            expect(Config.get('xrayMode')).toBe('server');
        });

        it('returns override value when set via Config.set', () => {
            Config.set('jiraBaseUrl', 'https://override.test.com');
            expect(Config.get('jiraBaseUrl')).toBe('https://override.test.com');
        });

        it('returns override when both env and override exist', () => {
            process.env['JIRA_BASE_URL'] = 'https://env.test.com';
            Config.set('jiraBaseUrl', 'https://override.test.com');
            expect(Config.get('jiraBaseUrl')).toBe('https://override.test.com');
        });

        it('returns envVal for unknown key (no schema entry)', () => {
            process.env['SOME_RANDOM_KEY'] = 'random_value';
            expect(Config.get('someRandomKey')).toBe('');
        });

        it('coerces boolean type from CONFIG_SCHEMA', () => {
            process.env['AUTO_CONFIRM'] = 'true';
            expect(Config.get<boolean>('autoConfirm')).toBe(true);
            process.env['AUTO_CONFIRM'] = 'false';
            expect(Config.get<boolean>('autoConfirm')).toBe(false);
        });

        it('coerces number type from CONFIG_SCHEMA', () => {
            process.env['LOG_MAX_SIZE'] = '9999';
            expect(Config.get<number>('logMaxSize')).toBe(9999);
        });

        it('returns default number when env var is NaN', () => {
            delete process.env['LOG_MAX_SIZE'];
            expect(Config.get<number>('logMaxSize')).toBe(5242880);
        });

        it('throws for invalid xrayMode value', () => {
            process.env['XRAY_MODE'] = 'invalid';
            expect(() => Config.get('xrayMode')).toThrow(/Must be "server" or "cloud"/);
        });

        it('throws for invalid jiraMode value', () => {
            process.env['JIRA_MODE'] = 'invalid';
            expect(() => Config.get('jiraMode')).toThrow(/Must be "server" or "cloud"/);
        });

        it('defaults jiraMode to server when env var is unset', () => {
            delete process.env['JIRA_MODE'];
            expect(Config.get('jiraMode')).toBe('server');
        });

        it('returns cloud when JIRA_MODE=cloud is set', () => {
            process.env['JIRA_MODE'] = 'cloud';
            expect(Config.get('jiraMode')).toBe('cloud');
        });

        it('returns logDir from QA_TOOLS_LOGS_DIR when set', () => {
            process.env['QA_TOOLS_LOGS_DIR'] = '/custom/logs';
            expect(Config.get('logDir')).toBe('/custom/logs');
        });
    });

    describe('get — instance', () => {
        it('returns value from instance with custom overrides', () => {
            const cfg = Config.create({ jiraBaseUrl: 'https://instance.test.com' });
            expect(cfg.get('jiraBaseUrl')).toBe('https://instance.test.com');
        });

        it('falls through to env when instance has no override', () => {
            process.env['JIRA_BASE_URL'] = 'https://env.test.com';
            const cfg = Config.create();
            expect(cfg.get('jiraBaseUrl')).toBe('https://env.test.com');
        });
    });

    describe('set', () => {
        it('stores override values', () => {
            Config.set('testKey', 'testValue');
            expect(Config.get('testKey')).toBe('testValue');
        });

        it('overwrites previous override with new value', () => {
            Config.set('testKey', 'first');
            Config.set('testKey', 'second');
            expect(Config.get('testKey')).toBe('second');
        });
    });

    describe('reset', () => {
        it('clears overrides and restores fresh instance', () => {
            Config.set('jiraBaseUrl', 'https://override.test.com');
            delete process.env['JIRA_BASE_URL'];
            Config.reset();
            expect(Config.get('jiraBaseUrl')).toBe('');
        });
    });

    describe('create', () => {
        it('creates isolated instance with given overrides', () => {
            const cfg = Config.create({ dryRun: true });
            expect(cfg.get<boolean>('dryRun')).toBe(true);
        });

        it('does not affect default instance', () => {
            const custom = Config.create({ dryRun: true });
            expect(custom.get<boolean>('dryRun')).toBe(true);
            expect(Config.get<boolean>('dryRun')).toBe(false);
        });
    });

    describe('setAutoConfirm', () => {
        it('sets autoConfirm override on default instance', () => {
            Config.setAutoConfirm(true);
            expect(Config.get<boolean>('autoConfirm')).toBe(true);
        });

        it('sets autoConfirm override on specific instance', () => {
            const cfg = Config.create();
            cfg.setAutoConfirm(true);
            expect(cfg.get<boolean>('autoConfirm')).toBe(true);
        });
    });

    describe('getAllPrefixed', () => {
        it('returns all env vars matching prefix', () => {
            process.env['LLM_API_KEY'] = 'sk-test';
            process.env['LLM_MODEL'] = 'test-model';
            process.env['OTHER_VAR'] = 'other';
            const result = Config.getAllPrefixed('LLM_');
            expect(result['LLM_API_KEY']).toBe('sk-test');
            expect(result['LLM_MODEL']).toBe('test-model');
            expect(result['OTHER_VAR']).toBeUndefined();
        });

        it('returns empty object when no env vars match', () => {
            delete process.env['LLM_API_KEY'];
            delete process.env['LLM_MODEL'];
            expect(Config.getAllPrefixed('NONEXIST_')).toEqual({});
        });
    });

    describe('validateRequiredEnv', () => {
        it('throws when required env vars are missing', () => {
            delete process.env['JIRA_BASE_URL'];
            delete process.env['JIRA_PERSONAL_TOKEN'];
            delete process.env['XRAY_BASE_URL'];
            expect(() => Config.validateRequiredEnv()).toThrow();
        });

        it('passes when required env vars are present', () => {
            process.env['JIRA_BASE_URL'] = 'url';
            process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
            process.env['XRAY_BASE_URL'] = 'url';
            expect(() => Config.validateRequiredEnv()).not.toThrow();
        });
    });
});
