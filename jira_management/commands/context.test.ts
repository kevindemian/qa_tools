/** Tests for context — CommandContext interface (structural type check). */
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';

describe('CommandContext interface', () => {
    it('is a valid TypeScript type', () => {
        const ctx = createMockContext();

        expect(ctx.base_url).toBe('https://jira.test.com');
        expect(typeof ctx.pushHistory).toBe('function');
        expect(typeof ctx.printSessionSummary).toBe('function');
    });

    it('allows optional packageManager', () => {
        const ctx = createMockContext({});

        expect(ctx.packageManager).toBeUndefined();
    });
});
