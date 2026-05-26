import { createStepImporter } from './xray-client';
import type JiraResource from './jira_resource';
import type { TestStep } from '../shared/types';

describe('createStepImporter', () => {
    it('server mode — calls postJiraResource with correct endpoint and payload', async () => {
        const mockJira = { postJiraResource: jest.fn() };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step: TestStep = { fields: { Action: 'Click', Data: 'Button', ExpectedResult: 'Done' } };

        await importer.importStep('TEST-1', 1, step);

        expect(mockJira.postJiraResource).toHaveBeenCalledWith('test/TEST-1/steps', {
            index: 1,
            fields: { Action: 'Click', Data: 'Button', ExpectedResult: 'Done' },
        });
    });

    it('server mode — supports step with raw fields without nesting', async () => {
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

    it('server mode — propagates post error', async () => {
        const mockJira = { postJiraResource: jest.fn().mockRejectedValue(new Error('Network error')) };
        const importer = createStepImporter(mockJira as unknown as JiraResource, 'server');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-3', 1, step)).rejects.toThrow('Network error');
    });

    it('cloud mode — throws not-implemented error', async () => {
        const mockJira = {} as JiraResource;
        const importer = createStepImporter(mockJira, 'cloud');
        const step: TestStep = { fields: { Action: 'Click' } };

        await expect(importer.importStep('TEST-1', 1, step)).rejects.toThrow('Xray Cloud: importStep not implemented');
    });
});
