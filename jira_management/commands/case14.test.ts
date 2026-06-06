vi.mock('../../shared/prompt');

vi.mock('../../shared/state', async () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case14 from './case14.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('case14 — config Cypress directory', () => {
    it('exports a handler function', async () => {
        expect(case14).toBeDefined();
        expect(typeof case14.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case14.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });
});
