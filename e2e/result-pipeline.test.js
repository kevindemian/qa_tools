const fs = require('fs');
const path = require('path');
const os = require('os');
const nock = require('nock');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-'));

jest.setTimeout(30000);

const JiraResource = require('../jira_management/jira_resource');
const JiraLinkManager = require('../jira_management/jira_link_manager');
const { parseMochawesome } = require('../shared/result_parser');
const { matchResultsToTests, createTestExecutionFromResults } = require('../jira_management/result_reporter');

const FIXTURES = path.join(__dirname, 'fixtures');

function setupJiraMocks(base) {
    const api = nock(base + '/rest/api/2');

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
    api.post('/issue').reply(201, (_, body) => {
        teCount++;
        const keys = body.fields?.customfield_13715 || [];
        return { key: 'RESULT-' + teCount, id: '3000' + teCount };
    });

    api.post('/issueLink').times(3).reply(201);
}

describe('E2E: Result Processing Pipeline', () => {
    beforeAll(() => {
        process.env.HOME = tmpHome;
        process.env.JIRA_BASE_URL = 'http://localhost:1997/jira';
        process.env.JIRA_PERSONAL_TOKEN = 'e2e-token';
        process.env.XRAY_BASE_URL = 'http://localhost:1997/xray';
        process.env.QUIET = 'true';
        setupJiraMocks('http://localhost:1997/jira');
    });

    afterAll(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        if (fs.existsSync(tmpHome)) {
            fs.rmSync(tmpHome, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
        nock.cleanAll();
        setupJiraMocks('http://localhost:1997/jira');
    });

    afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
    });

    it('flows end-to-end: mochawesome → match → TE creation', async () => {
        const mochaPath = path.join(FIXTURES, 'mochawesome.json');
        const raw = fs.readFileSync(mochaPath, 'utf8');
        const parsed = parseMochawesome(JSON.parse(raw));

        expect(parsed.tests).toHaveLength(3);
        expect(parsed.stats.passed).toBe(2);
        expect(parsed.stats.failed).toBe(1);

        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched, unmatched, stats: matchStats } = matchResultsToTests(parsed.tests, mappingPath);

        expect(matched).toHaveLength(3);
        expect(unmatched).toHaveLength(0);
        expect(matchStats.passed).toBe(2);
        expect(matchStats.failed).toBe(1);

        const jiraResource = new JiraResource('e2e-token', 'http://localhost:1997/jira/rest/api/2');
        const linkManager = new JiraLinkManager(jiraResource);
        const result = await createTestExecutionFromResults(
            jiraResource,
            linkManager,
            'EXECPROJ',
            matched,
            'testes-simples',
            { pipelineId: 42, branch: 'main', provider: 'gitlab' },
        );

        expect(result.key).toBe('RESULT-1');
        expect(result.summary).toMatch(/testes-simples \(main #42\)/);
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.skipped).toBe(0);

        expect(nock.isDone()).toBe(true);
    });

    it('handles unmatched test gracefully', async () => {
        const mochaPath = path.join(FIXTURES, 'mochawesome.json');
        const raw = fs.readFileSync(mochaPath, 'utf8');
        const parsed = parseMochawesome(JSON.parse(raw));

        parsed.tests.push({ title: 'TC99 - Unknown test', state: 'failed', duration: 50 });

        const mappingPath = path.join(FIXTURES, 'test-mapping.json');
        const { matched, unmatched } = matchResultsToTests(parsed.tests, mappingPath);

        expect(matched).toHaveLength(3);
        expect(unmatched).toHaveLength(1);
        expect(unmatched[0].title).toBe('TC99 - Unknown test');
    });

    it('returns empty match for missing mapping file', () => {
        const result = matchResultsToTests(
            [{ title: 'TC01', state: 'passed', duration: 100 }],
            '/tmp/nonexistent.json',
        );
        expect(result.matched).toHaveLength(0);
        expect(result.stats.total).toBe(0);
    });
});
