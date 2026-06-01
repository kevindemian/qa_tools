import { createHttpClient } from '../shared/http-client';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory';

jest.mock('../shared/http-client', () => ({ createHttpClient: jest.fn() }));

jest.mock('../shared/logger', () => ({
    Logger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
    })),
}));

jest.mock('../shared/prompt', () => ({
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    extractErrorMessage: jest.fn().mockReturnValue('mocked error'),
}));

import JiraResource from './jira_resource';
import { getTransitionsForIssue, addTasksToSprint, transitionIssue, WORKFLOW_MAP } from './jira-resource-sprint';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

function buildResource(): JiraResource {
    jest.mocked(createHttpClient).mockReturnValue(
        createMockAxiosInstance({ get: mockGet, post: mockPost, put: mockPut }),
    );
    return new JiraResource('test-token', 'http://test-jira.com');
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('WORKFLOW_MAP', () => {
    it('defines expected transitions', () => {
        expect(WORKFLOW_MAP.new).toContain('approve');
        expect(WORKFLOW_MAP['coding in progress']).toContain('coding done');
    });
});

describe('getTransitionsForIssue', () => {
    it('builds transition map from API response', async () => {
        mockGet.mockResolvedValue({
            data: {
                transitions: [
                    { id: '11', to: { name: 'Done' } },
                    { id: '21', to: { name: 'In Progress' } },
                ],
            },
        });
        const resource = buildResource();
        const map = await getTransitionsForIssue(resource, 'TEST-1');
        expect(map.done).toBe('11');
        expect(map['in progress']).toBe('21');
    });

    it('returns empty object on API error', async () => {
        mockGet.mockRejectedValue(new Error('API error'));
        const resource = buildResource();
        const map = await getTransitionsForIssue(resource, 'TEST-1');
        expect(map).toEqual({});
    });
});

describe('addTasksToSprint', () => {
    it('posts tasks to sprint and logs success', async () => {
        mockPost.mockResolvedValue({ data: {} });
        const resource = buildResource();
        await addTasksToSprint(resource, ['T-1', 'T-2'], 'sprint-1');
        expect(mockPost).toHaveBeenCalledWith('/sprint/sprint-1/issue', { issues: ['T-1', 'T-2'] });
    });

    it('throws on API error', async () => {
        mockPost.mockRejectedValue(new Error('Sprint error'));
        const resource = buildResource();
        await expect(addTasksToSprint(resource, ['T-1'], 'sprint-1')).rejects.toThrow('Sprint error');
    });
});

describe('transitionIssue', () => {
    it('posts transition to issue', async () => {
        mockPost.mockResolvedValue({ data: {} });
        const resource = buildResource();
        await transitionIssue(resource, 'T-1', '21');
        expect(mockPost).toHaveBeenCalledWith('/issue/T-1/transitions', { transition: { id: '21' } });
    });

    it('throws on API error', async () => {
        mockPost.mockRejectedValue(new Error('Transition error'));
        const resource = buildResource();
        await expect(transitionIssue(resource, 'T-1', '21')).rejects.toThrow('Transition error');
    });
});
