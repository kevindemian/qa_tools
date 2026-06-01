jest.mock('../../shared/prompt');

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import case14 from './case14';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case14 — config Cypress directory', () => {
    it('exports a handler function', () => {
        expect(case14).toBeDefined();
        expect(typeof case14.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case14.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
