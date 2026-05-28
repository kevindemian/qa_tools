import { createStepImporter } from './xray-client';
import type JiraResource from './jira_resource';
import type { TestStep } from '../shared/types';
import Config from '../shared/config';

jest.mock('axios');
jest.mock('../shared/config');

const mockAxiosPost = jest.fn();

beforeEach(() => {
    const axios = jest.requireMock('axios');
    axios.post = mockAxiosPost;
});

describe('ServerStepImporter', () => {
    it('calls postJiraResource with correct endpoint and payload', async () => {
        const mockJira = { postJiraResource: jest.fn() };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', ExpectedResult: 'Done' } };

        await importer.importStep('TEST-1', 1, step);

        expect(mockJira.postJiraResource).toHaveBeenCalledWith('test/TEST-1/steps', {
            index: 1,
            fields: { Action: 'Click', Data: 'Button', ExpectedResult: 'Done' },
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
    const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.token';

    beforeEach(() => {
        jest.clearAllMocks();
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayClientId: 'test-client-id',
            xrayClientSecret: 'test-client-secret',
        });
    });

    it('happy path — authenticates and sends GraphQL mutation', async () => {
        mockAxiosPost
            .mockResolvedValueOnce({ data: '"' + token + '"' })
            .mockResolvedValueOnce({ data: { data: { addTestStep: { id: '123' } } } });

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', ExpectedResult: 'Done' } };

        await importer.importStep('TEST-1', 0, step);

        // First call: authentication
        expect(mockAxiosPost).toHaveBeenNthCalledWith(1, 'https://xray.cloud.getxray.app/api/v2/authenticate', {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
        });
        // Second call: GraphQL
        expect(mockAxiosPost).toHaveBeenNthCalledWith(
            2,
            'https://xray.cloud.getxray.app/api/v2/graphql',
            expect.objectContaining({
                query: expect.stringContaining('addTestStep'),
                variables: expect.objectContaining({ issueId: 'TEST-1', index: 0 }),
            }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ' + token }) }),
        );
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

    it('throws on authentication failure', async () => {
        mockAxiosPost.mockRejectedValue(new Error('401 Unauthorized'));

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(/Xray Cloud authentication/);
    });

    it('throws on GraphQL error', async () => {
        mockAxiosPost
            .mockResolvedValueOnce({ data: '"' + token + '"' })
            .mockRejectedValue(new Error('GraphQL error: field not found'));

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 0, step)).rejects.toThrow(/Xray Cloud GraphQL/);
    });

    it('reuses cached token on subsequent calls', async () => {
        mockAxiosPost
            .mockResolvedValueOnce({ data: '"' + token + '"' })
            .mockResolvedValue({ data: { data: { addTestStep: { id: '123' } } } });

        const importer = createStepImporter({} as JiraResource, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await importer.importStep('TEST-1', 0, step);
        await importer.importStep('TEST-2', 1, step);

        // auth called only once
        expect(mockAxiosPost).toHaveBeenCalledTimes(3); // auth + call 1 + call 2
        expect(mockAxiosPost).toHaveBeenNthCalledWith(
            1,
            'https://xray.cloud.getxray.app/api/v2/authenticate',
            expect.any(Object),
        );
    });
});
