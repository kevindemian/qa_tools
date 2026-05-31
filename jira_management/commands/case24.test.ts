/** Tests for case24 handler — launches first-run wizard on demand. */
jest.mock('../../shared/first-run', () => ({
    maybeRunFirstRunWizard: jest.fn(),
}));
jest.mock('../../shared/prompt', () => ({
    info: jest.fn(),
    printError: jest.fn(),
}));

import { maybeRunFirstRunWizard } from '../../shared/first-run';
import { info, printError } from '../../shared/prompt';
import handlerModule from './case24';

const mockHandler = handlerModule.handler as unknown as (c: Record<string, unknown>) => Promise<boolean | void>;

describe('case24 handler', () => {
    const mockPushHistory = jest.fn();
    const mockContext = { pushHistory: mockPushHistory };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calls maybeRunFirstRunWizard and pushes history on success', async () => {
        (maybeRunFirstRunWizard as jest.Mock).mockResolvedValue(undefined);

        const result = await mockHandler(mockContext);

        expect(maybeRunFirstRunWizard).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith(expect.stringContaining('assistente'));
        expect(mockPushHistory).toHaveBeenCalledWith('setup-wizard', expect.any(String), 'ok');
        expect(result).toBeUndefined();
    });

    it('returns false and prints error on first-run wizard failure', async () => {
        (maybeRunFirstRunWizard as jest.Mock).mockRejectedValue(new Error('network error'));

        const result = await mockHandler(mockContext);

        expect(printError).toHaveBeenCalledWith(expect.stringContaining('wizard'), expect.any(Error));
        expect(result).toBe(false);
        expect(mockPushHistory).not.toHaveBeenCalled();
    });
});
