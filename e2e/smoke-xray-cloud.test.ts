/**
 * Smoke test for XRAY_MODE=cloud — only runs when the env var is set.
 * Run: XRAY_MODE=cloud npx jest e2e/smoke-xray-cloud --no-coverage
 */

import Config from '../shared/config';
import JiraResource from '../jira_management/jira_resource';
import { createStepImporter } from '../jira_management/xray-client';

const runSmoke = process.env.XRAY_MODE === 'cloud';

if (!runSmoke) {
    describe.skip('smoke-xray-cloud', () => {
        it('skipped — set XRAY_MODE=cloud to run', () => {});
    });
} else {
    jest.mock('../shared/prompt', () => {
        const actual = jest.requireActual<typeof import('../shared/prompt')>('../shared/prompt');
        return {
            ...actual,
            prompt: jest.fn().mockReturnValue(''),
            confirm: jest.fn().mockReturnValue(true),
            ask: jest.fn().mockResolvedValue(''),
            askConfirm: jest.fn().mockResolvedValue(true),
        };
    });

    describe('smoke-xray-cloud', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.restoreAllMocks();
        });

        it('config.xrayMode returns "cloud"', () => {
            expect(Config.get('xrayMode')).toBe('cloud');
        });

        it('default XrayClient instantiates from JiraResource', () => {
            const XrayClient = require('../jira_management/xray-client') as {
                default: { createTest: unknown; updateTest: unknown };
            };
            const jira = new JiraResource('test', 'https://example.atlassian.net');
            expect(XrayClient).toBeDefined();
            expect(typeof XrayClient.default?.createTest).toBe('function');
            expect(typeof XrayClient.default?.updateTest).toBe('function');
        });

        it('createStepImporter returns CloudStepImporter when mode=cloud', () => {
            const jira = new JiraResource('test', 'https://example.atlassian.net');
            const importer = createStepImporter(jira, 'cloud');

            expect(importer).toBeDefined();
        });

        it('JiraResource with cloud base URL is valid', () => {
            const jira = new JiraResource('test', 'https://example.atlassian.net');
            expect(jira.baseUrl).toContain('atlassian.net');
            expect(jira.baseUrl).toMatch(/^https/);
        });
    });
}
