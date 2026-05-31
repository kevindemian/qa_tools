jest.mock('../../shared/prompt');

import case08 from './case08';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    releaseVersion: jest.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case08 — release version', () => {
    it('exports a handler function', () => {
        expect(case08).toBeDefined();
        expect(typeof case08.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case08.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
