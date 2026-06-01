jest.mock('./output', () => ({
    defaultOutput: { print: jest.fn() },
    Output: { columns: jest.fn(() => 80), isTTY: jest.fn(() => true) },
}));
jest.mock('./breadcrumbs', () => ({ getBreadcrumbPath: jest.fn(() => '') }));
jest.mock('./logger', () => ({ rootLogger: { writeFileOnly: jest.fn() } }));
jest.mock('./config', () => {
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
} from './prompt-format';
import { defaultOutput as output } from './output';
import { getBreadcrumbPath } from './breadcrumbs';
import ConfigAccessor from './config-accessor';

describe('badge', () => {
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

describe('icon', () => {
    it('returns unicode checkmark', () => {
        expect(icon('ok')).toBe('\u2713');
    });

    it('returns unicode cross', () => {
        expect(icon('err')).toBe('\u2717');
    });
});

describe('success/error/warn/info', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('success prints green message', () => {
        success('done');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/done/));
    });

    it('error prints red message', () => {
        error('fail');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/fail/));
    });

    it('warn prints yellow message', () => {
        warn('caution');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/caution/));
    });

    it('info prints cyan message', () => {
        info('hello');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/hello/));
    });
});

describe('title', () => {
    it('prints title with breadcrumbs', () => {
        jest.mocked(getBreadcrumbPath).mockReturnValue('main');
        title('My Title');
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/My Title/));
    });
});

describe('divider', () => {
    it('prints divider', () => {
        divider();
        expect(output.print).toHaveBeenCalled();
    });
});

describe('tableView', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prints warning for null data', () => {
        tableView(null);
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('prints warning for empty array', () => {
        tableView([]);
        expect(output.print).toHaveBeenCalledWith(expect.stringMatching(/Nenhum dado/));
    });

    it('renders data rows', () => {
        tableView([{ name: 'foo', status: 'pass' }]);
        expect(output.print).toHaveBeenCalled();
    });

    it('renders with specific columns', () => {
        tableView([{ name: 'foo', status: 'pass' }], ['name', 'status']);
        expect(output.print).toHaveBeenCalled();
    });
});

describe('getConfig / __setConfig', () => {
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
