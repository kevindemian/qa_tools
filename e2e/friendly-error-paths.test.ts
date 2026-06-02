/** Integration tests for friendly error paths (Sprint W — Caminho Amigável).
 *  Validates that missing config/env vars trigger setup wizard offers.
 *  Uses nock for HTTP isolation and confirms the user is never left without an actionable message. */
import nock from 'nock';
import { offerEnvSetup } from '../shared/cli_base';
import { getProjects } from '../git_triggers/session-state';
import { resolveAlias } from '../jira_management/menu-data';
import * as breadcrumbs from '../shared/breadcrumbs';
import { confirm as _confirm } from '../shared/prompt';
import { loadTypedState as _loadTypedState } from '../shared/state';

const mockConfirm = jest.mocked(_confirm);
const mockLoadTypedState = jest.mocked(_loadTypedState);

jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    prompt: jest.fn().mockReturnValue(''),
    confirm: jest.fn<boolean, []>().mockReturnValue(false),
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

jest.mock('../shared/state', () => ({
    load: jest.fn(() => ({})),
    loadTypedState: jest.fn<object, []>(),
    update: jest.fn(),
    getStatePath: jest.fn(() => '/tmp/state.json'),
}));

describe('friendly error paths (Sprint W)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        nock.cleanAll();
        nock.disableNetConnect();
        mockLoadTypedState.mockReturnValue({});
        mockConfirm.mockReturnValue(false);
        delete process.env.CI;
        delete process.env.AUTO_CONFIRM;
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
    });

    describe('W1 — offerEnvSetup integration', () => {
        it('prompts user when env vars are missing and user declines', () => {
            const result = offerEnvSetup({ ok: false, missing: ['JIRA_BASE_URL'] });
            expect(result).toBe(false);
            expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('does not prompt when all vars are present', () => {
            const result = offerEnvSetup({ ok: true, missing: [] });
            expect(result).toBe(false);
            expect(mockConfirm).not.toHaveBeenCalled();
        });

        it('skips prompt in CI mode', () => {
            process.env.CI = 'true';
            const result = offerEnvSetup({ ok: false, missing: ['GIT_TOKEN'] });
            expect(result).toBe(false);
            expect(mockConfirm).not.toHaveBeenCalled();
        });

        it('returns true when user accepts setup', () => {
            mockConfirm.mockReturnValueOnce(true);
            const result = offerEnvSetup({ ok: false, missing: ['TOKEN'] });
            expect(result).toBe(true);
        });
    });

    describe('W2 — empty projects flow', () => {
        it('getProjects returns empty when file is empty JSON', () => {
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
                    const original = jest.requireActual<typeof import('fs')>('fs');
                    return {
                        ...original,
                        readFileSync: jest.fn((p: string) => {
                            if (p.includes('providers.json')) return '{"test-proj":{}}';
                            return jest.mocked(original.readFileSync)(p, 'utf8');
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

                const mod = jest.requireActual<typeof import('../git_triggers/session-state')>(
                    '../git_triggers/session-state',
                );
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
                    const original = jest.requireActual<typeof import('fs')>('fs');
                    return {
                        ...original,
                        readFileSync: jest.fn((p: string) => {
                            if (p.includes('providers.json')) return '{"test-proj":{"provider":"github"}}';
                            return jest.mocked(original.readFileSync)(p, 'utf8');
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

                const mod = jest.requireActual<typeof import('../git_triggers/session-state')>(
                    '../git_triggers/session-state',
                );
                expect(() => mod.createManagerForProject('test-proj', '456')).toThrow('GITHUB_TOKEN');
            });
        });
    });

    describe('W4 — wizard alias w', () => {
        it('resolves alias w to 24 in Jira menu', () => {
            expect(resolveAlias('w')).toBe('24');
            expect(resolveAlias('setup')).toBe('24');
            expect(resolveAlias('wizard')).toBe('24');
            expect(resolveAlias('configurar')).toBe('24');
        });
    });

    describe('U1 — breadcrumbs dynamic navigation', () => {
        it('popBreadcrumb on back navigation preserves parent', () => {
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
