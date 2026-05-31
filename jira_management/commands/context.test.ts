/** Tests for context — CommandContext interface (structural type check). */
import type { CommandContext } from './context';

describe('CommandContext interface', () => {
    it('is a valid TypeScript type', () => {
        const ctx: CommandContext = {
            jiraResource: {} as never,
            jiraResourceXray: {} as never,
            linkManager: {} as never,
            linkManagerXray: {} as never,
            csvResource: {} as never,
            ctx: {} as never,
            pushHistory: jest.fn(),
            printSessionSummary: jest.fn(),
            base_url: 'https://jira.example.com',
            sessionLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        };
        expect(ctx.base_url).toBe('https://jira.example.com');
        expect(typeof ctx.pushHistory).toBe('function');
        expect(typeof ctx.printSessionSummary).toBe('function');
    });

    it('allows optional packageManager', () => {
        const ctx: CommandContext = {
            jiraResource: {} as never,
            jiraResourceXray: {} as never,
            linkManager: {} as never,
            linkManagerXray: {} as never,
            csvResource: {} as never,
            ctx: {} as never,
            pushHistory: jest.fn(),
            printSessionSummary: jest.fn(),
            base_url: 'https://jira.example.com',
            sessionLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        };
        expect(ctx.packageManager).toBeUndefined();
    });
});
