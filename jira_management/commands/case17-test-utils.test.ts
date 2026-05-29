jest.mock('fs');

import { resolveMapping, computeDiff, fetchGitHistory } from './case17-test-utils';

describe('resolveMapping', () => {
    const fs = require('fs');
    const OMP = process.env.QA_MAPPING_PATH;

    afterEach(() => {
        process.env.QA_MAPPING_PATH = OMP;
        jest.clearAllMocks();
    });

    it('returns empty map when no mapping file exists', () => {
        fs.existsSync.mockReturnValue(false);
        const map = resolveMapping();
        expect(map.size).toBe(0);
    });

    it('reads mapping from file', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
            JSON.stringify({
                tests: [
                    { title: 'Test 1', key: 'TEST-123' },
                    { title: 'Test 2', key: 'TEST-456' },
                ],
            }),
        );

        const map = resolveMapping();
        expect(map.size).toBe(2);
        expect(map.get('Test 1')).toBe('TEST-123');
        expect(map.get('Test 2')).toBe('TEST-456');
    });

    it('returns empty map when tests field is missing', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));

        const map = resolveMapping();
        expect(map.size).toBe(0);
    });

    it('returns empty map when file is invalid JSON', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('invalid json');

        const map = resolveMapping();
        expect(map.size).toBe(0);
    });

    it('uses QA_MAPPING_PATH env var', () => {
        process.env.QA_MAPPING_PATH = '/custom/path/mapping.json';
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
            JSON.stringify({
                tests: [{ title: 'T1', key: 'K1' }],
            }),
        );

        const map = resolveMapping();
        expect(map.get('T1')).toBe('K1');
        expect(fs.readFileSync).toHaveBeenCalledWith('/custom/path/mapping.json', 'utf8');
    });
});

describe('computeDiff', () => {
    const fs = require('fs');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns empty diff when no previous file exists', () => {
        fs.existsSync.mockReturnValue(false);
        const diff = computeDiff([]);
        expect(diff.newFailures).toHaveLength(0);
        expect(diff.newPasses).toHaveLength(0);
        expect(diff.flaky).toHaveLength(0);
    });

    it('detects new failures and passes', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [
                        { name: 'Test A', status: 'passed' },
                        { name: 'Test B', status: 'failed' },
                    ],
                },
            }),
        );

        const current = [
            { title: 'Test A', state: 'failed', duration: 100, error: 'err' },
            { title: 'Test B', state: 'passed', duration: 50 },
        ];
        const diff = computeDiff(current as never);

        expect(diff.newFailures).toHaveLength(1);
        expect(diff.newFailures[0]!.title).toBe('Test A');
        expect(diff.newPasses).toHaveLength(1);
        expect(diff.newPasses[0]!.title).toBe('Test B');
    });

    it('handles invalid JSON gracefully', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('not json');
        const diff = computeDiff([]);
        expect(diff.newFailures).toHaveLength(0);
    });

    it('handles missing tests field', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({ results: {} }));
        const diff = computeDiff([]);
        expect(diff.newFailures).toHaveLength(0);
    });
});

describe('fetchGitHistory', () => {
    const OGT = process.env.GITHUB_TOKEN;
    const OGR = process.env.GITHUB_REPOSITORY;
    const OJT = process.env.CI_JOB_TOKEN;
    const OIP = process.env.CI_PROJECT_ID;

    afterEach(() => {
        process.env.GITHUB_TOKEN = OGT;
        process.env.GITHUB_REPOSITORY = OGR;
        process.env.CI_JOB_TOKEN = OJT;
        process.env.CI_PROJECT_ID = OIP;
    });

    it('returns empty context when no CI env is set', async () => {
        delete process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_REPOSITORY;
        delete process.env.CI_JOB_TOKEN;
        delete process.env.CI_PROJECT_ID;

        const result = await fetchGitHistory();
        expect(result.commits).toBe('');
        expect(result.runs).toHaveLength(0);
        expect(result.flakyTests).toBe('');
    });
});
