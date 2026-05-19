const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const CsvResource = require('./csv_resource');
const JiraResource = require('./jira_resource');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_TOKEN = process.env.JIRA_PERSONAL_TOKEN;
const csvPath = process.env.CSV_DEFAULT_PATH || path.join(__dirname, 'test_steps.csv');

const hasJiraConfig = !!(JIRA_BASE_URL && JIRA_TOKEN);
const csvExists = fs.existsSync(csvPath);

let csvResource;
let tests = [];

beforeAll(async () => {
    csvResource = new CsvResource();
    if (csvExists) {
        try {
            tests = await csvResource.readBulkCsv(csvPath);
        } catch (e) {
            // tests stays empty
        }
    }
});

describe('CSV Validation (local)', () => {
    test('CSV file exists', () => {
        expect(csvExists).toBe(true);
    });

    test('CSV contains at least one test block', () => {
        expect(tests.length).toBeGreaterThan(0);
    });

    test('All blocks have non-empty Title', () => {
        tests.forEach((t, i) => {
            expect(t.title).toBeTruthy();
        });
    });

    test('All blocks have at least one step', () => {
        tests.forEach((t, i) => {
            expect(t.steps.length).toBeGreaterThan(0);
        });
    });

    test('Steps have Action column filled', () => {
        tests.forEach((t, ti) => {
            t.steps.forEach((step, si) => {
                expect(step.fields.Action).toBeTruthy();
            });
        });
    });

    test('All blocks have valid Description', () => {
        tests.forEach((t, i) => {
            expect(typeof t.description).toBe('string');
        });
    });

    test('Description does not contain raw CSV step data', () => {
        tests.forEach((t, i) => {
            const stepMarkers = ['Action,Data,Expected Result', 'Action,Data,'];
            const hasLeak = stepMarkers.some(m => t.description.includes(m));
            expect(hasLeak).toBe(false);
        });
    });

    test('Pre-condition type is valid', () => {
        tests.forEach((t, i) => {
            if (t.precondition) {
                expect(['reference', 'inline']).toContain(t.precondition.type);
                expect(t.precondition.value).toBeTruthy();
            }
        });
    });

    test('Linked Issues have key and linkType', () => {
        tests.forEach((t, i) => {
            (t.linkedIssues || []).forEach((li, j) => {
                expect(li.key).toBeTruthy();
                expect(li.linkType).toBeTruthy();
            });
        });
    });
});

const jiraSuite = hasJiraConfig ? describe : describe.skip;

jiraSuite('CSV Validation against Jira', () => {
    let jiraResource;
    let projectName;
    let projectId;
    let issueTypes;
    let validationErrors = [];

    beforeAll(async () => {
        jiraResource = new JiraResource(JIRA_TOKEN, JIRA_BASE_URL + '/rest/api/2');

        const projectFromTitle = tests.length > 0
            ? (tests[0].title.match(/^([A-Z][A-Z0-9]+)/) || [])[1]
            : null;
        projectName = process.env.JIRA_PROJECT || projectFromTitle || 'ECSPOL';

        try {
            const projectData = await jiraResource.getJiraResource(`project/${projectName}`);
            projectId = projectData ? projectData.id : null;
            issueTypes = projectData && Array.isArray(projectData.issueTypes) && projectData.issueTypes.length > 0
                ? projectData.issueTypes
                : null;
        } catch (e) {
            projectId = null;
            issueTypes = null;
        }
    });

    test('Project exists', () => {
        expect(projectId).toBeTruthy();
    });

    test('Issue type "Test" is available in project', () => {
        expect(issueTypes).toBeTruthy();
        const hasTestType = issueTypes.some(it => it.name === 'Test');
        expect(hasTestType).toBe(true);
    });

    test('Pre-conditions (reference) exist in Jira', async () => {
        const refPre = tests
            .map(t => t.precondition)
            .filter(p => p && p.type === 'reference');

        if (refPre.length === 0) return;

        const results = await Promise.allSettled(
            refPre.map(p => jiraResource.getJiraResource(`issue/${p.value}`))
        );

        const failures = results
            .map((r, i) => ({ r, key: refPre[i].value }))
            .filter(({ r }) => r.status === 'rejected' || !r.value);

        if (failures.length > 0) {
            const msg = failures.map(f => `${f.key} nao encontrada`).join('; ');
            throw new Error(msg);
        }
    }, 30000);

    test('Linked issues exist in Jira', async () => {
        const allLinked = tests.flatMap(t => t.linkedIssues || []);
        if (allLinked.length === 0) return;

        const results = await Promise.allSettled(
            allLinked.map(li => jiraResource.getJiraResource(`issue/${li.key}`))
        );

        const failures = results
            .map((r, i) => ({ r, key: allLinked[i].key }))
            .filter(({ r }) => r.status === 'rejected' || !r.value);

        if (failures.length > 0) {
            const msg = failures.map(f => `${f.key} nao encontrada`).join('; ');
            throw new Error(msg);
        }
    }, 30000);

    test('Steps format is compatible with Xray', () => {
        tests.forEach((t, ti) => {
            t.steps.forEach((step, si) => {
                expect(step.fields).toBeDefined();
                expect(step.fields.Action).toBeDefined();
                expect(step.fields.Data).toBeDefined();
                expect(step.fields['Expected Result']).toBeDefined();
            });
        });
    });
});
