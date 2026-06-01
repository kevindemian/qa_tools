jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

import case04 from './case04';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    updateFixVersions: jest.fn().mockResolvedValue({}),
    postJiraResource: jest.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case04 — assign fixVersion', () => {
    it('exports a handler function', () => {
        expect(case04).toBeDefined();
        expect(typeof case04.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case04.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
