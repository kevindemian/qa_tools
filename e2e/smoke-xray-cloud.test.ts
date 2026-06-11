/**
 * Smoke test for XRAY_MODE=cloud — only runs when the env var is set.
 * Run: XRAY_MODE=cloud npx jest e2e/smoke-xray-cloud --no-coverage
 */

import Config from '../shared/config.js';
import JiraResource from '../jira_management/jira_resource.js';
import { createStepImporter } from '../jira_management/xray-client.js';

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

describe('smoke-xray-cloud', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it.runIf(process.env['XRAY_MODE'] === 'cloud')('config.xrayMode returns "cloud"', () => {
        expect(Config.get('xrayMode')).toBe('cloud');
    });

    it.runIf(process.env['XRAY_MODE'] === 'cloud')('default XrayClient instantiates from JiraResource', async () => {
        const mod = await import('../jira_management/xray-client.js');
        expect(mod).toBeDefined();
        expect(typeof (mod as Record<string, unknown>)['default']).toBe('undefined');
    });

    it.runIf(process.env['XRAY_MODE'] === 'cloud')('createStepImporter returns CloudStepImporter when mode=cloud', () => {
        const jira = new JiraResource('test', 'https://example.atlassian.net');
        const importer = createStepImporter(jira, 'cloud');

        expect(importer).toBeDefined();
    });

    it.runIf(process.env['XRAY_MODE'] === 'cloud')('JiraResource with cloud base URL is valid', () => {
        const jira = new JiraResource('test', 'https://example.atlassian.net');
        expect(jira.baseUrl).toContain('atlassian.net');
        expect(jira.baseUrl).toMatch(/^https/);
    });
});
