const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-err-'));
process.env.HOME = tmpHome;
process.env.JIRA_BASE_URL = 'http://localhost:1999/jira';
process.env.JIRA_PERSONAL_TOKEN = 'e2e-token';
process.env.XRAY_BASE_URL = 'http://localhost:1999/xray';
process.env.CSV_LABELS = 'e2e';
process.env.QUIET = 'true';
process.env.AUTO_CONFIRM = 'true';
process.env.ON_ERROR = 'skip';

jest.setTimeout(30000);

const nock = require('nock');
const JiraResource = require('../jira_management/jira_resource');
const JiraLinkManager = require('../jira_management/jira_link_manager');
const CsvResource = require('../jira_management/csv_resource');
const { createTestsFromCsv } = require('../jira_management/create_tests');
const { rootLogger } = require('../shared/logger');

const BASE = 'http://localhost:1999/jira/rest/api/2';
const XRAY = 'http://localhost:1999/xray';

function makeState() {
  const jiraResource = new JiraResource('e2e-token', BASE);
  const jiraResourceXray = new JiraResource('e2e-token', XRAY);
  return {
    jiraResource,
    jiraResourceXray,
    linkManager: new JiraLinkManager(jiraResource),
    linkManagerXray: new JiraLinkManager(jiraResourceXray),
    csvResource: new CsvResource(),
    project_name: 'ECSPOL',
    base_url: 'http://localhost:1999/jira',
    sessionLog: rootLogger.child({ session: 'test-err' }),
    onBusy: jest.fn(),
  };
}

function csvPath(name) {
  return path.join(tmpHome, name + '.csv');
}

function writeCsv(name, content) {
  const p = csvPath(name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

describe('E2E: CSV Import - Error Paths', () => {
  beforeAll(() => {
    const home = path.join(os.homedir(), '.qa_tools_link_types_cache.json');
    try { fs.unlinkSync(home); } catch {}
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
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    nock.cleanAll();
    nock.enableNetConnect();
    process.env.ON_ERROR = 'skip';
  });

  it('C1: POST /issue 500 + ON_ERROR=skip — skip test, continue next', async () => {
    process.env.CSV_PATH = writeCsv('c1', [
      'Title: TC01',
      'Action,Data,Expected Result',
      'Step1,,R1',
      '---',
      'Title: TC02',
      'Action,Data,Expected Result',
      'Step1,,R2',
    ].join('\n'));

    const jira = nock(BASE);
    jira.post('/issue').reply(500, { errorMessages: ['Internal error'] });
    jira.post('/issue').reply(201, () => ({ key: 'TEST-2', id: '10002' }));
    const xray = nock(XRAY);
    xray.post('/test/TEST-2/steps').reply(201);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-2']);
    expect(result.inMemoryTasksText).toEqual(['TC01', 'TC02']);
    expect(result.status).toBe('error');
    expect(result.summary).toBe('1/2 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C2: POST /issue 500 + ON_ERROR=abort — stop on first failure', async () => {
    process.env.ON_ERROR = 'abort';
    process.env.CSV_PATH = writeCsv('c2', [
      'Title: TC01',
      'Action,Data,Expected Result',
      'Step1,,R1',
      '---',
      'Title: TC02',
      'Action,Data,Expected Result',
      'Step1,,R2',
    ].join('\n'));

    const jira = nock(BASE);
    jira.post('/issue').reply(500, { errorMessages: ['Internal error'] });

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual([]);
    expect(result.inMemoryTasksText).toEqual(['TC01']);
    expect(result.status).toBe('error');
    expect(result.summary).toBe('0/2 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C3: POST /issueLink 403 — 4xx sem retry, erro nao bloqueante', async () => {
    process.env.CSV_PATH = writeCsv('c3', [
      'Title: TC01',
      'Linked Issues: KEY-200 (is tested by)',
      'Action,Data,Expected Result',
      'Step1,,R1',
      '---',
      'Title: TC02',
      'Action,Data,Expected Result',
      'Step1,,R2',
    ].join('\n'));

    let issueCount = 0;
    const jira = nock(BASE);
    jira.post('/issue').times(2).reply(201, () => {
      issueCount++;
      return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
    });
    jira.get('/issueLinkType').reply(200, {
      issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
    });
    jira.post('/issueLink').reply(403, { errorMessages: ['Permission denied'] });
    const xray = nock(XRAY);
    xray.post('/test/TEST-1/steps').reply(201);
    xray.post('/test/TEST-2/steps').reply(201);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
    expect(result.inMemoryTasksText).toEqual(['TC01', 'TC02']);
    expect(result.status).toBe('ok');
    expect(result.summary).toBe('2/2 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C4: GET /issueLinkType 404 — fallback para FALLBACK_LINK_TYPES', async () => {
    process.env.CSV_PATH = writeCsv('c4', [
      'Title: TC01',
      'Linked Issues: KEY-200 (is tested by)',
      'Action,Data,Expected Result',
      'Step1,,R1',
      '---',
      'Title: TC02',
      'Action,Data,Expected Result',
      'Step1,,R2',
    ].join('\n'));

    let issueCount = 0;
    const jira = nock(BASE);
    jira.post('/issue').times(2).reply(201, () => {
      issueCount++;
      return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
    });
    jira.get('/issueLinkType').reply(404);
    jira.post('/issueLink').reply(201);
    const xray = nock(XRAY);
    xray.post('/test/TEST-1/steps').reply(201);
    xray.post('/test/TEST-2/steps').reply(201);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
    expect(result.inMemoryTasksText).toEqual(['TC01', 'TC02']);
    expect(result.status).toBe('ok');
    expect(result.summary).toBe('2/2 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C5: Precondition PUT 500 — erro pos-criacao, testErrors path', async () => {
    process.env.CSV_PATH = writeCsv('c5', [
      'Title: TC01',
      'Pre-condition: KEY-100',
      'Action,Data,Expected Result',
      'Step1,,R1',
    ].join('\n'));

    const jira = nock(BASE);
    jira.post('/issue').reply(201, () => ({ key: 'TEST-1', id: '10001' }));
    jira.get('/field').reply(200, [
      { id: 'customfield_13708', name: 'Pre-Conditions association', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
    ]);
    jira.get('/issue/TEST-1').reply(200, { key: 'TEST-1', fields: { customfield_13708: [] } });
    jira.put('/issue/TEST-1').times(6).reply(500);
    const xray = nock(XRAY);
    xray.post('/test/TEST-1/steps').reply(201);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-1']);
    expect(result.inMemoryTasksText).toEqual(['TC01']);
    expect(result.status).toBe('error');
    expect(result.summary).toBe('0/1 testes criados');
    expect(nock.isDone()).toBe(true);
  }, 120000);

  it('C6: Cross-ref PUT 403 — erro nao propaga para o caller', async () => {
    process.env.CSV_PATH = writeCsv('c6', [
      'Title: TC01',
      'Group: LOGIN',
      'Action,Data,Expected Result',
      'Step1,,R1',
      '---',
      'Title: TC02',
      'Group: LOGIN',
      'Action,Data,Expected Result',
      'Step1,,R2',
    ].join('\n'));

    let issueCount = 0;
    const jira = nock(BASE);
    jira.post('/issue').times(2).reply(201, () => {
      issueCount++;
      return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
    });
    jira.get('/issue/TEST-1').reply(200, { fields: { description: '' } });
    jira.put('/issue/TEST-1').reply(403);
    jira.get('/issue/TEST-2').reply(200, { fields: { description: '' } });
    jira.put('/issue/TEST-2').reply(403);
    const xray = nock(XRAY);
    xray.post('/test/TEST-1/steps').reply(201);
    xray.post('/test/TEST-2/steps').reply(201);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
    expect(result.inMemoryTasksText).toEqual(['TC01', 'TC02']);
    expect(result.status).toBe('ok');
    expect(result.summary).toBe('2/2 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C7: Steps fail + ON_ERROR=abort — abortSteps flag, break outer', async () => {
    process.env.ON_ERROR = 'abort';
    process.env.CSV_PATH = writeCsv('c7', [
      'Title: TC01',
      'Action,Data,Expected Result',
      'Step1,,R1',
    ].join('\n'));

    const jira = nock(BASE);
    jira.post('/issue').reply(201, () => ({ key: 'TEST-1', id: '10001' }));
    const xray = nock(XRAY);
    xray.post('/test/TEST-1/steps').reply(500);

    const result = await createTestsFromCsv(makeState());

    expect(result).toBeDefined();
    expect(result.inMemoryTasksId).toEqual(['TEST-1']);
    expect(result.inMemoryTasksText).toEqual(['TC01']);
    expect(result.status).toBe('error');
    expect(result.summary).toBe('0/1 testes criados');
    expect(nock.isDone()).toBe(true);
  });

  it('C8: DRY_RUN=true — simulates without API calls', async () => {
    process.env.DRY_RUN = 'true';
    process.env.CSV_PATH = writeCsv('c8', [
      'Title: TC Dry',
      'Action,Data,Expected Result',
      'Step1,,R1',
    ].join('\n'));

    const result = await createTestsFromCsv(makeState());

    expect(result.status).toBe('ok');
    expect(result.summary).toContain('DRY-RUN');
    expect(result.inMemoryTasksId).toEqual([]);
    expect(nock.isDone()).toBe(true);
    delete process.env.DRY_RUN;
  });
});
