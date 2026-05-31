jest.mock('../../shared/prompt');

jest.mock('../../shared/jira-helper', () => ({
    safeJiraCall: jest.fn(),
}));

import case06 from './case06';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    checkReleaseTasksStatus: jest.fn().mockResolvedValue(undefined),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case06 — check release status', () => {
    it('exports a handler function', () => {
        expect(case06).toBeDefined();
        expect(typeof case06.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case06.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
