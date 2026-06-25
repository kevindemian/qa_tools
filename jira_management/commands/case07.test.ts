vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

import case07 from './case07.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockJiraResource = {
    getReleaseTasks: vi.fn().mockResolvedValue([]),
    moveCardsToDone: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

describe('Case07', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case07 — close tasks', () => {
        it('exports a handler function', () => {
            expect(case07).toBeDefined();
            expect(typeof case07.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {expect.hasAssertions();

            const result = await case07.handler(mockContext);

            expect([undefined, true, false]).toContain(result);
        });
    });

});
