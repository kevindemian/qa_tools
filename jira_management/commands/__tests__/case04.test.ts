vi.mock('../../../shared/prompt');
vi.mock('../../../shared/logger');

import case04 from '../case04.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockJiraResource = {
    updateFixVersions: vi.fn().mockResolvedValue({}),
    postJiraResource: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case04', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case04 — assign fixVersion', () => {
        it('exports a handler function', () => {
            expect(case04).toBeDefined();
            expect(typeof case04.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case04.handler(mockContext);

            expect([undefined, true, false]).toContain(result);
        });
    });
});
