vi.mock('../../shared/prompt');

vi.mock('fs', () => ({
    copyFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
}));

import case11 from './case11.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case11', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case11 — generate template', () => {
        it('exports a handler function', () => {
            expect(case11).toBeDefined();
            expect(typeof case11.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case11.handler(mockContext);

            expect(result === undefined || typeof result === 'boolean').toBeTruthy();
        });
    });
});
