/** Tests for structural auditor — detection patterns + runner. */
import { execFileSync } from 'child_process';

jest.mock('child_process', () => ({
    execFileSync: jest.fn(),
}));

const mockExecFileSync = execFileSync as unknown as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('structural.ts — module loads and runs', () => {
    it('loads without error when rg succeeds', () => {
        mockExecFileSync.mockReturnValue(Buffer.from(''));
        expect(() => {
            jest.isolateModules(() => {
                require('./structural');
            });
        }).not.toThrow();
    });

    it('loads without error when rg fails', () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('rg missing');
        });
        expect(() => {
            jest.isolateModules(() => {
                require('./structural');
            });
        }).not.toThrow();
    });

    it('outputs valid JSON array of 6 findings', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockExecFileSync.mockReturnValue(Buffer.from(''));
        jest.isolateModules(() => {
            require('./structural');
            const output = String(spy.mock.calls[0]?.[0] ?? '[]');
            const data: Array<{ pattern: string; severity: string; count: number }> = JSON.parse(output);
            expect(data).toHaveLength(6);
            expect(data[0]!.pattern).toBe('Config getter pattern');
            expect(data[0]!.severity).toMatch(/^high|medium|low$/);
            expect(typeof data[0]!.count).toBe('number');
            expect(data[5]!.pattern).toBe('Git provider method post-processing');
        });
        spy.mockRestore();
    });

    it('all findings have same shape keys', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockExecFileSync.mockReturnValue(Buffer.from(''));
        jest.isolateModules(() => {
            require('./structural');
            const data: Array<Record<string, unknown>> = JSON.parse(String(spy.mock.calls[0]?.[0] ?? '[]'));
            for (const f of data) {
                expect(f).toHaveProperty('pattern');
                expect(f).toHaveProperty('severity');
                expect(f).toHaveProperty('count');
                expect(f).toHaveProperty('description');
                expect(f).toHaveProperty('recommendation');
            }
        });
        spy.mockRestore();
    });
});
