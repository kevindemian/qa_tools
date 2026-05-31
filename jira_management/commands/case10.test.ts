jest.mock('../../shared/prompt');

import case10 from './case10';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext({
    ctx: {
        createPackageManager: jest.fn().mockReturnValue({ updateReleaseNotes: jest.fn(), updateVersion: jest.fn() }),
    },
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case10 — set directory', () => {
    it('exports a handler function', () => {
        expect(case10).toBeDefined();
        expect(typeof case10.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case10.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
