vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/jira/jira-helper.js', () => ({
    safeJiraCall: vi.fn(),
}));

import case03 from '../case03.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    getProjectId: vi.fn().mockResolvedValue('123'),
    createVersion: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case03', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case03 — create version', () => {
        it('exports a handler function', () => {
            expect(case03).toBeDefined();
            expect(typeof case03.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case03.handler(mockContext);

            expect([undefined, true, false]).toContain(result);
        });
    });
});
