vi.mock('../../../shared/ui/prompt.js');

vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

import case16 from '../case16.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';

const mockContext = makeMockCommandContext();

describe('Case16', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case16 — config JSON directory', () => {
        it('exports a handler function', () => {
            expect(case16).toBeDefined();
            expect(typeof case16.handler).toBe('function');
        });

        it('executes without error with basic context', async () => {
            expect.hasAssertions();

            const result = await case16.handler(mockContext);

            expect(result === undefined || typeof result === 'boolean').toBeTruthy();
        });
    });
});
