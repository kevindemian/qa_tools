import { createStepImporter } from '../xray-client.js';
import type { TestStep } from '../../shared/types.js';
import Config from '../../shared/config-accessor.js';
import { createMockConfigInstance } from '../../shared/test-utils/factories/index.js';
import { createMockJiraResource } from '../../shared/test-utils/factories/jira-resource-factory.js';

const mockGraphqlMutation = vi.fn();

vi.mock('../../shared/jira/xray-cloud-client.js', () => ({
    XrayCloudClient: vi.fn(function () {
        return {
            graphqlMutation: mockGraphqlMutation,
        };
    }),
}));

vi.mock('../../shared/config-accessor.js');

describe('ServerStepImporter', () => {
    it('calls postJiraResource with correct endpoint and payload', async () => {
        expect.hasAssertions();

        const mockJira = createMockJiraResource();
        const postSpy = vi.spyOn(mockJira, 'postJiraResource');
        const importer = createStepImporter(mockJira, 'server');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' } };

        await importer.importStep('TEST-1', 1, step);

        expect(postSpy).toHaveBeenCalledWith('test/TEST-1/steps', {
            index: 1,
            fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' },
        });
    });

    it('sends step data in the POST payload', async () => {
        expect.hasAssertions();

        const mockJira = createMockJiraResource();
        const postSpy = vi.spyOn(mockJira, 'postJiraResource');
        const importer = createStepImporter(mockJira, 'server');
        const step: TestStep = { fields: { Action: 'Verify', Data: 'Response', 'Expected Result': '200' } };

        await importer.importStep('TEST-2', 2, step);

        expect(postSpy).toHaveBeenCalledWith('test/TEST-2/steps', {
            index: 2,
            fields: { Action: 'Verify', Data: 'Response', 'Expected Result': '200' },
        });
    });

    it('propagates post error', async () => {
        expect.hasAssertions();

        const mockJira = createMockJiraResource();
        mockJira.postJiraResource.mockRejectedValue(new Error('Network error'));
        const importer = createStepImporter(mockJira, 'server');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-3', 1, step)).rejects.toThrow('Network error');
    });
});

describe('CloudStepImporter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const mockConfig = createMockConfigInstance();
        mockConfig.get = function <T = string>(key: string): T {
            const map: Record<string, string> = {
                xrayClientId: 'test-client-id',
                xrayClientSecret: 'test-client-secret',
            };
            return ((Reflect.get(map, key) as string | undefined) ?? '') as T;
        };
        vi.spyOn(Config, 'getDefault').mockReturnValue(mockConfig);
    });

    it('happy path — sends GraphQL mutation via XrayCloudClient', async () => {
        expect.hasAssertions();

        mockGraphqlMutation.mockResolvedValue(undefined);

        const mockJira = createMockJiraResource();
        mockJira.getJiraResource.mockResolvedValue({ id: '12345' });

        const importer = createStepImporter(mockJira, 'cloud');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', 'Expected Result': 'Done' } };

        await importer.importStep('TEST-1', 0, step);

        expect(mockGraphqlMutation).toHaveBeenCalledTimes(1);

        const callArgs = mockGraphqlMutation.mock.calls[0] as [string, Record<string, unknown>, string, string];

        expect(callArgs[0]).toContain('addTestStep');
        expect(callArgs[1]).toMatchObject({
            issueId: '12345',
            step: { action: 'Click', result: 'Done', data: 'Button' },
        });
        expect(callArgs[2]).toBe('test-client-id');
        expect(callArgs[3]).toBe('test-client-secret');
    });

    it('throws on missing credentials', async () => {
        expect.hasAssertions();

        const mockConfig = createMockConfigInstance();
        mockConfig.get = function <T = string>(key: string): T {
            const map: Record<string, string> = { xrayClientId: '', xrayClientSecret: '' };
            return ((Reflect.get(map, key) as string | undefined) ?? '') as T;
        };
        vi.spyOn(Config, 'getDefault').mockReturnValue(mockConfig);

        const importer = createStepImporter(createMockJiraResource(), 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(
            'XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set',
        );
    });

    it('propagates GraphQL mutation error', async () => {
        expect.hasAssertions();

        mockGraphqlMutation.mockRejectedValue(new Error('Xray Cloud GraphQL mutation failed: field not found'));

        const mockJira = createMockJiraResource();
        mockJira.getJiraResource.mockResolvedValue({ id: '12345' });

        const importer = createStepImporter(mockJira, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(/Xray Cloud GraphQL/);
    });
});
