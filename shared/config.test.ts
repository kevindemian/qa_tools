const mockDotenvConfig = vi.hoisted(() => vi.fn<(...args: [object]) => () => void>());
vi.mock('dotenv', () => ({ default: { config: mockDotenvConfig } }));

import Config from './config.js';
import { __resetDotenvLoaded } from './env-utils.js';

describe('Config', () => {
    const ENV_VARS = [
        'JIRA_BASE_URL',
        'JIRA_PERSONAL_TOKEN',
        'XRAY_BASE_URL',
        'XRAY_MODE',
        'XRAY_CLIENT_ID',
        'XRAY_CLIENT_SECRET',
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
        'LLM_API_KEY',
        'LLM_MODEL',
        'LLM_BASE_URL',
        'LLM_FAST_API_KEY',
        'LLM_FAST_MODEL',
        'LLM_FAST_BASE_URL',
        'LLM_REVIEW_API_KEY',
        'LLM_REVIEW_MODEL',
        'LLM_REVIEW_BASE_URL',
        'LLM_FALLBACK_API_KEY',
        'LLM_FALLBACK_MODEL',
        'LLM_FALLBACK_BASE_URL',
        'LLM_BATCH_API_KEY',
        'LLM_BATCH_MODEL',
        'LLM_BATCH_BASE_URL',
        'LLM_MAX_TOKENS_PER_OP',
        'LLM_RATE_LIMIT',
        'LLM_FETCH_RETRIES',
        'LLM_DISK_CACHE_DIR',
        'LLM_CACHE_KEY',
        'LLM_REVIEW_BUDGET',
        'LLM_REVIEW_STRATEGY',
        'SKIP_FIRST_RUN',
        'NO_COLOR',
        'QA_TOOLS_NO_CLEAR',
        'METRICS_MAX_RUNS',
        'REPORT_CACHE_MAX',
        'QA_AUTO_BUG',
        'QA_FAIL_ON',
        'GITHUB_PR_NUMBER',
        'QA_PUBLISH',
        'QA_MAPPING_PATH',
        'BENCHMARK',
        'QA_COST_PER_COMPUTE_MINUTE',
        'AWS_S3_BUCKET',
        'QA_GATE_MIN_PASS_RATE',
        'QA_GATE_MAX_FLAKY_PCT',
        'QA_GATE_MIN_COVERAGE',
        'QA_GATE_MAX_SUITE_SPEED',
        'QA_GIT_BLAME_IGNORE',
        'CI',
        'GITHUB_REPOSITORY',
        'CI_JOB_NAME',
        'GITHUB_WORKFLOW',
        'CI_JOB_URL',
        'GITHUB_SERVER_URL',
        'CI_COMMIT_BRANCH',
        'GITHUB_REF_NAME',
        'CI_JOB_TOKEN',
        'CI_PROJECT_ID',
        'CI_SERVER_URL',
        'CI_PR_NUMBER',
    ];

    beforeEach(() => {
        ENV_VARS.forEach((v) => delete process.env[v]);
        mockDotenvConfig.mockClear();
        Config.reset();
    });

    describe('EnsureDotenv', () => {
        it('calls dotenv.config twice on module load (.env.local + .env)', () => {
            __resetDotenvLoaded();
            Config.load();

            expect(mockDotenvConfig).toHaveBeenCalledTimes(2);
        });

        it('does not call dotenv.config again when accessing getters', () => {
            Config.get('jiraBaseUrl');
            Config.get('debug');
            Config.get('onError');
            Config.get('logLevel');

            expect(mockDotenvConfig).not.toHaveBeenCalled();
        });

        it('handles dotenv.config throwing without crashing', () => {
            mockDotenvConfig.mockImplementationOnce(() => {
                throw new Error('fail');
            });
            __resetDotenvLoaded();
            Config.load();

            expect(typeof Config.load).toBe('function');
        });
    });

    describe('String getters — value from env', () => {
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
            ['csvPath', 'CSV_PATH'],
            ['jsonPath', 'JSON_PATH'],
        ];

        it.each(STRING_GETTERS)('%s returns the env value when set', (getter, envVar) => {
            process.env[envVar] = 'from-env';

            expect(Config.get(getter)).toBe('from-env');
        });
    });

    describe('String getters — fallback defaults', () => {
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
            ['csvPath', ''],
            ['jsonPath', ''],
            ['xrayClientId', ''],
            ['xrayClientSecret', ''],
            ['llmApiKey', ''],
            ['llmModel', 'google/gemini-2.0-flash-exp'],
            ['llmBaseUrl', 'https://openrouter.ai/api/v1'],
            ['llmFastApiKey', ''],
            ['llmFastModel', 'llama-3.1-8b-instant'],
            ['llmFastBaseUrl', 'https://api.groq.com/openai/v1'],
            ['llmReviewApiKey', ''],
            ['llmReviewModel', 'gemini-2.0-flash-exp'],
            ['llmReviewBaseUrl', 'https://generativelanguage.googleapis.com/v1beta'],
            ['llmFallbackApiKey', ''],
            ['llmFallbackModel', 'meta/llama3-70b-instruct'],
            ['llmFallbackBaseUrl', 'https://integrate.api.nvidia.com/v1'],
            ['llmBatchApiKey', ''],
            ['llmBatchModel', 'gpt-4o-mini'],
            ['llmBatchBaseUrl', 'https://models.inference.ai.azure.com'],
            ['onError', 'abort'],
        ];

        it.each(STRING_DEFAULTS)('%s defaults to "%s"', (getter, expected) => {
            expect(Config.get(getter)).toBe(expected);
        });
    });

    describe('Boolean getters', () => {
        const BOOL_GETTERS: Array<[string, string]> = [
            ['autoConfirm', 'AUTO_CONFIRM'],
            ['dryRun', 'DRY_RUN'],
            ['debug', 'DEBUG'],
            ['quiet', 'QUIET'],
            ['logFile', 'LOG_FILE'],
        ];

        it.each(BOOL_GETTERS)('%s defaults to false', (getter) => {
            expect(Config.get(getter)).toBeFalsy();
        });

        it.each(BOOL_GETTERS)('%s returns true when "%s" set to true', (getter, envVar) => {
            process.env[envVar] = 'true';

            expect(Config.get(getter)).toBeTruthy();
        });
    });

    describe('XrayMode', () => {
        it('defaults to "server"', () => {
            expect(Config.get('xrayMode')).toBe('server');
        });

        it('returns the env value when valid', () => {
            process.env['XRAY_MODE'] = 'cloud';

            expect(Config.get('xrayMode')).toBe('cloud');
        });

        it('throws when XRAY_MODE is invalid', () => {
            process.env['XRAY_MODE'] = 'invalid';

            expect(() => Config.get('xrayMode')).toThrow(/XRAY_MODE/);
        });
    });

    describe('CsvLabels', () => {
        it('defaults to empty string', () => {
            expect(Config.get('csvLabels')).toBe('');
        });

        it('returns env value when set', () => {
            process.env['CSV_LABELS'] = 'type,summary';

            expect(Config.get('csvLabels')).toBe('type,summary');
        });
    });

    describe('JsonLabels', () => {
        it('defaults to empty string', () => {
            expect(Config.get('jsonLabels')).toBe('');
        });

        it('returns env value when set', () => {
            process.env['JSON_LABELS'] = 'key,value';

            expect(Config.get('jsonLabels')).toBe('key,value');
        });
    });

    describe('LogLevel', () => {
        it('defaults to INFO', () => {
            expect(Config.get('logLevel')).toBe('INFO');
        });

        it('returns env value when set', () => {
            process.env['LOG_LEVEL'] = 'DEBUG';

            expect(Config.get('logLevel')).toBe('DEBUG');
        });
    });

    describe('LogDir', () => {
        it('returns logs by default', () => {
            expect(Config.get('logDir')).toBe('logs');
        });

        it('returns env value when set', () => {
            process.env['LOG_DIR'] = '/var/log';

            expect(Config.get('logDir')).toBe('/var/log');
        });

        it('prioritizes QA_TOOLS_LOGS_DIR over LOG_DIR', () => {
            process.env['QA_TOOLS_LOGS_DIR'] = '/qa/logs';
            process.env['LOG_DIR'] = '/var/log';

            expect(Config.get('logDir')).toBe('/qa/logs');

            delete process.env['QA_TOOLS_LOGS_DIR'];
            delete process.env['LOG_DIR'];
        });

        it('uses override when provided', () => {
            const cfg = Config.create({ logDir: '/override/logs' });

            expect(cfg.get('logDir')).toBe('/override/logs');
        });
    });

    describe('LogMaxSize', () => {
        it('defaults to 5242880', () => {
            expect(Config.get('logMaxSize')).toBe(5242880);
        });

        it('returns env value when set', () => {
            process.env['LOG_MAX_SIZE'] = '2097152';

            expect(Config.get('logMaxSize')).toBe(2097152);
        });

        it('uses override when provided', () => {
            const cfg = Config.create({ logMaxSize: 4194304 });

            expect(cfg.get('logMaxSize')).toBe(4194304);
        });
    });

    describe('XdgStateHome', () => {
        it('uses XDG_STATE_HOME when set', () => {
            process.env['XDG_STATE_HOME'] = '/custom/state';

            expect(Config.get('xdgStateHome')).toBe('/custom/state');
        });
    });

    describe('GetAllPrefixed', () => {
        it('returns matching env vars', () => {
            process.env['QA_TOOLS_FOO'] = 'bar';
            process.env['QA_TOOLS_BAZ'] = 'qux';
            process.env['OTHER'] = 'ignored';
            const result = Config.getAllPrefixed('QA_TOOLS_');

            expect(result).toStrictEqual({ QA_TOOLS_FOO: 'bar', QA_TOOLS_BAZ: 'qux' });
        });
    });

    describe('Config.create', () => {
        it('returns a separate instance with overrides', () => {
            const cfg = Config.create({ jiraBaseUrl: 'https://override.url' });

            expect(cfg.get('jiraBaseUrl')).toBe('https://override.url');
        });

        it('default instance getters are unaffected by create', () => {
            const cfg = Config.create({ jiraBaseUrl: 'https://override.url' });

            expect(cfg.get('jiraBaseUrl')).toBe('https://override.url');
            expect(Config.get('jiraBaseUrl')).toBe('');
        });

        it('overrides can be partial', () => {
            const cfg = Config.create({ debug: true });

            expect(cfg.get('debug')).toBeTruthy();
            expect(cfg.get('jiraBaseUrl')).toBe('');
        });

        it('overrides take precedence over env vars', () => {
            process.env['JIRA_BASE_URL'] = 'https://env.url';
            const cfg = Config.create({ jiraBaseUrl: 'https://override.url' });

            expect(cfg.get('jiraBaseUrl')).toBe('https://override.url');
        });
    });

    describe('SetAutoConfirm', () => {
        it('setAutoConfirm(true) makes get autoConfirm return true', () => {
            Config.setAutoConfirm(true);

            expect(Config.get('autoConfirm')).toBeTruthy();
        });

        it('setAutoConfirm(false) makes get autoConfirm return false', () => {
            Config.setAutoConfirm(true);
            Config.setAutoConfirm(false);

            expect(Config.get('autoConfirm')).toBeFalsy();
        });

        it('setAutoConfirm on static instance is isolated from created instances', () => {
            const cfg = Config.create({ autoConfirm: false });
            Config.setAutoConfirm(true);

            expect(cfg.get('autoConfirm')).toBeFalsy();
        });

        it('setAutoConfirm on an instance is isolated from static', () => {
            Config.setAutoConfirm(false);
            const cfg = Config.create({ autoConfirm: true });

            expect(cfg.get('autoConfirm')).toBeTruthy();
        });
    });

    describe('Set', () => {
        it('config.set sets an override', () => {
            Config.set('jiraBaseUrl', 'https://set.url');

            expect(Config.get('jiraBaseUrl')).toBe('https://set.url');
        });

        it('config.set does not affect create instances', () => {
            Config.set('debug', true);
            const cfg = Config.create({ debug: false });

            expect(cfg.get('debug')).toBeFalsy();
        });

        it('config.set can override a previously set value', () => {
            Config.set('jiraBaseUrl', 'https://first.url');
            Config.set('jiraBaseUrl', 'https://second.url');

            expect(Config.get('jiraBaseUrl')).toBe('https://second.url');
        });
    });

    describe('Reset', () => {
        it('returns a new default instance', () => {
            const before = Config.getDefault();
            Config.reset();
            const after = Config.getDefault();

            expect(before).not.toBe(after);
        });

        it('getters return correct values after reset', () => {
            Config.reset();

            expect(Config.get('jiraBaseUrl')).toBe('');
            expect(Config.get('debug')).toBeFalsy();
        });
    });

    describe('LlmMaxTotalTokens', () => {
        beforeEach(() => {
            delete process.env['LLM_MAX_TOTAL_TOKENS'];
        });

        it('defaults to 0 (unlimited)', () => {
            expect(Config.get('llmMaxTotalTokens')).toBe(0);
        });

        it('reads from LLM_MAX_TOTAL_TOKENS env var', () => {
            process.env['LLM_MAX_TOTAL_TOKENS'] = '50000';

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
    });

    describe('ValidateRequiredEnv', () => {
        it('does not throw when a required env var is present', () => {
            process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
            process.env['JIRA_PERSONAL_TOKEN'] = 'token-123';
            process.env['XRAY_BASE_URL'] = 'https://xray.example.com';

            expect(() => Config.validateRequiredEnv()).not.toThrow();
        });

        it('throws when a required env var is missing', () => {
            delete process.env['JIRA_BASE_URL'];

            expect(() => Config.validateRequiredEnv()).toThrow();
        });
    });
});
