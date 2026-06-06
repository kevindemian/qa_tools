vi.mock('./output', async () => ({
    defaultOutput: { print: vi.fn() },
    Output: { columns: vi.fn(() => 80), isTTY: vi.fn(() => true) },
}));
vi.mock('./breadcrumbs', async () => ({ getBreadcrumbPath: vi.fn(() => '') }));
vi.mock('./logger', async () => ({ rootLogger: { writeFileOnly: vi.fn() } }));
vi.mock('./config', () => {
    const mockConfig = { quiet: false };
    return {
        __esModule: true,
        default: {
            get: (key: string) => (key === 'quiet' ? mockConfig.quiet : undefined),
            getDefault: () => ({ get: (k: string) => (k === 'quiet' ? mockConfig.quiet : undefined) }),
        },
    };
});

import {
    badge,
    icon,
    success,
    error,
    warn,
    info,
    title,
    divider,
    tableView,
    getConfig,
    __setConfig,
} from './prompt-format.js';
import { defaultOutput as output } from './output.js';
import { getBreadcrumbPath } from './breadcrumbs.js';
import ConfigAccessor from './config-accessor.js';

describe('badge', () => {
    it('formats ok badge', async () => {
        const result = badge(5, 'passed', 'ok');
        expect(result).toContain('5');
        expect(result).toContain('passed');
    });

    it('formats error badge', async () => {
        const result = badge(2, 'failed', 'error');
        expect(result).toContain('2');
        expect(result).toContain('failed');
    });
});

describe('icon', () => {
    it('returns unicode checkmark', async () => {
        expect(icon('ok')).toBe('\u2713');
    });

    it('returns unicode cross', async () => {
        expect(icon('err')).toBe('\u2717');
    });
});

describe('success/error/warn/info', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('success prints green message', async () => {
        success('done');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/done/));
    });

    it('error prints red message', async () => {
        error('fail');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/fail/));
    });

    it('warn prints yellow message', async () => {
        warn('caution');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/caution/));
    });

    it('info prints cyan message', async () => {
        info('hello');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/hello/));
    });
});

describe('title', () => {
    it('prints title with breadcrumbs', async () => {
        vi.mocked(getBreadcrumbPath).mockReturnValue('main');
        title('My Title');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/My Title/));
    });
});

describe('divider', () => {
    it('prints divider', async () => {
        divider();
        expect(output.print).toHaveBeenCalled();
    });
});

describe('tableView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints warning for null data', async () => {
        tableView(null);
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('prints warning for empty array', async () => {
        tableView([]);
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('renders data rows', async () => {
        tableView([{ name: 'foo', status: 'pass' }]);
        expect(output.print).toHaveBeenCalled();
    });

    it('renders with specific columns', async () => {
        tableView([{ name: 'foo', status: 'pass' }], ['name', 'status']);
        expect(output.print).toHaveBeenCalled();
    });
});

describe('getConfig / __setConfig', () => {
    it('returns default config when none set', async () => {
        const c = getConfig();
        expect(c).toBeTruthy();
    });

    it('returns set config after __setConfig', async () => {
        const mockC = ConfigAccessor.create({});
        __setConfig(mockC);
        expect(getConfig()).toBe(mockC);
    });
});
