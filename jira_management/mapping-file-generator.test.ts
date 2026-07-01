import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../shared/logger', () => ({ rootLogger: { warn: vi.fn() } }));
vi.mock('../shared/prompt', () => ({ info: vi.fn(), isQuiet: vi.fn().mockReturnValue(true) }));

const mockReportsDir = vi.hoisted(() => vi.fn());
vi.mock('../shared/temp-dir', () => ({
    reportsDir: mockReportsDir,
}));

import * as prompt from '../shared/prompt.js';
import { nonNull } from '../shared/test-utils.js';
import MappingFileGenerator from './mapping-file-generator.js';

interface MappingJson {
    project: string;
    tests: Array<{
        key: string;
        title: string;
        description?: string;
        steps?: Array<Record<string, string>>;
        precondition?: string;
    }>;
}

describe('MappingFileGenerator', () => {
    let generator: MappingFileGenerator;
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-map-'));
        generator = new MappingFileGenerator();
        vi.clearAllMocks();
        mockReportsDir.mockReturnValue(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns early when tasksId is empty', () => {
        generator.generate('/f.csv', 'P', [], [{ title: '', steps: [] }]);

        expect(fs.readdirSync(path.resolve(tmpDir))).toHaveLength(0);
    });

    it('generate() with valid data creates 3 files with correct content', () => {
        const base = 'my-tests';
        generator.generate(
            '/fake/path/' + base + '.csv',
            'ECSPOL',
            ['K-100', 'K-200'],
            [
                {
                    title: 'Login test',
                    description: 'Verifies login flow',
                    steps: [{ fields: { Action: 'Type user', Data: 'admin', 'Expected Result': 'OK' } }],
                },
                {
                    title: 'Logout test',
                    steps: [{ fields: { Action: 'Click logout', Data: '', 'Expected Result': 'Redirected' } }],
                },
            ],
        );
        const files = fs.readdirSync(path.resolve(tmpDir)).sort((a, b) => a.localeCompare(b));

        expect(files).toStrictEqual([base + '-jira-mapping.json', base + '-jira-mapping.md', base + '-summary.txt']);

        const json = JSON.parse(
            fs.readFileSync(path.resolve(path.join(tmpDir, base + '-jira-mapping.json')), 'utf8'),
        ) as MappingJson;

        expect(json.project).toBe('ECSPOL');
        expect(json.tests).toHaveLength(2);
        expect(nonNull(json.tests[0]).key).toBe('K-100');
        expect(nonNull(json.tests[0]).title).toBe('Login test');
        expect(nonNull(json.tests[0]).description).toBe('Verifies login flow');
        expect(nonNull(nonNull(nonNull(json.tests[0]).steps)[0])['Action']).toBe('Type user');
        expect(nonNull(json.tests[1]).key).toBe('K-200');
    });

    it('generate() writes correct md and txt content', () => {
        const base = 'my-tests';
        generator.generate(
            '/fake/path/' + base + '.csv',
            'ECSPOL',
            ['K-100', 'K-200'],
            [
                {
                    title: 'Login test',
                    description: 'Verifies login flow',
                    steps: [{ fields: { Action: 'Type user', Data: 'admin', 'Expected Result': 'OK' } }],
                },
                {
                    title: 'Logout test',
                    steps: [{ fields: { Action: 'Click logout', Data: '', 'Expected Result': 'Redirected' } }],
                },
            ],
        );

        const md = fs.readFileSync(path.resolve(path.join(tmpDir, base + '-jira-mapping.md')), 'utf8');

        expect(md).toContain('Login test');
        expect(md).toContain('Type user');

        const txt = fs.readFileSync(path.resolve(path.join(tmpDir, base + '-summary.txt')), 'utf8');

        expect(txt).toContain('K-100: Login test');
        expect(txt).toContain('K-200: Logout test');
    });

    it('output directory is created when reportsDir does not exist', () => {
        mockReportsDir.mockReturnValue(tmpDir);
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);

        expect(fs.existsSync(path.resolve(tmpDir))).toBeTruthy();
        expect(fs.readdirSync(path.resolve(tmpDir))).toHaveLength(3);
    });

    it('test without steps still creates JSON, steps omitted from mapping', () => {
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', description: 'd', steps: [] }]);
        const json = JSON.parse(
            fs.readFileSync(path.resolve(path.join(tmpDir, 'f-jira-mapping.json')), 'utf8'),
        ) as MappingJson;

        expect(nonNull(json.tests[0]).steps).toBeUndefined();
    });

    it('test with precondition includes it in JSON and MD', () => {
        generator.generate(
            '/f.csv',
            'P',
            ['K-PRE'],
            [
                {
                    title: 't',
                    steps: [],
                    precondition: { type: 'inline', value: 'must login' },
                },
            ],
        );
        const json = JSON.parse(
            fs.readFileSync(path.resolve(path.join(tmpDir, 'f-jira-mapping.json')), 'utf8'),
        ) as MappingJson;

        expect(nonNull(json.tests[0]).precondition).toBe('must login');

        const md = fs.readFileSync(path.resolve(path.join(tmpDir, 'f-jira-mapping.md')), 'utf8');

        expect(md).toContain('must login');
    });

    it('isQuiet returns false — info() is called', () => {
        const mockIsQuiet = vi.spyOn(prompt, 'isQuiet');
        const mockInfo = vi.spyOn(prompt, 'info');
        mockIsQuiet.mockReturnValue(false);
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);

        expect(mockInfo).toHaveBeenCalledTimes(2);
    });

    it('extra tasksId beyond tests produce empty-key entries', () => {
        generator.generate('/f.csv', 'P', ['KA', 'KB', 'KC'], [{ title: 'only', steps: [] }]);
        const json = JSON.parse(
            fs.readFileSync(path.resolve(path.join(tmpDir, 'f-jira-mapping.json')), 'utf8'),
        ) as MappingJson;

        expect(json.tests).toHaveLength(3);
        expect(nonNull(json.tests[0]).title).toBe('only');
        expect(nonNull(json.tests[1]).title).toBe('');
        expect(nonNull(json.tests[2]).title).toBe('');

        const txt = fs.readFileSync(path.resolve(path.join(tmpDir, 'f-summary.txt')), 'utf8');

        expect(txt).toContain('KB: (untitled)');
    });

    it('steps with empty fields default to empty string', () => {
        generator.generate('/f.csv', 'P', ['KE'], [{ title: 't', steps: [{ fields: {} }] }]);
        const json = JSON.parse(
            fs.readFileSync(path.resolve(path.join(tmpDir, 'f-jira-mapping.json')), 'utf8'),
        ) as MappingJson;

        expect(nonNull(nonNull(nonNull(json.tests[0]).steps)[0])['Action']).toBe('');
        expect(nonNull(nonNull(nonNull(json.tests[0]).steps)[0])['Data']).toBe('');
        expect(nonNull(nonNull(nonNull(json.tests[0]).steps)[0])['Expected Result']).toBe('');
    });
});
