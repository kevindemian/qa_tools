jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

import case07 from './case07';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    getReleaseTasks: jest.fn().mockResolvedValue([]),
    moveCardsToDone: jest.fn().mockResolvedValue({}),
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case07 — close tasks', () => {
    it('exports a handler function', () => {
        expect(case07).toBeDefined();
        expect(typeof case07.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case07.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
