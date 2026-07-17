vi.mock('../../../shared/prompt');

vi.mock('../../../shared/jira-helper', () => ({
    safeJiraCall: vi.fn(),
}));

import case06 from '../case06.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    checkReleaseTasksStatus: vi.fn().mockResolvedValue(undefined),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case06', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case06 — check release status', () => {
        it('exports a handler function', () => {
            expect(case06).toBeDefined();
            expect(typeof case06.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case06.handler(mockContext);

            expect([undefined, true, false]).toContain(result);
        });
    });
});
