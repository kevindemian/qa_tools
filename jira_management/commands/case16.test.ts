jest.mock('../../shared/prompt');

jest.mock('../../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import case16 from './case16';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case16 — config JSON directory', () => {
    it('exports a handler function', () => {
        expect(case16).toBeDefined();
        expect(typeof case16.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case16.handler(mockContext as never);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
