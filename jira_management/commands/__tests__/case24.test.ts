/** Tests for case24 handler — launches first-run wizard on demand. */
vi.mock('../../../shared/first-run', () => ({
    maybeRunFirstRunWizard: vi.fn(),
}));
vi.mock('../../../shared/prompt', () => ({
    info: vi.fn(),
    printError: vi.fn(),
}));

import { maybeRunFirstRunWizard } from '../../../shared/first-run.js';
import { info, printError } from '../../../shared/prompt.js';
import { createMockContext } from '../../../shared/test-utils/factories/context-factory.js';
import handlerModule from '../case24.js';

const mockHandler = handlerModule.handler;

describe('Case24 handler', () => {
    const mockContext = createMockContext();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls maybeRunFirstRunWizard and pushes history on success', async () => {
        expect.hasAssertions();

        vi.mocked(maybeRunFirstRunWizard).mockResolvedValue(undefined);

        const result = await mockHandler(mockContext);

        expect(maybeRunFirstRunWizard).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith(expect.stringContaining('assistente'));
        expect(mockContext.pushHistory).toHaveBeenCalledWith('setup-wizard', expect.any(String), 'ok');
        expect(result).toBeUndefined();
    });

    it('returns false and prints error on first-run wizard failure', async () => {
        expect.hasAssertions();

        vi.mocked(maybeRunFirstRunWizard).mockRejectedValue(new Error('network error'));

        const result = await mockHandler(mockContext);

        expect(printError).toHaveBeenCalledWith(expect.stringContaining('wizard'), expect.any(Error));
        expect(result).toBeFalsy();
        expect(mockContext.pushHistory).not.toHaveBeenCalled();
    });
});
