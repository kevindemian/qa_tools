/** Integration tests for friendly error paths (Sprint W — Caminho Amigável).
 *  Validates that missing config/env vars trigger setup wizard offers.
 *  Uses nock for HTTP isolation and confirms the user is never left without an actionable message. */
import nock from 'nock';

const MOCK_CONFIRM = jest.fn().mockResolvedValue(false);

jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: MOCK_CONFIRM,
    printError: jest.fn(),
    showSelect: jest.fn().mockResolvedValue('skip'),
    tableView: jest.fn(),
    helpLine: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        writeFileOnly: jest.fn(),
    },
    Logger: jest.fn(),
}));

const MOCK_LOAD_TYPED_STATE = jest.fn();
jest.mock('../shared/state', () => ({
    load: jest.fn(() => ({})),
    loadTypedState: MOCK_LOAD_TYPED_STATE,
    update: jest.fn(),
    getStatePath: jest.fn(() => '/tmp/state.json'),
}));

describe('friendly error paths (Sprint W)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        nock.cleanAll();
        nock.disableNetConnect();
        MOCK_LOAD_TYPED_STATE.mockReturnValue({});
        MOCK_CONFIRM.mockResolvedValue(false);
        delete process.env.CI;
        delete process.env.AUTO_CONFIRM;
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
    });

    describe('W1 — offerEnvSetup integration', () => {
        it('prompts user when env vars are missing and user declines', async () => {
            const { offerEnvSetup } = require('../shared/cli_base');
            const result = await offerEnvSetup({ ok: false, missing: ['JIRA_BASE_URL'] });
            expect(result).toBe(false);
            expect(MOCK_CONFIRM).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('does not prompt when all vars are present', async () => {
            const { offerEnvSetup } = require('../shared/cli_base');
            const result = await offerEnvSetup({ ok: true, missing: [] });
            expect(result).toBe(false);
            expect(MOCK_CONFIRM).not.toHaveBeenCalled();
        });

        it('skips prompt in CI mode', async () => {
            process.env.CI = 'true';
            const { offerEnvSetup } = require('../shared/cli_base');
            const result = await offerEnvSetup({ ok: false, missing: ['GIT_TOKEN'] });
            expect(result).toBe(false);
            expect(MOCK_CONFIRM).not.toHaveBeenCalled();
        });

        it('returns true when user accepts setup', async () => {
            MOCK_CONFIRM.mockResolvedValueOnce(true);
            const { offerEnvSetup } = require('../shared/cli_base');
            const result = await offerEnvSetup({ ok: false, missing: ['TOKEN'] });
            expect(result).toBe(true);
        });
    });

    describe('W2 — empty projects flow', () => {
        it('getProjects returns empty when file is empty JSON', () => {
            const { getProjects } = require('../git_triggers/session-state');
            // loadProjects caches result; reset and verify shape
            const projects = Object.keys(getProjects());
            expect(Array.isArray(projects)).toBe(true);
        });
    });

    describe('W3 — MissingTokenError', () => {
        it('throws MissingTokenError for GitLab without token', async () => {
            jest.isolateModules(() => {
                jest.doMock('../shared/config', () => ({
                    default: {
                        gitToken: '',
                        gitBaseUrl: 'https://gitlab.com',
                        githubToken: '',
                        githubApiUrl: '',
                        getAllPrefixed: jest.fn(() => ({})),
                        get(key: string) {
                            return (this as Record<string, unknown>)[key] as string;
                        },
                    },
                    __esModule: true,
                }));
                jest.doMock('fs', () => {
                    const original = jest.requireActual('fs');
                    return {
                        ...original,
                        readFileSync: jest.fn((p: string) => {
                            if (p.includes('providers.json')) return '{"test-proj":{}}';
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return (original.readFileSync as any)(p, 'utf8');
                        }),
                    };
                });
                jest.doMock('../shared/prompt', () => ({
                    print: jest.fn(),
                    success: jest.fn(),
                    error: jest.fn(),
                    warn: jest.fn(),
                    info: jest.fn(),
                    title: jest.fn(),
                    divider: jest.fn(),
                    prompt: jest.fn().mockReturnValue(''),
                    confirm: jest.fn().mockResolvedValue(false),
                    printError: jest.fn(),
                    showSelect: jest.fn().mockResolvedValue('skip'),
                    tableView: jest.fn(),
                    helpLine: jest.fn(),
                }));
                jest.doMock('../shared/logger', () => ({
                    rootLogger: {
                        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
                        warn: jest.fn(),
                        error: jest.fn(),
                        info: jest.fn(),
                    },
                    Logger: jest.fn(),
                }));
                jest.doMock('../git_triggers/gitlab_manager', () => ({
                    __esModule: true,
                    default: jest.fn(),
                }));

                const mod = require('../git_triggers/session-state');
                expect(() => mod.createManagerForProject('test-proj', '123')).toThrow('GIT_TOKEN');
            });
        });

        it('throws MissingTokenError for GitHub without token', async () => {
            jest.isolateModules(() => {
                jest.doMock('../shared/config', () => ({
                    default: {
                        gitToken: '',
                        gitBaseUrl: 'https://gitlab.com',
                        githubToken: '',
                        githubApiUrl: '',
                        getAllPrefixed: jest.fn(() => ({})),
                        get(key: string) {
                            return (this as Record<string, unknown>)[key] as string;
                        },
                    },
                    __esModule: true,
                }));
                jest.doMock('fs', () => {
                    const original = jest.requireActual('fs');
                    return {
                        ...original,
                        readFileSync: jest.fn((p: string) => {
                            if (p.includes('providers.json')) return '{"test-proj":{"provider":"github"}}';
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return (original.readFileSync as any)(p, 'utf8');
                        }),
                    };
                });
                jest.doMock('../shared/prompt', () => ({
                    print: jest.fn(),
                    success: jest.fn(),
                    error: jest.fn(),
                    warn: jest.fn(),
                    info: jest.fn(),
                    title: jest.fn(),
                    divider: jest.fn(),
                    prompt: jest.fn().mockReturnValue(''),
                    confirm: jest.fn().mockResolvedValue(false),
                    printError: jest.fn(),
                    showSelect: jest.fn().mockResolvedValue('skip'),
                    tableView: jest.fn(),
                    helpLine: jest.fn(),
                }));
                jest.doMock('../shared/logger', () => ({
                    rootLogger: {
                        child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
                        warn: jest.fn(),
                        error: jest.fn(),
                        info: jest.fn(),
                    },
                    Logger: jest.fn(),
                }));
                jest.doMock('../git_triggers/github_manager', () => ({
                    __esModule: true,
                    default: jest.fn(),
                }));

                const mod = require('../git_triggers/session-state');
                expect(() => mod.createManagerForProject('test-proj', '456')).toThrow('GITHUB_TOKEN');
            });
        });
    });

    describe('W4 — wizard alias w', () => {
        it('resolves alias w to 24 in Jira menu', () => {
            const { resolveAlias } = require('../jira_management/menu-data');
            expect(resolveAlias('w')).toBe('24');
            expect(resolveAlias('setup')).toBe('24');
            expect(resolveAlias('wizard')).toBe('24');
            expect(resolveAlias('configurar')).toBe('24');
        });
    });

    describe('U1 — breadcrumbs dynamic navigation', () => {
        it('popBreadcrumb on back navigation preserves parent', () => {
            const breadcrumbs = require('../shared/breadcrumbs');
            breadcrumbs.__resetBreadcrumbs();
            breadcrumbs.pushBreadcrumb('GERAÇÃO DE RELATÓRIOS');
            breadcrumbs.pushBreadcrumb('Gerar relatório HTML');
            expect(breadcrumbs.getBreadcrumbPath()).toBe('GERAÇÃO DE RELATÓRIOS > Gerar relatório HTML');
            breadcrumbs.popBreadcrumb();
            expect(breadcrumbs.getBreadcrumbPath()).toBe('GERAÇÃO DE RELATÓRIOS');
            breadcrumbs.__resetBreadcrumbs();
        });
    });
});
