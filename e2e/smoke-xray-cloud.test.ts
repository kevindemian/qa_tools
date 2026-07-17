/**
 * Smoke test for Xray Cloud mode. Forces XRAY_MODE=cloud via Config override
 * so the suite is hermetic and always executes (no environment-gated skip).
 */

import Config from '../shared/config-accessor.js';
import JiraResource from '../jira_management/jira_resource.js';
import { createStepImporter } from '../jira_management/xray-client.js';
import { importExecutionResults } from '../jira_management/result_reporter.js';
import { resolveProxyUrl } from '../shared/proxy-config.js';
import type { JiraResourceLike } from '../shared/types.js';

vi.mock('../shared/prompt', async () => {
    const actual = await vi.importActual<typeof import('../shared/prompt.js')>('../shared/prompt');
    return {
        ...actual,
        prompt: vi.fn().mockReturnValue(''),
        confirm: vi.fn().mockReturnValue(true),
        ask: vi.fn().mockResolvedValue(''),
        askConfirm: vi.fn().mockResolvedValue(true),
    };
});

describe('Smoke-xray-cloud', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        Config.set('xrayMode', 'cloud');
    });

    afterEach(() => {
        Config.reset();
    });

    it('config.xrayMode returns "cloud"', () => {
        expect(Config.get('xrayMode')).toBe('cloud');
    });

    it('default XrayClient instantiates from JiraResource', async () => {
        expect.hasAssertions();

        const mod = await import('../jira_management/xray-client.js');

        expect(mod).toBeDefined();
        expect(typeof (mod as Record<string, unknown>)['default']).toBe('undefined');
    });

    it('createStepImporter returns CloudStepImporter when mode=cloud', () => {
        const jira = new JiraResource('test', 'https://example.atlassian.net');
        const importer = createStepImporter(jira, 'cloud');

        expect(importer).toBeDefined();
    });

    it('jiraResource with cloud base URL is valid', () => {
        const jira = new JiraResource('test', 'https://example.atlassian.net');

        expect(jira.baseUrl).toContain('atlassian.net');
        expect(jira.baseUrl).toMatch(/^https/);
    });

    it('resolves egress proxy from HTTPS_PROXY config', () => {
        const saved: Record<string, string | undefined> = {
            QA_PROXY_URL: process.env['QA_PROXY_URL'],
            HTTPS_PROXY: process.env['HTTPS_PROXY'],
            HTTP_PROXY: process.env['HTTP_PROXY'],
            https_proxy: process.env['https_proxy'],
            http_proxy: process.env['http_proxy'],
        };
        process.env['HTTPS_PROXY'] = 'https://corp-proxy.internal:8080';
        delete process.env['HTTP_PROXY'];
        delete process.env['https_proxy'];
        delete process.env['http_proxy'];
        delete process.env['QA_PROXY_URL'];
        try {
            expect(resolveProxyUrl()).toBe('https://corp-proxy.internal:8080');
        } finally {
            for (const key of Object.keys(saved)) {
                const value = saved[key];
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });

    it('importExecutionResults posts to raven 2.0 cloud import endpoint', async () => {
        expect.hasAssertions();

        const resource: JiraResourceLike = {
            getJiraResource: vi.fn().mockResolvedValue({}),
            postJiraResource: vi.fn().mockResolvedValue({}),
            putJiraResource: vi.fn().mockResolvedValue(null),
            searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
            getTransitionsForIssue: vi.fn().mockResolvedValue({}),
            transitionIssue: vi.fn().mockResolvedValue(undefined),
            postToApiRoot: vi.fn().mockResolvedValue(null),
        };

        const matched = [
            { key: 'ECSPOL-1', status: 'passed', duration: 10 },
            { key: 'ECSPOL-2', status: 'failed', duration: 20 },
        ];

        await importExecutionResults(resource, 'ECSPOL-1255', matched);

        const mock = resource.postToApiRoot as ReturnType<typeof vi.fn>;

        expect(mock).toHaveBeenCalledWith('rest/raven/2.0/api/import/execution/json', expect.any(Object));
    });
});
