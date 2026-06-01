jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('Config', () => {
    let Config: typeof import('./config').default;
    let dotenv: { config: jest.Mock };
    const ENV_VARS = [
        'JIRA_BASE_URL',
        'JIRA_PERSONAL_TOKEN',
        'XRAY_BASE_URL',
        'XRAY_MODE',
        'JIRA_PROJECT',
        'GIT_TOKEN',
        'GIT_BASE_URL',
        'GITHUB_TOKEN',
        'GITHUB_API_URL',
        'CYPRESS_PROJECT_PATH',
        'CSV_DEFAULT_PATH',
        'AUTO_CHOICE',
        'AUTO_CONFIRM',
        'DRY_RUN',
        'DEBUG',
        'QUIET',
        'ON_ERROR',
        'CSV_PATH',
        'CSV_LABELS',
        'JSON_PATH',
        'JSON_LABELS',
        'LOG_LEVEL',
        'LOG_FILE',
        'LOG_DIR',
        'QA_TOOLS_LOGS_DIR',
        'LOG_MAX_SIZE',
        'XDG_STATE_HOME',
        'LLM_MAX_TOTAL_TOKENS',
    ];

    beforeAll(() => {
        dotenv = require('dotenv');
    });

    beforeEach(() => {
        ENV_VARS.forEach((v) => delete process.env[v]);
        dotenv.config.mockClear();
        jest.isolateModules(() => {
            Config = require('./config').default;
        });
    });

    describe('ensureDotenv', () => {
        it('calls dotenv.config exactly once on module load', () => {
            expect(dotenv.config).toHaveBeenCalledTimes(1);
        });

        it('does not call dotenv.config again when accessing getters', () => {
            dotenv.config.mockClear();
            Config.get('jiraBaseUrl');
            Config.get('debug');
            Config.get('onError');
            Config.get('logLevel');
            expect(dotenv.config).not.toHaveBeenCalled();
        });

        it('handles dotenv.config throwing without crashing', () => {
            dotenv.config.mockImplementationOnce(() => {
                throw new Error('fail');
            });
            jest.isolateModules(() => {
                const LocalConfig = require('./config').default;
                expect(typeof LocalConfig.load).toBe('function');
            });
            expect(Config).toBeDefined();
        });
    });

    describe('string getters — value from env', () => {
        const STRING_GETTERS: Array<[string, string]> = [
            ['jiraBaseUrl', 'JIRA_BASE_URL'],
            ['jiraPersonalToken', 'JIRA_PERSONAL_TOKEN'],
            ['xrayBaseUrl', 'XRAY_BASE_URL'],
            ['jiraProject', 'JIRA_PROJECT'],
            ['gitToken', 'GIT_TOKEN'],
            ['gitBaseUrl', 'GIT_BASE_URL'],
            ['githubToken', 'GITHUB_TOKEN'],
            ['githubApiUrl', 'GITHUB_API_URL'],
            ['cypressProjectPath', 'CYPRESS_PROJECT_PATH'],
            ['csvDefaultPath', 'CSV_DEFAULT_PATH'],
            ['autoChoice', 'AUTO_CHOICE'],
            ['csvPath', 'CSV_PATH'],
            ['csvLabels', 'CSV_LABELS'],
            ['jsonPath', 'JSON_PATH'],
            ['jsonLabels', 'JSON_LABELS'],
            ['logLevel', 'LOG_LEVEL'],
            ['logDir', 'LOG_DIR'],
            ['xdgStateHome', 'XDG_STATE_HOME'],
        ];

        it.each(STRING_GETTERS)('%s returns the env value when set', (getter, envVar) => {
            process.env[envVar] = 'from-env';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get(getter)).toBe('from-env');
            });
        });
    });

    describe('string getters — fallback defaults', () => {
        const STRING_DEFAULTS: Array<[string, string]> = [
            ['jiraBaseUrl', ''],
            ['jiraPersonalToken', ''],
            ['xrayBaseUrl', ''],
            ['jiraProject', 'YOUR_PROJECT_KEY'],
            ['gitToken', ''],
            ['gitBaseUrl', ''],
            ['githubToken', ''],
            ['githubApiUrl', 'https://api.github.com'],
            ['cypressProjectPath', ''],
            ['csvDefaultPath', ''],
            ['autoChoice', ''],
            ['onError', 'abort'],
            ['csvPath', ''],
            ['csvLabels', ''],
            ['jsonPath', ''],
            ['jsonLabels', ''],
            ['logLevel', 'INFO'],
            ['logDir', 'logs'],
            ['xdgStateHome', ''],
        ];

        it.each(STRING_DEFAULTS)('%s returns "%s" when env not set', (getter, fallback) => {
            expect(Config.get(getter)).toBe(fallback);
        });
    });

    describe('boolean getters', () => {
        const BOOL_GETTERS = ['autoConfirm', 'dryRun', 'debug', 'quiet', 'logFile'] as const;

        function getEnvVar(getter: string): string {
            return getter.replace(/([A-Z])/g, '_$1').toUpperCase();
        }

        it.each(BOOL_GETTERS)('%s returns true when env var is "true"', (getter) => {
            process.env[getEnvVar(getter)] = 'true';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get(getter)).toBe(true);
            });
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is not set', (getter) => {
            expect(Config.get(getter)).toBe(false);
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is not "true"', (getter) => {
            process.env[getEnvVar(getter)] = 'false';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get(getter)).toBe(false);
            });
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is arbitrary string', (getter) => {
            process.env[getEnvVar(getter)] = 'yes';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get(getter)).toBe(false);
            });
        });
    });

    describe('debug', () => {
        it('returns a boolean', () => {
            expect(typeof Config.get('debug')).toBe('boolean');
        });

        it('returns true when DEBUG=true', () => {
            process.env.DEBUG = 'true';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('debug')).toBe(true);
            });
        });

        it('returns false when DEBUG is not set', () => {
            expect(Config.get('debug')).toBe(false);
        });
    });

    describe('onError', () => {
        it('returns abort by default', () => {
            expect(Config.get('onError')).toBe('abort');
        });

        it('returns env value when set', () => {
            process.env.ON_ERROR = 'continue';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('onError')).toBe('continue');
            });
        });
    });

    describe('jiraProject', () => {
        it('returns YOUR_PROJECT_KEY by default', () => {
            expect(Config.get('jiraProject')).toBe('YOUR_PROJECT_KEY');
        });

        it('returns env value when set', () => {
            process.env.JIRA_PROJECT = 'PROJX';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('jiraProject')).toBe('PROJX');
            });
        });
    });

    describe('githubApiUrl', () => {
        it('returns https://api.github.com by default', () => {
            expect(Config.get('githubApiUrl')).toBe('https://api.github.com');
        });

        it('returns env value when set', () => {
            process.env.GITHUB_API_URL = 'https://custom.github.com/api';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('githubApiUrl')).toBe('https://custom.github.com/api');
            });
        });
    });

    describe('logMaxSize', () => {
        it('parses env value as number', () => {
            process.env.LOG_MAX_SIZE = '1048576';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logMaxSize')).toBe(1048576);
            });
        });

        it('returns default 5MB when env not set', () => {
            expect(Config.get('logMaxSize')).toBe(5 * 1024 * 1024);
        });

        it('returns default 5MB when env is not a valid number', () => {
            process.env.LOG_MAX_SIZE = 'not-a-number';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logMaxSize')).toBe(5 * 1024 * 1024);
            });
        });

        it('returns default 5MB when env is empty string', () => {
            process.env.LOG_MAX_SIZE = '';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logMaxSize')).toBe(5 * 1024 * 1024);
            });
        });

        it('returns parsed number when env is zero', () => {
            process.env.LOG_MAX_SIZE = '0';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logMaxSize')).toBe(0);
            });
        });
    });

    describe('load', () => {
        it('is a static method that can be called multiple times without error', () => {
            expect(Config.load()).toBeUndefined();
            expect(Config.load()).toBeUndefined();
            expect(Config.load()).toBeUndefined();
        });
    });

    describe('unset env vars', () => {
        it('returns empty string for all optional string getters when nothing is set', () => {
            const emptyGetters = [
                'jiraBaseUrl',
                'jiraPersonalToken',
                'xrayBaseUrl',
                'gitToken',
                'gitBaseUrl',
                'githubToken',
                'cypressProjectPath',
                'csvDefaultPath',
                'autoChoice',
                'csvPath',
                'csvLabels',
                'jsonPath',
                'jsonLabels',
                'xdgStateHome',
            ] as const;
            emptyGetters.forEach((g) => {
                expect(Config.get(g)).toBe('');
            });
        });
    });

    describe('xrayMode', () => {
        it('returns server by default', () => {
            expect(Config.get('xrayMode')).toBe('server');
        });

        it('returns env value when set', () => {
            process.env.XRAY_MODE = 'cloud';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('xrayMode')).toBe('cloud');
            });
        });

        it('throws on invalid value', () => {
            process.env.XRAY_MODE = 'invalid';
            jest.isolateModules(() => {
                expect(() => require('./config').default.get('xrayMode')).toThrow(/Invalid XRAY_MODE/);
            });
        });
    });

    describe('env var propagation across getters', () => {
        it('each getter reads the current process.env value', () => {
            process.env.JIRA_BASE_URL = 'https://jira.example.com';
            process.env.JIRA_PERSONAL_TOKEN = 'token-123';
            process.env.XRAY_BASE_URL = 'https://xray.example.com';
            process.env.GIT_TOKEN = 'git-token';
            process.env.GIT_BASE_URL = 'https://git.example.com';
            process.env.GITHUB_TOKEN = 'gh-token';
            process.env.AUTO_CHOICE = 'yes';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('jiraBaseUrl')).toBe('https://jira.example.com');
                expect(cfg.get('jiraPersonalToken')).toBe('token-123');
                expect(cfg.get('xrayBaseUrl')).toBe('https://xray.example.com');
                expect(cfg.get('gitToken')).toBe('git-token');
                expect(cfg.get('gitBaseUrl')).toBe('https://git.example.com');
                expect(cfg.get('githubToken')).toBe('gh-token');
                expect(cfg.get('autoChoice')).toBe('yes');
            });
        });
    });

    describe('logLevel', () => {
        it('returns INFO by default', () => {
            expect(Config.get('logLevel')).toBe('INFO');
        });

        it('returns env value when set', () => {
            process.env.LOG_LEVEL = 'DEBUG';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logLevel')).toBe('DEBUG');
            });
        });
    });

    describe('logDir', () => {
        it('returns logs by default', () => {
            expect(Config.get('logDir')).toBe('logs');
        });

        it('returns env value when set', () => {
            process.env.LOG_DIR = '/var/log';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logDir')).toBe('/var/log');
            });
        });

        it('prioritizes QA_TOOLS_LOGS_DIR over LOG_DIR', () => {
            process.env.QA_TOOLS_LOGS_DIR = '/qa/logs';
            process.env.LOG_DIR = '/var/log';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.get('logDir')).toBe('/qa/logs');
            });
            delete process.env.QA_TOOLS_LOGS_DIR;
            delete process.env.LOG_DIR;
        });

        it('uses override when provided', () => {
            const cfg = Config.create({ logDir: '/override/logs' });
            expect(cfg.get('logDir')).toBe('/override/logs');
        });
    });

    describe('getAllPrefixed', () => {
        const TEST_VARS = ['QA_TEST_VAR1', 'QA_TEST_VAR2', 'QA_TEST_EMPTY', 'QA_TEST_FULL', 'OTHER_VAR'];

        afterEach(() => {
            TEST_VARS.forEach((v) => delete process.env[v]);
        });

        it('returns matching env vars', () => {
            process.env.QA_TEST_VAR1 = 'value1';
            process.env.QA_TEST_VAR2 = 'value2';
            process.env.OTHER_VAR = 'other';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                const result = cfg.getAllPrefixed('QA_TEST_');
                expect(result).toEqual({
                    QA_TEST_VAR1: 'value1',
                    QA_TEST_VAR2: 'value2',
                });
            });
        });

        it('filters out empty values', () => {
            process.env.QA_TEST_EMPTY = '';
            process.env.QA_TEST_FULL = 'full';
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                const result = cfg.getAllPrefixed('QA_TEST_');
                expect(result).toEqual({ QA_TEST_FULL: 'full' });
            });
        });

        it('returns empty object when no match', () => {
            jest.isolateModules(() => {
                const cfg = require('./config').default;
                expect(cfg.getAllPrefixed('NONEXISTENT_')).toEqual({});
            });
        });
    });

    describe('reset', () => {
        it('creates a new default instance', () => {
            const before = Config.getDefault();
            Config.reset();
            const after = Config.getDefault();
            expect(before).not.toBe(after);
        });

        it('getters return correct values after reset', () => {
            Config.reset();
            expect(Config.get('jiraBaseUrl')).toBe('');
            expect(Config.get('debug')).toBe(false);
        });
    });

    describe('llmMaxTotalTokens', () => {
        beforeEach(() => {
            delete process.env.LLM_MAX_TOTAL_TOKENS;
        });

        it('defaults to 0 (unlimited)', () => {
            expect(Config.get('llmMaxTotalTokens')).toBe(0);
        });

        it('reads from LLM_MAX_TOTAL_TOKENS env var', () => {
            process.env.LLM_MAX_TOTAL_TOKENS = '50000';
            expect(Config.get('llmMaxTotalTokens')).toBe(50000);
        });

        it('uses override when provided', () => {
            const overridden = Config.create({ llmMaxTotalTokens: 100000 });
            expect(overridden.get('llmMaxTotalTokens')).toBe(100000);
        });
    });

    describe('Config.create with LLM overrides', () => {
        it('uses override values for all LLM getters', () => {
            const o = {
                llmApiKey: 'key-ov',
                llmModel: 'model-ov',
                llmBaseUrl: 'url-ov',
                llmSmallApiKey: 'small-key',
                llmSmallModel: 'small-model-ov',
                llmFastApiKey: 'fast-key',
                llmFastModel: 'fast-model-ov',
                llmFastBaseUrl: 'fast-url-ov',
                llmReviewApiKey: 'rev-key',
                llmReviewModel: 'rev-model-ov',
                llmReviewBaseUrl: 'rev-url-ov',
                llmFallbackApiKey: 'fb-key',
                llmFallbackModel: 'fb-model-ov',
                llmFallbackBaseUrl: 'fb-url-ov',
                llmBatchApiKey: 'batch-key',
                llmBatchModel: 'batch-model-ov',
                llmBatchBaseUrl: 'batch-url-ov',
                xrayClientId: 'cid-ov',
                xrayClientSecret: 'csec-ov',
            };
            const cfg = Config.create(o);
            expect(cfg.get('llmApiKey')).toBe('key-ov');
            expect(cfg.get('llmModel')).toBe('model-ov');
            expect(cfg.get('llmBaseUrl')).toBe('url-ov');
            expect(cfg.get('llmSmallApiKey')).toBe('small-key');
            expect(cfg.get('llmSmallModel')).toBe('small-model-ov');
            expect(cfg.get('llmFastApiKey')).toBe('fast-key');
            expect(cfg.get('llmFastModel')).toBe('fast-model-ov');
            expect(cfg.get('llmFastBaseUrl')).toBe('fast-url-ov');
            expect(cfg.get('llmReviewApiKey')).toBe('rev-key');
            expect(cfg.get('llmReviewModel')).toBe('rev-model-ov');
            expect(cfg.get('llmReviewBaseUrl')).toBe('rev-url-ov');
            expect(cfg.get('llmFallbackApiKey')).toBe('fb-key');
            expect(cfg.get('llmFallbackModel')).toBe('fb-model-ov');
            expect(cfg.get('llmFallbackBaseUrl')).toBe('fb-url-ov');
            expect(cfg.get('llmBatchApiKey')).toBe('batch-key');
            expect(cfg.get('llmBatchModel')).toBe('batch-model-ov');
            expect(cfg.get('llmBatchBaseUrl')).toBe('batch-url-ov');
            expect(cfg.get('xrayClientId')).toBe('cid-ov');
            expect(cfg.get('xrayClientSecret')).toBe('csec-ov');
        });

        it('defers to envVal when no override present', () => {
            process.env.LLM_API_KEY = 'env-key';
            process.env.LLM_BASE_URL = 'env-url';
            const cfg = Config.create();
            expect(cfg.get('llmApiKey')).toBe('env-key');
            expect(cfg.get('llmBaseUrl')).toBe('env-url');
            delete process.env.LLM_API_KEY;
            delete process.env.LLM_BASE_URL;
        });

        it('uses boolean override for toBool', () => {
            const cfg = Config.create({ autoConfirm: true, dryRun: false });
            expect(cfg.get('autoConfirm')).toBe(true);
            expect(cfg.get('dryRun')).toBe(false);
        });

        it('uses numeric override for toInt', () => {
            const cfg = Config.create({ logMaxSize: 0 });
            expect(cfg.get('logMaxSize')).toBe(0);
        });
    });

    describe('static LLM getters delegate to defaultInstance', () => {
        beforeEach(() => {
            delete process.env.LLM_API_KEY;
            delete process.env.LLM_MODEL;
            delete process.env.LLM_BASE_URL;
            delete process.env.LLM_SMALL_API_KEY;
            delete process.env.LLM_SMALL_MODEL;
            delete process.env.LLM_FAST_API_KEY;
            delete process.env.LLM_FAST_MODEL;
            delete process.env.LLM_FAST_BASE_URL;
            delete process.env.LLM_REVIEW_API_KEY;
            delete process.env.LLM_REVIEW_MODEL;
            delete process.env.LLM_REVIEW_BASE_URL;
            delete process.env.LLM_FALLBACK_API_KEY;
            delete process.env.LLM_FALLBACK_MODEL;
            delete process.env.LLM_FALLBACK_BASE_URL;
            delete process.env.LLM_BATCH_API_KEY;
            delete process.env.LLM_BATCH_MODEL;
            delete process.env.LLM_BATCH_BASE_URL;
            delete process.env.LLM_MAX_TOKENS_PER_OP;
        });

        it('returns env values for static LLM getters', () => {
            process.env.LLM_API_KEY = 'k';
            process.env.LLM_MODEL = 'm';
            process.env.LLM_BASE_URL = 'u';
            process.env.LLM_SMALL_API_KEY = 'sk';
            process.env.LLM_SMALL_MODEL = 'sm';
            process.env.LLM_FAST_API_KEY = 'fk';
            process.env.LLM_FAST_MODEL = 'fm';
            process.env.LLM_FAST_BASE_URL = 'fu';
            process.env.LLM_REVIEW_API_KEY = 'rk';
            process.env.LLM_REVIEW_MODEL = 'rm';
            process.env.LLM_REVIEW_BASE_URL = 'ru';
            process.env.LLM_FALLBACK_API_KEY = 'fbk';
            process.env.LLM_FALLBACK_MODEL = 'fbm';
            process.env.LLM_FALLBACK_BASE_URL = 'fbu';
            process.env.LLM_BATCH_API_KEY = 'bk';
            process.env.LLM_BATCH_MODEL = 'bm';
            process.env.LLM_BATCH_BASE_URL = 'bu';
            process.env.LLM_MAX_TOKENS_PER_OP = '64000';
            Config.create();
            expect(Config.get('llmApiKey')).toBe('k');
            expect(Config.get('llmModel')).toBe('m');
            expect(Config.get('llmBaseUrl')).toBe('u');
            expect(Config.get('llmSmallApiKey')).toBe('sk');
            expect(Config.get('llmSmallModel')).toBe('sm');
            expect(Config.get('llmFastApiKey')).toBe('fk');
            expect(Config.get('llmFastModel')).toBe('fm');
            expect(Config.get('llmFastBaseUrl')).toBe('fu');
            expect(Config.get('llmReviewApiKey')).toBe('rk');
            expect(Config.get('llmReviewModel')).toBe('rm');
            expect(Config.get('llmReviewBaseUrl')).toBe('ru');
            expect(Config.get('llmFallbackApiKey')).toBe('fbk');
            expect(Config.get('llmFallbackModel')).toBe('fbm');
            expect(Config.get('llmFallbackBaseUrl')).toBe('fbu');
            expect(Config.get('llmBatchApiKey')).toBe('bk');
            expect(Config.get('llmBatchModel')).toBe('bm');
            expect(Config.get('llmBatchBaseUrl')).toBe('bu');
            expect(Config.get('llmMaxTokens')).toBe(64000);
        });
    });

    describe('get(key)', () => {
        it('returns override string value', () => {
            const cfg = Config.create({ jiraBaseUrl: 'https://override' });
            expect(cfg.get('jiraBaseUrl')).toBe('https://override');
        });

        it('returns boolean true for boolean override', () => {
            const cfg = Config.create({ debug: true });
            expect(cfg.get('debug')).toBe(true);
        });

        it('returns boolean false for boolean override', () => {
            const cfg = Config.create({ debug: false });
            expect(cfg.get('debug')).toBe(false);
        });

        it('returns number for numeric override', () => {
            const cfg = Config.create({ logMaxSize: 123456 });
            expect(cfg.get('logMaxSize')).toBe(123456);
        });

        it('returns empty string for override set to undefined', () => {
            const cfg = Config.create({ jiraBaseUrl: undefined });
            expect(cfg.get('jiraBaseUrl')).toBe('');
        });

        it('falls back to process.env when key not in overrides', () => {
            process.env.TEST_KEY_FALLBACK = 'env-value';
            expect(Config.get('TEST_KEY_FALLBACK')).toBe('env-value');
            delete process.env.TEST_KEY_FALLBACK;
        });

        it('static get delegates to instance', () => {
            process.env.TEST_STATIC_GET = 'static-val';
            expect(Config.get('TEST_STATIC_GET')).toBe('static-val');
            delete process.env.TEST_STATIC_GET;
        });
    });
});
