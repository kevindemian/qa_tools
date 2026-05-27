import path from 'path';
import fs from 'fs';
import os from 'os';
import { parseMochawesome, parseCypressResults } from './result_parser';

const SAMPLE_MOCHAWESOME = {
    stats: { passes: 2, failures: 1, pending: 1, tests: 4, duration: 5000 },
    results: [
        {
            suites: [
                {
                    title: 'Login Tests',
                    tests: [
                        { title: 'TC01 - Login valido', state: 'passed', duration: 300 },
                        {
                            title: 'TC02 - Login invalido',
                            state: 'failed',
                            duration: 200,
                            err: [{ message: 'AssertionError' }],
                        },
                    ],
                    suites: [
                        {
                            title: 'Edge cases',
                            tests: [{ title: 'TC03 - Empty password', state: 'pending', duration: 0 }],
                        },
                    ],
                },
                {
                    title: 'Logout Tests',
                    tests: [{ title: 'TC04 - Logout', state: 'passed', duration: 150 }],
                },
            ],
        },
    ],
};

describe('parseMochawesome', () => {
    it('extracts all tests flat from nested suites', () => {
        const result = parseMochawesome(SAMPLE_MOCHAWESOME);
        expect(result.tests).toHaveLength(4);
        expect(result.tests[0]!.title).toBe('TC01 - Login valido');
        expect(result.tests[0]!.fullTitle).toContain('Login Tests > TC01 - Login valido');
        expect(result.tests[0]!.state).toBe('passed');
        expect(result.tests[1]!.state).toBe('failed');
        expect(result.tests[2]!.state).toBe('skipped');
        expect(result.tests[3]!.state).toBe('passed');
    });

    it('returns correct stats', () => {
        const result = parseMochawesome(SAMPLE_MOCHAWESOME);
        expect(result.stats.passed).toBe(2);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.skipped).toBe(1);
        expect(result.stats.total).toBe(4);
        expect(result.stats.duration).toBe(5000);
    });

    it('returns empty for null input', () => {
        const result = parseMochawesome(null as never);
        expect(result.tests).toEqual([]);
        expect(result.stats.total).toBe(0);
    });

    it('returns empty for input without results', () => {
        const result = parseMochawesome({});
        expect(result.tests).toEqual([]);
    });

    it('maps pending state to skipped', () => {
        const input = {
            results: [{ suites: [{ tests: [{ title: 'X', state: 'pending', duration: 0 }] }] }],
        };
        const result = parseMochawesome(input);
        expect(result.tests[0]!.state).toBe('skipped');
    });

    it('_flattenTests skips suite without tests and processes nested suites', () => {
        const input = {
            results: [
                {
                    suites: [
                        {
                            suites: [
                                {
                                    title: 'Nested',
                                    tests: [{ title: 'TC01', state: 'passed', duration: 100 }],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const result = parseMochawesome(input);
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0]!.title).toBe('TC01');
    });

    it('defaults missing state to pending (mapped to skipped)', () => {
        const input = {
            results: [{ suites: [{ tests: [{ title: 'TC01' }] }] }],
        };
        const result = parseMochawesome(input);
        expect(result.tests[0]!.state).toBe('skipped');
    });

    it('defaults missing title to empty string and missing duration to 0', () => {
        const input = {
            results: [{ suites: [{ tests: [{ state: 'passed' }] }] }],
        };
        const result = parseMochawesome(input);
        expect(result.tests[0]!.title).toBe('');
        expect(result.tests[0]!.duration).toBe(0);
    });

    it('handles result without suites property', () => {
        const input = {
            results: [{}],
        };
        const result = parseMochawesome(input);
        expect(result.tests).toEqual([]);
        expect(result.stats.total).toBe(0);
    });
});

describe('parseCypressResults', () => {
    const tmpFile = path.join(os.tmpdir(), 'qa-test-mochawesome-' + Date.now() + '.json');

    beforeEach(() => {
        fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_MOCHAWESOME), 'utf8');
    });

    afterEach(() => {
        try {
            fs.unlinkSync(tmpFile);
        } catch (e) {
            /* ignore */
        }
    });

    it('reads JSON file and parses it', () => {
        const result = parseCypressResults(tmpFile);
        expect(result.tests).toHaveLength(4);
        expect(result.stats.passed).toBe(2);
    });

    it('returns error object for nonexistent file', () => {
        const result = parseCypressResults('/nonexistent-' + Date.now() + '.json');
        expect(result.error).toContain('Arquivo não encontrado');
        expect(result.stats.total).toBe(0);
        expect(result.tests).toEqual([]);
    });

    it('returns error for invalid JSON content', () => {
        const invalidFile = tmpFile + '-invalid.json';
        fs.writeFileSync(invalidFile, 'not json', 'utf8');
        const result = parseCypressResults(invalidFile);
        expect(result.error).toContain('Erro ao ler/parsear');
        try {
            fs.unlinkSync(invalidFile);
        } catch (e) {
            /* ignore */
        }
    });
});

const CTRF_SAMPLE = {
    results: {
        tool: { name: 'cypress' },
        summary: { tests: 3, passed: 2, failed: 1, skipped: 0, pending: 0, other: 0, start: 1000, stop: 5000 },
        environment: { appName: 'QA Tools', buildName: 'Release', buildNumber: '100' },
        tests: [
            { name: 'Login', status: 'passed', duration: 100, suite: 'Auth' },
            { name: 'Logout', status: 'failed', duration: 200, suite: 'Auth', message: 'Assertion failed' },
            { name: 'Dashboard', status: 'passed', duration: 150, suite: 'UI' },
        ],
    },
};

const CTRF_EMPTY = {
    results: {
        summary: { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 0 },
        tests: [],
    },
};

describe('isCtrfFormat', () => {
    const { isCtrfFormat } = require('./result_parser');

    it('detects CTRF format by results.tests + results.summary', () => {
        expect(isCtrfFormat(CTRF_SAMPLE)).toBe(true);
    });

    it('rejects null/undefined', () => {
        expect(isCtrfFormat(null)).toBe(false);
        expect(isCtrfFormat(undefined)).toBe(false);
    });

    it('rejects plain object without results.tests', () => {
        expect(isCtrfFormat({})).toBe(false);
    });
});

describe('parseCtrfResults', () => {
    const { parseCtrfResults } = require('./result_parser');

    it('extracts all tests from CTRF format', () => {
        const result = parseCtrfResults(CTRF_SAMPLE);
        expect(result.tests).toHaveLength(3);
        expect(result.tests[0]!.title).toBe('Login');
        expect(result.tests[0]!.state).toBe('passed');
        expect(result.tests[0]!.fullTitle).toBe('Auth > Login');
    });

    it('captures error message from CTRF format', () => {
        const result = parseCtrfResults(CTRF_SAMPLE);
        expect(result.tests[1]!.error).toBe('Assertion failed');
    });

    it('uses CTRF summary stats when available', () => {
        const result = parseCtrfResults(CTRF_SAMPLE);
        expect(result.stats.passed).toBe(2);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.skipped).toBe(0);
        expect(result.stats.total).toBe(3);
    });

    it('returns empty for missing tests array', () => {
        const result = parseCtrfResults(CTRF_EMPTY);
        expect(result.tests).toEqual([]);
    });

    it('maps pending/other status to skipped', () => {
        const input = {
            results: {
                summary: { tests: 2, passed: 0, failed: 0, skipped: 2, pending: 1, other: 1, start: 0, stop: 0 },
                tests: [
                    { name: 'Pending', status: 'pending', duration: 0 },
                    { name: 'Other', status: 'other', duration: 0 },
                ],
            },
        };
        const result = parseCtrfResults(input);
        expect(result.tests.every((t: { state: string }) => t.state === 'skipped')).toBe(true);
    });

    it('maps explicit skipped status correctly', () => {
        const input = {
            results: {
                summary: { tests: 1, passed: 0, failed: 0, skipped: 1, pending: 0, other: 0, start: 0, stop: 0 },
                tests: [{ name: 'Skippy', status: 'skipped', duration: 0 }],
            },
        };
        const result = parseCtrfResults(input);
        expect(result.tests[0]!.state).toBe('skipped');
    });

    it('falls back to computed stats when summary fields are missing', () => {
        const input = {
            results: {
                summary: { tests: 2, passed: 1, failed: 1, skipped: 0, pending: 0, other: 0, start: 0, stop: 0 },
                tests: [
                    { name: 'T1', status: 'passed', duration: 100 },
                    { name: 'T2', status: 'failed', duration: 200 },
                ],
            },
        };
        const result = parseCtrfResults(input);
        expect(result.stats.passed).toBe(1);
        expect(result.stats.failed).toBe(1);
        expect(result.stats.total).toBe(2);
    });
});

describe('parseTestResults (dispatch)', () => {
    const { parseTestResults } = require('./result_parser');

    it('routes CTRF format to parseCtrfResults', () => {
        const result = parseTestResults(CTRF_SAMPLE);
        expect(result.tests).toHaveLength(3);
        expect(result.stats.passed).toBe(2);
    });

    it('routes Mochawesome format to parseMochawesome', () => {
        const mochaInput = {
            stats: { duration: 100 },
            results: [{ suites: [{ tests: [{ title: 'Mocha Test', state: 'passed', duration: 100 }] }] }],
        };
        const result = parseTestResults(mochaInput);
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0]!.title).toBe('Mocha Test');
    });

    it('returns empty for unknown format', () => {
        const result = parseTestResults({ unexpected: true });
        expect(result.tests).toEqual([]);
    });

    it('returns empty for null input', () => {
        expect(parseTestResults(null).tests).toEqual([]);
    });

    it('returns empty for undefined input', () => {
        expect(parseTestResults(undefined).tests).toEqual([]);
    });

    it('returns empty for empty object', () => {
        expect(parseTestResults({}).tests).toEqual([]);
    });
});

describe('parseTestResultsFile', () => {
    const { parseTestResultsFile } = require('./result_parser');

    it('reads CTRF file and parses it', () => {
        const path = require('path');
        const fixtures = path.join(__dirname, '../e2e/fixtures');
        const result = parseTestResultsFile(path.join(fixtures, 'ctrf-report.json'));
        expect(result.tests).toHaveLength(4);
        expect(result.stats.passed).toBe(2);
        expect(result.stats.failed).toBe(1);
    });

    it('reads Mochawesome file via dispatch', () => {
        const path = require('path');
        const fixtures = path.join(__dirname, '../e2e/fixtures');
        const result = parseTestResultsFile(path.join(fixtures, 'mochawesome.json'));
        expect(result.tests).toHaveLength(3);
        expect(result.stats.passed).toBe(2);
    });

    it('returns error for nonexistent file', () => {
        const result = parseTestResultsFile('/nonexistent-' + Date.now() + '.json');
        expect(result.error).toContain('Arquivo não encontrado');
    });
});
