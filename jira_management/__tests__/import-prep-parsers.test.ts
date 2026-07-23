import { nonNull } from '../../shared/test-utils.js';
import { handleDryRun, resolveCsvPath, resolveLabels, resolveJsonPath } from '../import-prep-parsers.js';
import type { JiraResourceLike } from '../../shared/types.js';

vi.mock('../../shared/config-accessor.js', () => ({ default: { get: vi.fn() } }));
vi.mock('../../shared/logger', () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));
vi.mock('../../shared/state', () => ({ load: vi.fn(), update: vi.fn() }));
vi.mock('../../shared/ui/prompt.js', () => ({
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
vi.mock('../../shared/quoted-string', () => ({ isPreconditionKey: vi.fn() }));
vi.mock('../../shared/report/markdown.js', () => ({
    md: vi.fn((s: string) => s),
    mdToHtml: vi.fn((s: string) => s),
}));

import * as CONFIG from '../../shared/config-accessor.js';
import * as PROMPT from '../../shared/ui/prompt.js';
import * as STATE from '../../shared/state.js';

function makeJiraResource(overrides?: { get?: (url: string) => Promise<unknown> }): JiraResourceLike {
    return {
        getJiraResource: overrides?.get ?? vi.fn().mockResolvedValue({}),
        postJiraResource: vi.fn(),
        putJiraResource: vi.fn(),
        searchJiraIssues: vi.fn(),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
    } as unknown as JiraResourceLike;
}

describe('HandleDryRun', () => {
    const onBusy = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when dryRun is disabled', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(false);
        const result = await handleDryRun([{ title: 'TC1', steps: [] }], onBusy, '/path.csv');
        expect(result).toBeNull();
    });

    it('returns dry-run result when dryRun is enabled', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [{ title: 'TC1', steps: [] }];
        const result = await handleDryRun(tests, onBusy, '/path.csv');

        expect(result).not.toBeNull();
        expect(nonNull(result).summary).toContain('DRY-RUN');
        expect(nonNull(result).summary).toContain('1 testes simulados');
        expect(nonNull(result).status).toBe('ok');
        expect(nonNull(result).failedLinks).toStrictEqual([]);
        expect(nonNull(result).inMemoryTasksId).toStrictEqual([]);
        expect(onBusy).toHaveBeenCalledWith(false);
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('DRY-RUN'));
    });

    it('returns 0 testes for empty tests array', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const result = await handleDryRun([], onBusy, '/path.csv');

        expect(result).not.toBeNull();
        expect(nonNull(result).summary).toContain('0 testes simulados');
    });

    it('reports correct update/create split when targetKeys provided', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [
            { title: 'T1', steps: [] },
            { title: 'T2', steps: [] },
            { title: 'T3', steps: [] },
        ];
        const jira = makeJiraResource();
        const result = await handleDryRun(tests, onBusy, '/path.csv', jira, ['KEY-1', 'KEY-2'], 'PROJ');

        expect(result).not.toBeNull();
        expect(nonNull(result).summary).toContain('2 updates');
        expect(nonNull(result).summary).toContain('1 creates');
    });

    it('reports all creates when no targetKeys provided', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [
            { title: 'T1', steps: [] },
            { title: 'T2', steps: [] },
        ];
        const result = await handleDryRun(tests, onBusy, '/path.csv');

        expect(result).not.toBeNull();
        expect(nonNull(result).summary).toContain('2 creates');
        expect(nonNull(result).summary).not.toContain('updates');
    });

    it('shows CREATE for keys beyond targetKeys length', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [
            { title: 'T1', steps: [] },
            { title: 'T2', steps: [] },
            { title: 'T3', steps: [] },
        ];
        const jira = makeJiraResource();
        await handleDryRun(tests, onBusy, '/path.csv', jira, ['KEY-1'], 'PROJ');

        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('CSV[2]'));
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('(CREATE)'));
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('CSV[3]'));
    });

    it('warns when project not found', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const failingGet = vi.fn().mockRejectedValue(new Error('404'));
        const jira = makeJiraResource({ get: failingGet });
        const tests = [{ title: 'T1', steps: [] }];
        await handleDryRun(tests, onBusy, '/path.csv', jira, [], 'PROJ');

        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Projeto PROJ'));
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
    });

    it('warns when target key not found (404)', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const callCount = { n: 0 };
        const jira = makeJiraResource({
            get: vi.fn().mockImplementation((url: string) => {
                callCount.n++;
                if (url === 'project/PROJ') return Promise.resolve({});
                if (url === 'issue/MISSING-1') return Promise.reject(new Error('404'));
                return Promise.resolve({});
            }),
        });
        const tests = [{ title: 'T1', steps: [] }];
        await handleDryRun(tests, onBusy, '/path.csv', jira, ['MISSING-1'], 'PROJ');

        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('MISSING-1'));
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('NOT FOUND'));
    });

    it('warns when Jira API throws network error (non-fatal)', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const jira = makeJiraResource({
            get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        });
        const tests = [{ title: 'T1', steps: [] }];
        const result = await handleDryRun(tests, onBusy, '/path.csv', jira, ['KEY-1'], 'PROJ');

        expect(result).not.toBeNull();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('NOT FOUND'));
    });

    it('validates linked issues when present', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const jira = makeJiraResource();
        const tests = [
            {
                title: 'T1',
                steps: [],
                linkedIssues: [{ key: 'LINK-1', linkType: 'Tests' }],
            },
        ];
        await handleDryRun(tests, onBusy, '/path.csv', jira, [], 'PROJ');

        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('LINK-1'));
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('linked issue'));
    });

    it('warns when linked issue not found', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const jira = makeJiraResource({
            get: vi.fn().mockImplementation((url: string) => {
                if (url === 'project/PROJ') return Promise.resolve({});
                if (url === 'issue/DEAD-1') return Promise.reject(new Error('404'));
                return Promise.resolve({});
            }),
        });
        const tests = [
            {
                title: 'T1',
                steps: [],
                linkedIssues: [{ key: 'DEAD-1', linkType: 'Tests' }],
            },
        ];
        await handleDryRun(tests, onBusy, '/path.csv', jira, [], 'PROJ');

        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('DEAD-1'));
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('linked issue não encontrado'));
    });

    it('skips linked issue validation when no jiraResource', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [
            {
                title: 'T1',
                steps: [],
                linkedIssues: [{ key: 'LINK-1', linkType: 'Tests' }],
            },
        ];
        await handleDryRun(tests, onBusy, '/path.csv');

        expect(PROMPT.info).not.toHaveBeenCalledWith(expect.stringContaining('linked issue'));
    });

    it('does not show validation block when no jiraResource and no targetKeys', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const tests = [{ title: 'T1', steps: [] }];
        await handleDryRun(tests, onBusy, '/path.csv');

        expect(PROMPT.info).not.toHaveBeenCalledWith(expect.stringContaining('Validando'));
    });

    it('shows CREATE for all when jiraResource provided but no targetKeys', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const jira = makeJiraResource();
        const tests = [{ title: 'T1', steps: [] }];
        await handleDryRun(tests, onBusy, '/path.csv', jira);

        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('(CREATE)'));
    });

    it('deduplicates linked issues', async () => {
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(true);
        const jira = makeJiraResource();
        const tests = [
            {
                title: 'T1',
                steps: [],
                linkedIssues: [{ key: 'LINK-1', linkType: 'Tests' }],
            },
            {
                title: 'T2',
                steps: [],
                linkedIssues: [{ key: 'LINK-1', linkType: 'Tests' }],
            },
        ];
        await handleDryRun(tests, onBusy, '/path.csv', jira, [], 'PROJ');

        const infoCalls = vi.mocked(PROMPT.info).mock.calls.flat();
        const link1Mentions = infoCalls.filter((c) => typeof c === 'string' && c.includes('LINK-1'));
        expect(link1Mentions).toHaveLength(1);
    });
});

describe('ResolveCsvPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(STATE, 'load').mockReturnValue({});
    });

    it('returns input when provided', async () => {
        expect.hasAssertions();

        const result = await resolveCsvPath('/my/path.csv');

        expect(result).toBe('/my/path.csv');
    });

    it('reads from config when no input', async () => {
        expect.hasAssertions();

        vi.spyOn(CONFIG.default, 'get').mockImplementation((key: string) => {
            if (key === 'csvPath') return '/config/path.csv';
            return undefined;
        });
        const result = await resolveCsvPath(undefined);

        expect(result).toBe('/config/path.csv');
    });

    it('prompts user when no input and no config', async () => {
        expect.hasAssertions();

        vi.spyOn(CONFIG.default, 'get').mockReturnValue(undefined);
        vi.spyOn(PROMPT, 'askFilePath').mockResolvedValue('/user/path.csv');
        const result = await resolveCsvPath(undefined);

        expect(result).toBe('/user/path.csv');
    });
});

describe('ResolveLabels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(STATE, 'load').mockReturnValue({});
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(undefined);
    });

    it('returns input array when provided', () => {
        const result = resolveLabels(['smoke', 'regression'], 'csvLabels');

        expect(result).toStrictEqual(['smoke', 'regression']);
    });

    it('reads from config when no input', () => {
        vi.spyOn(CONFIG.default, 'get').mockImplementation((key: string) => {
            if (key === 'csvLabels') return 'config-label';
            return undefined;
        });
        const result = resolveLabels(undefined, 'csvLabels');

        expect(result).toStrictEqual(['config-label']);
    });

    it('prompts user and splits by comma', () => {
        vi.spyOn(PROMPT, 'prompt').mockReturnValue('a, b, c');
        const result = resolveLabels(undefined, 'csvLabels');

        expect(result).toStrictEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty prompt', () => {
        vi.spyOn(PROMPT, 'prompt').mockReturnValue('');
        const result = resolveLabels(undefined, 'csvLabels');

        expect(result).toStrictEqual([]);
    });
});

describe('ResolveJsonPath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(STATE, 'load').mockReturnValue({});
        vi.spyOn(CONFIG.default, 'get').mockReturnValue(undefined);
    });

    it('returns input when provided', async () => {
        expect.hasAssertions();

        const result = await resolveJsonPath('/my/tests.json');

        expect(result).toBe('/my/tests.json');
    });

    it('reads from config when no input', async () => {
        expect.hasAssertions();

        vi.spyOn(CONFIG.default, 'get').mockImplementation((key: string) => {
            if (key === 'jsonPath') return '/config/tests.json';
            return undefined;
        });
        const result = await resolveJsonPath(undefined);

        expect(result).toBe('/config/tests.json');
    });

    it('prompts user when no input and no config', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'askFilePath').mockResolvedValue('/user/tests.json');
        const result = await resolveJsonPath(undefined);

        expect(result).toBe('/user/tests.json');
    });

    it('returns undefined for empty path', async () => {
        expect.hasAssertions();

        vi.spyOn(PROMPT, 'askFilePath').mockResolvedValue('');
        const result = await resolveJsonPath(undefined);

        expect(result).toBeUndefined();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('vazio'));
    });
});
