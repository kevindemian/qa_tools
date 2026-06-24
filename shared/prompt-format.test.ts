vi.mock('./output', () => ({
    defaultOutput: { print: vi.fn() },
    Output: { columns: vi.fn(() => 80), isTTY: vi.fn(() => true) },
}));
vi.mock('./breadcrumbs', () => ({ getBreadcrumbPath: vi.fn(() => '') }));
vi.mock('./logger', () => ({ rootLogger: { writeFileOnly: vi.fn() } }));
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

describe('Badge', () => {
    it('formats ok badge', () => {
        const result = badge(5, 'passed', 'ok');

        expect(result).toContain('5');
        expect(result).toContain('passed');
    });

    it('formats error badge', () => {
        const result = badge(2, 'failed', 'error');

        expect(result).toContain('2');
        expect(result).toContain('failed');
    });
});

describe('Icon', () => {
    it('returns unicode checkmark', () => {
        expect(icon('ok')).toBe('\u2713');
    });

    it('returns unicode cross', () => {
        expect(icon('err')).toBe('\u2717');
    });
});

describe('Success/error/warn/info', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('success prints green message', () => {
        success('done');

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/done/));
    });

    it('error prints red message', () => {
        error('fail');

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/fail/));
    });

    it('warn prints yellow message', () => {
        warn('caution');

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/caution/));
    });

    it('info prints cyan message', () => {
        info('hello');

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/hello/));
    });
});

describe('Title', () => {
    it('prints title with breadcrumbs', () => {
        vi.mocked(getBreadcrumbPath).mockReturnValue('main');
        title('My Title');

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/My Title/));
    });
});

describe('Divider', () => {
    it('prints divider', () => {
        divider();

        expect(output['print']).toHaveBeenCalled();
    });
});

describe('TableView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints warning for null data', () => {
        tableView(null);

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('prints warning for empty array', () => {
        tableView([]);

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('renders data rows', () => {
        tableView([{ name: 'foo', status: 'pass' }]);

        expect(output['print']).toHaveBeenCalled();
    });

    it('renders with specific columns', () => {
        tableView([{ name: 'foo', status: 'pass' }], ['name', 'status']);

        expect(output['print']).toHaveBeenCalled();
    });
});

describe('GetConfig / __setConfig', () => {
    it('returns default config when none set', () => {
        const c = getConfig();

        expect(c).toBeTruthy();
    });

    it('returns set config after __setConfig', () => {
        const mockC = ConfigAccessor.create({});
        __setConfig(mockC);

        expect(getConfig()).toBe(mockC);
    });
});
