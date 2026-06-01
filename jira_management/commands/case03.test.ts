jest.mock('../../shared/prompt');

jest.mock('../../shared/jira-helper', () => ({
    safeJiraCall: jest.fn(),
}));

import case03 from './case03';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    getProjectId: jest.fn().mockResolvedValue('123'),
    createVersion: jest.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case03 — create version', () => {
    it('exports a handler function', () => {
        expect(case03).toBeDefined();
        expect(typeof case03.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case03.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
