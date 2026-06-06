vi.mock('../../shared/prompt');

vi.mock('../../shared/jira-helper', async () => ({
    safeJiraCall: vi.fn(),
}));

import case03 from './case03.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockJiraResource = {
    getProjectId: vi.fn().mockResolvedValue('123'),
    createVersion: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case03 — create version', () => {
    it('exports a handler function', async () => {
        expect(case03).toBeDefined();
        expect(typeof case03.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case03.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
