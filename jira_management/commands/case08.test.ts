vi.mock('../../shared/prompt');

import case08 from './case08.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockJiraResource = {
    releaseVersion: vi.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Case08 — release version', () => {
    it('exports a handler function', () => {
        expect(case08).toBeDefined();
        expect(typeof case08.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {expect.hasAssertions();

        const result = await case08.handler(mockContext);

        expect([undefined, true, false]).toContain(result);
    });
});
