jest.mock('../../shared/prompt');

import case05 from './case05';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    getReleaseTasks: jest.fn().mockResolvedValue([]),
};

const mockContext = makeMockCommandContext({
    jiraResource: mockJiraResource,
    ctx: { packageManager: { updateReleaseNotes: jest.fn(), updateVersion: jest.fn() } },
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case05 — update package version', () => {
    it('exports a handler function', () => {
        expect(case05).toBeDefined();
        expect(typeof case05.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case05.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
