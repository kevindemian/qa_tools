import { execFileSync } from 'child_process';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

interface Finding {
    pattern: string;
    severity: string;
    count: number;
    description?: string;
    recommendation?: string;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('structural.ts — module loads and runs', () => {
    it('loads without error when rg succeeds and outputs 6 findings', async () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        mockExecFileSync.mockReturnValue(Buffer.from(''));
        await import('./structural.js');
        const output = String(spy.mock.calls[0]?.[0] ?? '[]');
        const data: Finding[] = JSON.parse(output);
        expect(data).toHaveLength(6);
        expect(data[0]!.pattern).toBe('Config getter pattern');
        expect(data[0]!.severity).toMatch(/^high|medium|low$/);
        expect(typeof data[0]!.count).toBe('number');
        expect(data[5]!.pattern).toBe('Git provider method post-processing');
        for (const f of data) {
            expect(f).toHaveProperty('pattern');
            expect(f).toHaveProperty('severity');
            expect(f).toHaveProperty('count');
            expect(f).toHaveProperty('description');
            expect(f).toHaveProperty('recommendation');
        }
        spy.mockRestore();
    });

    it('loads without error when rg fails', async () => {
        mockExecFileSync.mockImplementation(() => {
            throw new Error('rg missing');
        });
        await expect(import('./structural.js')).resolves.toBeDefined();
    });
});
