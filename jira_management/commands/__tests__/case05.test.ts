vi.mock('../../../shared/ui/prompt.js');

import case05 from '../case05.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    getReleaseTasks: vi.fn().mockResolvedValue([]),
};

const mockContext = makeMockCommandContext({
    jiraResource: mockJiraResource,
    ctx: { packageManager: { updateReleaseNotes: vi.fn(), updateVersion: vi.fn() } },
});

describe('Case05', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case05 — update package version', () => {
        it('exports a handler function', () => {
            expect(case05).toBeDefined();
            expect(typeof case05.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case05.handler(mockContext);

            expect([undefined, true, false]).toContain(result);
        });
    });
});
