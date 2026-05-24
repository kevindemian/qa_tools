jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('Config', () => {
    let Config: typeof import('./config');
    let dotenv: { config: jest.Mock };
    const ENV_VARS = [
        'JIRA_BASE_URL',
        'JIRA_PERSONAL_TOKEN',
        'XRAY_BASE_URL',
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
        'LOG_MAX_SIZE',
        'XDG_STATE_HOME',
    ];

    beforeAll(() => {
        dotenv = require('dotenv');
    });

    beforeEach(() => {
        ENV_VARS.forEach((v) => delete process.env[v]);
        dotenv.config.mockClear();
        jest.isolateModules(() => {
            Config = require('./config');
        });
    });

    describe('ensureDotenv', () => {
        it('calls dotenv.config exactly once on module load', () => {
            expect(dotenv.config).toHaveBeenCalledTimes(1);
        });

        it('does not call dotenv.config again when accessing getters', () => {
            dotenv.config.mockClear();
            Config.jiraBaseUrl;
            Config.debug;
            Config.onError;
            Config.logLevel;
            expect(dotenv.config).not.toHaveBeenCalled();
        });

        it('handles dotenv.config throwing without crashing', () => {
            dotenv.config.mockImplementationOnce(() => {
                throw new Error('fail');
            });
            jest.isolateModules(() => {
                const LocalConfig = require('./config');
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
                const cfg = require('./config');
                expect(cfg[getter]).toBe('from-env');
            });
        });
    });

    describe('string getters — fallback defaults', () => {
        const STRING_DEFAULTS: Array<[string, string]> = [
            ['jiraBaseUrl', ''],
            ['jiraPersonalToken', ''],
            ['xrayBaseUrl', ''],
            ['jiraProject', 'ECSPOL'],
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
            expect(Config[getter as keyof typeof Config]).toBe(fallback);
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
                const cfg = require('./config');
                expect(cfg[getter]).toBe(true);
            });
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is not set', (getter) => {
            expect(Config[getter]).toBe(false);
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is not "true"', (getter) => {
            process.env[getEnvVar(getter)] = 'false';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg[getter]).toBe(false);
            });
        });

        it.each(BOOL_GETTERS)('%s returns false when env var is arbitrary string', (getter) => {
            process.env[getEnvVar(getter)] = 'yes';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg[getter]).toBe(false);
            });
        });
    });

    describe('debug', () => {
        it('returns a boolean', () => {
            expect(typeof Config.debug).toBe('boolean');
        });

        it('returns true when DEBUG=true', () => {
            process.env.DEBUG = 'true';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.debug).toBe(true);
            });
        });

        it('returns false when DEBUG is not set', () => {
            expect(Config.debug).toBe(false);
        });
    });

    describe('onError', () => {
        it('returns abort by default', () => {
            expect(Config.onError).toBe('abort');
        });

        it('returns env value when set', () => {
            process.env.ON_ERROR = 'continue';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.onError).toBe('continue');
            });
        });
    });

    describe('jiraProject', () => {
        it('returns ECSPOL by default', () => {
            expect(Config.jiraProject).toBe('ECSPOL');
        });

        it('returns env value when set', () => {
            process.env.JIRA_PROJECT = 'PROJX';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.jiraProject).toBe('PROJX');
            });
        });
    });

    describe('githubApiUrl', () => {
        it('returns https://api.github.com by default', () => {
            expect(Config.githubApiUrl).toBe('https://api.github.com');
        });

        it('returns env value when set', () => {
            process.env.GITHUB_API_URL = 'https://custom.github.com/api';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.githubApiUrl).toBe('https://custom.github.com/api');
            });
        });
    });

    describe('logMaxSize', () => {
        it('parses env value as number', () => {
            process.env.LOG_MAX_SIZE = '1048576';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logMaxSize).toBe(1048576);
            });
        });

        it('returns default 5MB when env not set', () => {
            expect(Config.logMaxSize).toBe(5 * 1024 * 1024);
        });

        it('returns default 5MB when env is not a valid number', () => {
            process.env.LOG_MAX_SIZE = 'not-a-number';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logMaxSize).toBe(5 * 1024 * 1024);
            });
        });

        it('returns default 5MB when env is empty string', () => {
            process.env.LOG_MAX_SIZE = '';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logMaxSize).toBe(5 * 1024 * 1024);
            });
        });

        it('returns parsed number when env is zero', () => {
            process.env.LOG_MAX_SIZE = '0';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logMaxSize).toBe(0);
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
                expect(Config[g]).toBe('');
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
                const cfg = require('./config');
                expect(cfg.jiraBaseUrl).toBe('https://jira.example.com');
                expect(cfg.jiraPersonalToken).toBe('token-123');
                expect(cfg.xrayBaseUrl).toBe('https://xray.example.com');
                expect(cfg.gitToken).toBe('git-token');
                expect(cfg.gitBaseUrl).toBe('https://git.example.com');
                expect(cfg.githubToken).toBe('gh-token');
                expect(cfg.autoChoice).toBe('yes');
            });
        });
    });

    describe('logLevel', () => {
        it('returns INFO by default', () => {
            expect(Config.logLevel).toBe('INFO');
        });

        it('returns env value when set', () => {
            process.env.LOG_LEVEL = 'DEBUG';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logLevel).toBe('DEBUG');
            });
        });
    });

    describe('logDir', () => {
        it('returns logs by default', () => {
            expect(Config.logDir).toBe('logs');
        });

        it('returns env value when set', () => {
            process.env.LOG_DIR = '/var/log';
            jest.isolateModules(() => {
                const cfg = require('./config');
                expect(cfg.logDir).toBe('/var/log');
            });
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
                const cfg = require('./config');
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
                const cfg = require('./config');
                const result = cfg.getAllPrefixed('QA_TEST_');
                expect(result).toEqual({ QA_TEST_FULL: 'full' });
            });
        });

        it('returns empty object when no match', () => {
            jest.isolateModules(() => {
                const cfg = require('./config');
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
            expect(Config.jiraBaseUrl).toBe('');
            expect(Config.debug).toBe(false);
        });
    });
});
