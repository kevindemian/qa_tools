jest.mock('../../shared/prompt');

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import case09 from './case09';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case09 — switch project', () => {
    it('exports a handler function', () => {
        expect(case09).toBeDefined();
        expect(typeof case09.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case09.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
