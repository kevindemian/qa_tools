import { createStepImporter } from './xray-client';
import type JiraResource from './jira_resource';
import type { TestStep } from '../shared/types';
import Config from '../shared/config';

const mockGraphqlMutation = jest.fn();

jest.mock('../shared/xray-cloud-client', () => ({
    XrayCloudClient: jest.fn(() => ({
        graphqlMutation: mockGraphqlMutation,
    })),
}));

jest.mock('../shared/config');

describe('ServerStepImporter', () => {
    it('calls postJiraResource with correct endpoint and payload', async () => {
        const mockJira = { postJiraResource: jest.fn() };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' } };

        await importer.importStep('TEST-1', 1, step);

        expect(mockJira.postJiraResource).toHaveBeenCalledWith('test/TEST-1/steps', {
            index: 1,
            fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' },
        });
    });

    it('supports step with raw fields without nesting', async () => {
        const mockJira = { postJiraResource: jest.fn() };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step = { Action: 'Verify', Data: 'Response', Result: '200' } as unknown as TestStep;

        await importer.importStep('TEST-2', 2, step);

        expect(mockJira.postJiraResource).toHaveBeenCalledWith('test/TEST-2/steps', {
            index: 2,
            Action: 'Verify',
            Data: 'Response',
            Result: '200',
        });
    });

    it('propagates post error', async () => {
        const mockJira = { postJiraResource: jest.fn().mockRejectedValue(new Error('Network error')) };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-3', 1, step)).rejects.toThrow('Network error');
    });
});

describe('CloudStepImporter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayClientId: 'test-client-id',
            xrayClientSecret: 'test-client-secret',
        });
    });

    it('happy path — sends GraphQL mutation via XrayCloudClient', async () => {
        mockGraphqlMutation.mockResolvedValue(undefined);

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' } };

        await importer.importStep('TEST-1', 0, step);

        expect(mockGraphqlMutation).toHaveBeenCalledTimes(1);
        const callArgs = mockGraphqlMutation.mock.calls[0] as [string, Record<string, unknown>, string, string];
        expect(callArgs[0]).toContain('addTestStep');
        expect(callArgs[1]).toMatchObject({ issueId: 'TEST-1', index: 0 });
        expect(callArgs[2]).toBe('test-client-id');
        expect(callArgs[3]).toBe('test-client-secret');
    });

    it('throws on missing credentials', async () => {
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayClientId: '',
            xrayClientSecret: '',
        });

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(
            'XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set',
        );
    });

    it('propagates GraphQL mutation error', async () => {
        mockGraphqlMutation.mockRejectedValue(new Error('Xray Cloud GraphQL mutation failed: field not found'));

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(/Xray Cloud GraphQL/);
    });
});
