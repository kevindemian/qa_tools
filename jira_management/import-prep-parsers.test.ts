import { nonNull } from '../shared/test-utils.js';
import { handleDryRun, resolveCsvPath, resolveLabels, resolveJsonPath } from './import-prep-parsers.js';

vi.mock('../shared/config', async () => ({ default: { get: vi.fn() } }));
vi.mock('../shared/logger', async () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));
vi.mock('../shared/state', async () => ({ load: vi.fn(), update: vi.fn() }));
vi.mock('../shared/prompt', async () => ({
    warn: vi.fn(),
    prompt: vi.fn(),
    printSummary: vi.fn(),
    askFilePath: vi.fn(),
    info: vi.fn(),
    print: vi.fn(),
    confirm: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
}));
vi.mock('../shared/quoted-string', async () => ({ isPreconditionKey: vi.fn() }));
vi.mock('../shared/markdown', async () => ({
    md: vi.fn((s: string) => s),
    mdToHtml: vi.fn((s: string) => s),
}));

import * as CONFIG from '../shared/config.js';
import * as PROMPT from '../shared/prompt.js';
import * as STATE from '../shared/state.js';

describe('handleDryRun', () => {
    const onBusy = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when dryRun is disabled', async () => {
        vi.mocked(CONFIG.default.get).mockReturnValue(false);
        const result = handleDryRun([{ title: 'TC1', steps: [] }], onBusy, '/path.csv');
        expect(result).toBeNull();
    });

    it('returns dry-run result and calls onBusy when dryRun is enabled', async () => {
        vi.mocked(CONFIG.default.get).mockReturnValue(true);
        const tests = [{ title: 'TC1', steps: [] }];
        const result = handleDryRun(tests, onBusy, '/path.csv');
        expect(result).not.toBeNull();
        expect(nonNull(result).summary).toContain('DRY-RUN');
        expect(nonNull(result).status).toBe('ok');
        expect(onBusy).toHaveBeenCalledWith(false);
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('DRY-RUN'));
    });
});

describe('resolveCsvPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(STATE.load).mockReturnValue({});
    });

    it('returns input when provided', async () => {
        const result = await resolveCsvPath('/my/path.csv');
        expect(result).toBe('/my/path.csv');
    });

    it('reads from config when no input', async () => {
        vi.mocked(CONFIG.default.get).mockImplementation((key: string) => {
            if (key === 'csvPath') return '/config/path.csv';
            return undefined;
        });
        const result = await resolveCsvPath(undefined);
        expect(result).toBe('/config/path.csv');
    });

    it('prompts user when no input and no config', async () => {
        vi.mocked(CONFIG.default.get).mockReturnValue(undefined);
        vi.mocked(PROMPT.askFilePath).mockResolvedValue('/user/path.csv');
        const result = await resolveCsvPath(undefined);
        expect(result).toBe('/user/path.csv');
    });
});

describe('resolveLabels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(STATE.load).mockReturnValue({});
        vi.mocked(CONFIG.default.get).mockReturnValue(undefined);
    });

    it('returns input array when provided', async () => {
        const result = resolveLabels(['smoke', 'regression'], 'csvLabels');
        expect(result).toEqual(['smoke', 'regression']);
    });

    it('reads from config when no input', async () => {
        vi.mocked(CONFIG.default.get).mockImplementation((key: string) => {
            if (key === 'csvLabels') return 'config-label';
            return undefined;
        });
        const result = resolveLabels(undefined, 'csvLabels');
        expect(result).toEqual(['config-label']);
    });

    it('prompts user and splits by comma', async () => {
        vi.mocked(PROMPT.prompt).mockReturnValue('a, b, c');
        const result = resolveLabels(undefined, 'csvLabels');
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty prompt', async () => {
        vi.mocked(PROMPT.prompt).mockReturnValue('');
        const result = resolveLabels(undefined, 'csvLabels');
        expect(result).toEqual([]);
    });
});

describe('resolveJsonPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(STATE.load).mockReturnValue({});
        vi.mocked(CONFIG.default.get).mockReturnValue(undefined);
    });

    it('returns input when provided', async () => {
        const result = await resolveJsonPath('/my/tests.json');
        expect(result).toBe('/my/tests.json');
    });

    it('reads from config when no input', async () => {
        vi.mocked(CONFIG.default.get).mockImplementation((key: string) => {
            if (key === 'jsonPath') return '/config/tests.json';
            return undefined;
        });
        const result = await resolveJsonPath(undefined);
        expect(result).toBe('/config/tests.json');
    });

    it('prompts user when no input and no config', async () => {
        vi.mocked(PROMPT.askFilePath).mockResolvedValue('/user/tests.json');
        const result = await resolveJsonPath(undefined);
        expect(result).toBe('/user/tests.json');
    });

    it('returns undefined for empty path', async () => {
        vi.mocked(PROMPT.askFilePath).mockResolvedValue('');
        const result = await resolveJsonPath(undefined);
        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('vazio'));
    });
});
