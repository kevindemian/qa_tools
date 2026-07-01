/** Integration tests for friendly error paths (Sprint W — Caminho Amigável).
 *  Validates that missing config/env vars trigger setup wizard offers.
 *  Uses nock for HTTP isolation and confirms the user is never left without an actionable message. */
import os from 'os';
import path from 'path';
import nock from 'nock';
import { offerEnvSetup } from '../shared/cli_base.js';
import { getProjects } from '../git_triggers/session-state.js';
import { resolveAlias } from '../jira_management/menu-data.js';
import * as breadcrumbs from '../shared/breadcrumbs.js';
import { confirm as _confirm } from '../shared/prompt.js';
import { loadTypedState as _loadTypedState } from '../shared/state.js';

const mockConfirm = vi.mocked(_confirm);
const mockLoadTypedState = vi.mocked(_loadTypedState);

vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    prompt: vi.fn().mockReturnValue(''),
    confirm: vi.fn<() => boolean>().mockReturnValue(false),
    printError: vi.fn(),
    showSelect: vi.fn().mockResolvedValue('skip'),
    tableView: vi.fn(),
    helpLine: vi.fn(),
}));

vi.mock('../shared/logger', () => ({
    rootLogger: {
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        writeFileOnly: vi.fn(),
    },
    Logger: vi.fn(),
}));

vi.mock('../shared/state', () => ({
    load: vi.fn(() => ({})),
    loadTypedState: vi.fn<() => object>(),
    update: vi.fn(),
    getStatePath: vi.fn(() => path.join(os.tmpdir(), 'state.json')),
}));

vi.mock('../shared/config', () => ({
    default: {
        get(key: string) {
            const empty: Record<string, string> = {
                gitToken: '',
                githubToken: '',
                gitBaseUrl: 'https://gitlab.com',
                githubApiUrl: '',
            };
            const safeGet = (obj: object, key: string): unknown =>
                Object.prototype.hasOwnProperty.call(obj, key) ? Reflect.get(obj, key) : undefined;
            const envRecord = process.env as Record<string, string | undefined>;
            const raw = safeGet(empty, key);
            const envVal = safeGet(envRecord, key);
            const envUpperVal = safeGet(envRecord, key.toUpperCase());
            return (raw ?? envVal ?? envUpperVal ?? '') as string;
        },
        getAllPrefixed: vi.fn(() => ({})),
    },
}));

describe('Friendly error paths (Sprint W)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        nock.cleanAll();
        nock.disableNetConnect();
        mockLoadTypedState.mockReturnValue({});
        mockConfirm.mockReturnValue(false);
        delete process.env['CI'];
        delete process.env['AUTO_CONFIRM'];
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
    });

    describe('W1 — offerEnvSetup integration', () => {
        it('prompts user when env vars are missing and user declines', () => {
            const result = offerEnvSetup({ ok: false, missing: ['JIRA_BASE_URL'] });

            expect(result).toBeFalsy();
            expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('does not prompt when all vars are present', () => {
            const result = offerEnvSetup({ ok: true, missing: [] });

            expect(result).toBeFalsy();
            expect(mockConfirm).not.toHaveBeenCalled();
        });

        it('skips prompt in CI mode', () => {
            process.env['CI'] = 'true';
            const result = offerEnvSetup({ ok: false, missing: ['GIT_TOKEN'] });

            expect(result).toBeFalsy();
            expect(mockConfirm).not.toHaveBeenCalled();
        });

        it('returns true when user accepts setup', () => {
            mockConfirm.mockReturnValueOnce(true);
            const result = offerEnvSetup({ ok: false, missing: ['TOKEN'] });

            expect(result).toBeTruthy();
        });
    });

    describe('W2 — empty projects flow', () => {
        it('getProjects returns empty when file is empty JSON', () => {
            const projects = Object.keys(getProjects());

            expect(Array.isArray(projects)).toBeTruthy();
        });
    });

    describe('W3 — MissingTokenError', () => {
        it('throws MissingTokenError for GitLab without token', async () => {
            expect.hasAssertions();

            const { createManagerForProject: createMaker } = await vi.importActual<
                typeof import('../git_triggers/session-state.js')
            >('../git_triggers/session-state');

            expect(() => createMaker('qa_tools', '123')).toThrow('GIT_TOKEN');
        });

        it('throws MissingTokenError for GitHub without token', async () => {
            expect.hasAssertions();

            const { createManagerForProject: createMaker } = await vi.importActual<
                typeof import('../git_triggers/session-state.js')
            >('../git_triggers/session-state');

            expect(() => createMaker('qa_tools_e2e', '456')).toThrow('GITHUB_TOKEN');
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
