import { execFileSync } from 'child_process';

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

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

function assertFindingFields(f: Finding): void {
    expect(f).toHaveProperty('pattern');
    expect(f).toHaveProperty('severity');
    expect(f).toHaveProperty('count');
    expect(f).toHaveProperty('description');
    expect(f).toHaveProperty('recommendation');
}

describe('Structural.ts — module loads and runs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads without error when rg succeeds and outputs 6 findings', async () => {
        expect.hasAssertions();

        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

        mockExecFileSync.mockReturnValue(Buffer.from(''));
        await import('./structural.js');
        const output = String(spy.mock.calls[0]?.[0] ?? '[]');
        const data: Finding[] = JSON.parse(output) as Finding[];

        expect(data).toHaveLength(6);

        const d0 = data[0] as Finding;
        const d5 = data[5] as Finding;

        expect(d0.pattern).toBe('Config getter pattern');
        expect(d0.severity).toMatch(/^high|medium|low$/);
        expect(typeof d0.count).toBe('number');
        expect(d5.pattern).toBe('Git provider method post-processing');

        for (const f of data) {
            assertFindingFields(f);
        }

        spy.mockRestore();
    });

    it('loads without error when rg fails', async () => {
        expect.hasAssertions();

        mockExecFileSync.mockImplementation(() => {
            throw new Error('rg missing');
        });

        await expect(import('./structural.js')).resolves.toBeDefined();
    });
});
