jest.mock('../../shared/prompt');

jest.mock('fs', () => ({
    copyFileSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
}));

import case11 from './case11';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case11 — generate template', () => {
    it('exports a handler function', () => {
        expect(case11).toBeDefined();
        expect(typeof case11.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case11.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
