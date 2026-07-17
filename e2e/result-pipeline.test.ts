vi.mock('../shared/config', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../shared/config-accessor.js')>();
    const inst = mod.default.getDefault();
    const realGet = inst.get.bind(inst);
    inst.get = ((key: string): string | undefined =>
        key === 'jiraMode' ? undefined : realGet(key)) as typeof inst.get;
    return mod;
});

import fs from 'fs';
import path from 'path';
import os from 'os';
import nock from 'nock';
import JiraResource from '../jira_management/jira_resource.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import { parseTestResults } from '../shared/result_parser.js';
import { nonNull } from '../shared/test-utils.js';
import { matchResultsToTests, createTestExecutionFromResults } from '../jira_management/result_reporter.js';

const E2E_TOKEN = process.env['E2E_JIRA_TOKEN'] ?? (process.env['CI'] ? '' : 'e2e-token');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-'));

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

function setupJiraMocks(base: string): void {
    const api = nock(base + '/rest/api/2');

    // findExistingTe → GET /search (called before /issuetype)
    api.get('/search').query(true).reply(200, { issues: [], total: 0 });

    api.get('/issuetype').reply(200, [
        { id: '11200', name: 'Epic' },
        { id: '11800', name: 'Test' },
        { id: '11802', name: 'Test Execution' },
    ]);

    api.get('/field').reply(200, [
        {
            id: 'customfield_13715',
            name: 'Tests association with a Test Execution',
            schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
        },
    ]);

    api.get('/issueLinkType').reply(200, {
        issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
    });

    let teCount = 0;
    api.post('/issue').reply(201, (_uri: string, _body) => {
        teCount++;
        return { key: 'RESULT-' + teCount, id: '3000' + teCount };
    });

    api.post('/issueLink').times(3).reply(201);
}

describe('E2E: Result Processing Pipeline', () => {
    beforeAll(() => {
        nock.cleanAll();
        process.env['HOME'] = tmpHome;
        process.env['JIRA_BASE_URL'] = 'http://localhost:1997/jira';
        process.env['JIRA_PERSONAL_TOKEN'] = E2E_TOKEN;
        process.env['XRAY_BASE_URL'] = 'http://localhost:1997/xray';
        process.env['QUIET'] = 'true';
        setupJiraMocks('http://localhost:1997/jira');
    });

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        nock.cleanAll();
        setupJiraMocks('http://localhost:1997/jira');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        nock.cleanAll();
    });

    afterAll(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
        if (fs.existsSync(path.resolve(tmpHome))) {
            fs.rmSync(tmpHome, { recursive: true, force: true });
        }
    });

    it('flows end-to-end: mochawesome → match → TE creation', async () => {
        expect.hasAssertions();

        const mochaPath = path.join(FIXTURES, 'mochawesome.json');
        const raw = fs.readFileSync(mochaPath, 'utf8');
        const parsed = parseTestResults(JSON.parse(raw));

        expect(parsed.tests).toHaveLength(3);
        expect(parsed.stats.passed).toBe(2);
        expect(parsed.stats.failed).toBe(1);

        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched, unmatched, stats: matchStats } = matchResultsToTests(parsed.tests, mappingPath);

        expect(matched).toHaveLength(3);
        expect(unmatched).toHaveLength(0);
        expect(matchStats.passed).toBe(2);
        expect(matchStats.failed).toBe(1);

        const jiraResource = new JiraResource(E2E_TOKEN, 'http://localhost:1997/jira/rest/api/2');
        const linkManager = new JiraLinkManager(jiraResource);
        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'EXECPROJ',
            matchedResults: matched,
            csvName: 'testes-simples',
            pipelineInfo: { pipelineId: 42, branch: 'main', provider: 'gitlab' },
        });

        expect(result.key).toBe('RESULT-1');
    });

    it('mochawesome e2e TE creation produces correct result stats', async () => {
        expect.hasAssertions();

        const mochaPath = path.join(FIXTURES, 'mochawesome.json');
        const raw = fs.readFileSync(mochaPath, 'utf8');
        const parsed = parseTestResults(JSON.parse(raw));
        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched } = matchResultsToTests(parsed.tests, mappingPath);

        const jiraResource = new JiraResource(E2E_TOKEN, 'http://localhost:1997/jira/rest/api/2');
        const linkManager = new JiraLinkManager(jiraResource);
        const result = await createTestExecutionFromResults({
            jiraResource,
            linkManager,
            projectName: 'EXECPROJ',
            matchedResults: matched,
            csvName: 'testes-simples',
            pipelineInfo: { pipelineId: 42, branch: 'main', provider: 'gitlab' },
        });

        expect(result.summary).toMatch(/testes-simples \(main #42\)/);
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.skipped).toBe(0);
        expect(nock.isDone()).toBeTruthy();
    });

    it('handles unmatched test gracefully', () => {
        const mochaPath = path.join(FIXTURES, 'mochawesome.json');
        const raw = fs.readFileSync(mochaPath, 'utf8');
        const parsed = parseTestResults(JSON.parse(raw));

        parsed.tests.push({ title: 'TC99 - Unknown test', state: 'failed', duration: 50 });

        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched, unmatched } = matchResultsToTests(parsed.tests, mappingPath);

        expect(matched).toHaveLength(3);
        expect(unmatched).toHaveLength(1);
        expect(nonNull(unmatched[0]).title).toBe('TC99 - Unknown test');
    });

    it('flows end-to-end: CTRF → match → TE creation', () => {
        const ctrfPath = path.join(FIXTURES, 'ctrf-report.json');
        const raw = fs.readFileSync(ctrfPath, 'utf8');
        const parsed = parseTestResults(JSON.parse(raw));

        expect(parsed.tests).toHaveLength(4);
        expect(parsed.stats.passed).toBe(2);
        expect(parsed.stats.failed).toBe(1);

        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched, unmatched } = matchResultsToTests(parsed.tests, mappingPath);

        expect(matched).toHaveLength(3);
        expect(unmatched).toHaveLength(1);
    });

    it('returns empty match for missing mapping file', () => {
        const result = matchResultsToTests(
            [{ title: 'TC01', state: 'passed', duration: 100 }],
            path.join(os.tmpdir(), 'nonexistent.json'),
        );

        expect(result.matched).toHaveLength(0);
        expect(result.stats.total).toBe(0);
    });
});
