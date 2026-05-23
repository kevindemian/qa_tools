import fs from 'fs';
import path from 'path';
import os from 'os';

jest.mock('../shared/config', () => ({ cypressProjectPath: '' }));
jest.mock('../shared/state', () => ({ load: jest.fn() }));
jest.mock('../shared/logger', () => ({ rootLogger: { warn: jest.fn() } }));
jest.mock('../shared/prompt', () => ({ info: jest.fn(), isQuiet: jest.fn().mockReturnValue(true) }));

import MappingFileGenerator from './mapping-file-generator';

describe('MappingFileGenerator', () => {
    let generator: MappingFileGenerator;
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-map-'));
        generator = new MappingFileGenerator();
        jest.clearAllMocks();
        const cfg = require('../shared/config') as { cypressProjectPath: string };
        cfg.cypressProjectPath = tmpDir;
        const st = require('../shared/state') as { load: jest.Mock };
        st.load.mockReturnValue({});
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns early when cypressProjectPath is empty and load() has no lastCypressPath', () => {
        const cfg = require('../shared/config') as { cypressProjectPath: string };
        cfg.cypressProjectPath = '';
        const st = require('../shared/state') as { load: jest.Mock };
        st.load.mockReturnValue({});
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: '', steps: [] }]);
        expect(fs.readdirSync(tmpDir)).toHaveLength(0);
    });

    it('uses load().lastCypressPath when cypressProjectPath is empty', () => {
        const cfg = require('../shared/config') as { cypressProjectPath: string };
        cfg.cypressProjectPath = '';
        const st = require('../shared/state') as { load: jest.Mock };
        st.load.mockReturnValue({ lastCypressPath: tmpDir });
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);
        expect(fs.readdirSync(tmpDir)).toHaveLength(3);
    });

    it('returns early when tasksId is empty', () => {
        generator.generate('/f.csv', 'P', [], [{ title: '', steps: [] }]);
        expect(fs.readdirSync(tmpDir)).toHaveLength(0);
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
                    steps: [{ fields: { Action: 'Type user', Data: 'admin', ExpectedResult: 'OK' } }],
                },
                {
                    title: 'Logout test',
                    steps: [{ fields: { Action: 'Click logout', Data: '', ExpectedResult: 'Redirected' } }],
                },
            ],
        );
        const files = fs.readdirSync(tmpDir).sort();
        expect(files).toEqual([base + '-jira-mapping.json', base + '-jira-mapping.md', base + '-summary.txt']);
        const json = JSON.parse(fs.readFileSync(path.join(tmpDir, base + '-jira-mapping.json'), 'utf8'));
        expect(json.project).toBe('ECSPOL');
        expect(json.tests).toHaveLength(2);
        expect(json.tests[0].key).toBe('K-100');
        expect(json.tests[0].title).toBe('Login test');
        expect(json.tests[0].description).toBe('Verifies login flow');
        expect(json.tests[0].steps[0].Action).toBe('Type user');
        expect(json.tests[1].key).toBe('K-200');
        expect(json.tests[1].title).toBe('Logout test');
        const md = fs.readFileSync(path.join(tmpDir, base + '-jira-mapping.md'), 'utf8');
        expect(md).toContain('Login test');
        expect(md).toContain('Type user');
        const txt = fs.readFileSync(path.join(tmpDir, base + '-summary.txt'), 'utf8');
        expect(txt).toContain('K-100: Login test');
        expect(txt).toContain('K-200: Logout test');
    });

    it('output directory does not exist and is created automatically', () => {
        const nestedDir = path.join(tmpDir, 'nested', 'deep');
        const cfg = require('../shared/config') as { cypressProjectPath: string };
        cfg.cypressProjectPath = nestedDir;
        expect(fs.existsSync(nestedDir)).toBe(false);
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);
        expect(fs.existsSync(nestedDir)).toBe(true);
        expect(fs.readdirSync(nestedDir)).toHaveLength(3);
    });

    it('test without steps still creates JSON, steps omitted from mapping', () => {
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', description: 'd', steps: [] }]);
        const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'f-jira-mapping.json'), 'utf8'));
        expect(json.tests[0].steps).toBeUndefined();
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
        const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'f-jira-mapping.json'), 'utf8'));
        expect(json.tests[0].precondition).toBe('must login');
        const md = fs.readFileSync(path.join(tmpDir, 'f-jira-mapping.md'), 'utf8');
        expect(md).toContain('must login');
    });

    it('isQuiet returns false — info() is called', () => {
        const p = require('../shared/prompt') as { info: jest.Mock; isQuiet: jest.Mock };
        p.isQuiet.mockReturnValue(false);
        generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);
        expect(p.info).toHaveBeenCalledTimes(2);
    });

    it('mkdir fails — warns and returns early', () => {
        const origExistsSync = fs.existsSync;
        const origMkdirSync = fs.mkdirSync;
        fs.existsSync = () => false;
        fs.mkdirSync = () => {
            throw new Error('EPERM');
        };
        try {
            generator.generate('/f.csv', 'P', ['K-1'], [{ title: 't', steps: [] }]);
            const l = require('../shared/logger') as { rootLogger: { warn: jest.Mock } };
            expect(l.rootLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Não foi possível criar diretório de saida'),
            );
        } finally {
            fs.existsSync = origExistsSync;
            fs.mkdirSync = origMkdirSync;
        }
    });

    it('extra tasksId beyond tests produce empty-key entries', () => {
        generator.generate('/f.csv', 'P', ['KA', 'KB', 'KC'], [{ title: 'only', steps: [] }]);
        const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'f-jira-mapping.json'), 'utf8'));
        expect(json.tests).toHaveLength(3);
        expect(json.tests[0].title).toBe('only');
        expect(json.tests[1].title).toBe('');
        expect(json.tests[2].title).toBe('');
        const txt = fs.readFileSync(path.join(tmpDir, 'f-summary.txt'), 'utf8');
        expect(txt).toContain('KB: (sem titulo)');
    });

    it('steps with empty fields default to empty string', () => {
        generator.generate('/f.csv', 'P', ['KE'], [{ title: 't', steps: [{ fields: {} }] }]);
        const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'f-jira-mapping.json'), 'utf8'));
        expect(json.tests[0].steps[0].Action).toBe('');
        expect(json.tests[0].steps[0].Data).toBe('');
        expect(json.tests[0].steps[0].ExpectedResult).toBe('');
    });
});
