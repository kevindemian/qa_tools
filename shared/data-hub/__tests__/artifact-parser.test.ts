import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdmZip from 'adm-zip';
import type { ArtifactParseResult } from '../artifact-parser.js';

const mockParseCtrfResults = vi.fn();
const mockParseMochawesome = vi.fn();
const mockParseJUnitXml = vi.fn();
const mockRootLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.mock('../../result_parser.js', () => ({
    parseCtrfResults: mockParseCtrfResults,
    parseMochawesome: mockParseMochawesome,
    isCtrfFormat: (data: unknown) => {
        if (typeof data !== 'object' || data === null) return false;
        const obj = data as { [key: string]: unknown };
        if (typeof obj['results'] !== 'object' || obj['results'] === null) return false;
        const results = obj['results'] as { [key: string]: unknown };
        return Array.isArray(results['tests']) && results['summary'] !== null && typeof results['summary'] === 'object';
    },
}));

vi.mock('../../junit-xml-parser.js', () => ({
    parseJUnitXml: mockParseJUnitXml,
}));

vi.mock('../../logger.js', () => ({
    rootLogger: mockRootLogger,
}));

const { parseArtifactBuffer, parseArtifactBufferAll, parseZipBuffer, isCTRF, isJUnit, isMochawesome, isTestArtifact } =
    await import('../../data-hub/artifact-parser.js');

function createZipBuffer(files: Array<{ name: string; content: string }>): Buffer {
    const zip = new AdmZip();
    for (const f of files) {
        zip.addFile(f.name, Buffer.from(f.content, 'utf-8'));
    }
    return zip.toBuffer();
}

describe('IsCTRF', () => {
    it('detects CTRF JSON content', () => {
        const content = JSON.stringify({ results: { tests: [], summary: { tests: 0 } } });

        expect(isCTRF(content)).toBeTruthy();
    });

    it('rejects non-CTRF JSON', () => {
        expect(isCTRF(JSON.stringify({ foo: 'bar' }))).toBeFalsy();
    });

    it('rejects non-JSON content', () => {
        expect(isCTRF('not json')).toBeFalsy();
    });
});

describe('IsJUnit', () => {
    it('detects JUnit XML content', () => {
        expect(isJUnit('<testsuite name="test"><testcase name="t1"/></testsuite>')).toBeTruthy();
    });

    it('detects multiple testsuites', () => {
        expect(isJUnit('<testsuites><testsuite name="t1"/></testsuites>')).toBeTruthy();
    });

    it('rejects non-XML content', () => {
        expect(isJUnit('not xml')).toBeFalsy();
    });

    it('rejects non-JUnit XML', () => {
        expect(isJUnit('<html><body></body></html>')).toBeFalsy();
    });
});

describe('IsMochawesome', () => {
    it('detects Mochawesome JSON content', () => {
        expect(isMochawesome(JSON.stringify({ stats: {}, results: [] }))).toBeTruthy();
    });

    it('rejects non-Mochawesome JSON', () => {
        expect(isMochawesome(JSON.stringify({ foo: 'bar' }))).toBeFalsy();
    });
});

describe('IsTestArtifact', () => {
    it('matches ctrf artifacts', () => {
        expect(isTestArtifact('ctrf-report.json')).toBeTruthy();
    });

    it('matches test-results artifacts', () => {
        expect(isTestArtifact('test-results.zip')).toBeTruthy();
    });

    it('matches test-result artifacts', () => {
        expect(isTestArtifact('test-result.json')).toBeTruthy();
    });

    it('matches mochawesome artifacts', () => {
        expect(isTestArtifact('mochawesome-report.html')).toBeTruthy();
    });

    it('matches junit artifacts', () => {
        expect(isTestArtifact('junit-results.xml')).toBeTruthy();
    });

    it('matches e2e artifacts', () => {
        expect(isTestArtifact('e2e-results.json')).toBeTruthy();
    });

    it('matches test-report artifacts (uploaded by ci.yml)', () => {
        expect(isTestArtifact('test-report')).toBeTruthy();
    });

    it('matches test_report artifacts (underscore variant)', () => {
        expect(isTestArtifact('test_report.json')).toBeTruthy();
    });

    it('rejects generic test alone', () => {
        expect(isTestArtifact('test')).toBeFalsy();
    });

    it('rejects non-test artifacts', () => {
        expect(isTestArtifact('build-output.log')).toBeFalsy();
    });

    it('is case insensitive', () => {
        expect(isTestArtifact('CTRF-Report.JSON')).toBeTruthy();
        expect(isTestArtifact('TEST-RESULTS.ZIP')).toBeTruthy();
    });
});

describe('ParseArtifactBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('r2: retorna ParseResult para CTRF buffer', () => {
        const content = JSON.stringify({
            results: {
                tests: [],
                summary: { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 0 },
            },
        });
        const buffer = Buffer.from(content, 'utf-8');
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 10 },
        });

        const result = parseArtifactBuffer(buffer, 'report.json');

        expect(result).not.toBeNull();

        const r = result as ArtifactParseResult;

        expect(r.fileName).toBe('report.json');
        expect(r.data.tests).toHaveLength(1);
    });

    it('r3: retorna ParseResult para JUnit buffer', () => {
        const buffer = Buffer.from('<testsuite name="test"><testcase name="t1"/></testsuite>', 'utf-8');
        mockParseJUnitXml.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 5 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 5 },
        });

        const result = parseArtifactBuffer(buffer, 'results.xml');

        expect(result).not.toBeNull();

        const r = result as ArtifactParseResult;

        expect(r.fileName).toBe('results.xml');
        expect(r.data.tests).toHaveLength(1);
    });

    it('r4: retorna null para buffer inválido', () => {
        const buffer = Buffer.from('not a valid format', 'utf-8');
        const result = parseArtifactBuffer(buffer, 'unknown.txt');

        expect(result).toBeNull();
    });

    it('r2: extrai CTRF de dentro de ZIP', () => {
        const ctrfContent = JSON.stringify({
            results: {
                tests: [{ name: 't1', status: 'passed', duration: 10 }],
                summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 100, stop: 200 },
            },
        });
        const zipBuf = createZipBuffer([{ name: 'report.json', content: ctrfContent }]);
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        const result = parseArtifactBuffer(zipBuf, 'artifacts.zip');

        expect(result).not.toBeNull();

        const r = result as ArtifactParseResult;

        expect(r.format).toBe('ctrf');
    });
});

describe('ParseZipBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('r5: retorna array vazio para ZIP vazio', () => {
        const zip = new AdmZip();
        const results = parseZipBuffer(zip.toBuffer());

        expect(results).toStrictEqual([]);
    });

    it('r1: retorna resultados para ZIP com CTRF', () => {
        const ctrfContent = JSON.stringify({
            results: {
                tests: [{ name: 't1', status: 'passed', duration: 10 }],
                summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 100, stop: 200 },
            },
        });
        const zipBuf = createZipBuffer([{ name: 'report.json', content: ctrfContent }]);
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        const results = parseZipBuffer(zipBuf);

        expect(results).toHaveLength(1);

        const r0 = results[0] as ArtifactParseResult;

        expect(r0.data.tests).toHaveLength(1);
    });

    it('r6: processa ZIP com múltiplos formatos', () => {
        const ctrfContent = JSON.stringify({
            results: {
                tests: [{ name: 't1', status: 'passed', duration: 10 }],
                summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 100, stop: 200 },
            },
        });
        const zipBuf = createZipBuffer([
            { name: 'ctrf.json', content: ctrfContent },
            { name: 'results.xml', content: '<testsuite name="test"><testcase name="t2"/></testsuite>' },
        ]);
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        mockParseJUnitXml.mockReturnValue({
            tests: [{ title: 't2', state: 'passed', duration: 5 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 5 },
        });

        const results = parseZipBuffer(zipBuf);

        expect(results).toHaveLength(2);
    });
});

describe('ParseArtifactBufferAll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns array with single result for text file', () => {
        const content = JSON.stringify({
            results: {
                tests: [],
                summary: { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 0 },
            },
        });
        const buffer = Buffer.from(content, 'utf-8');
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 10 },
        });

        const results = parseArtifactBufferAll(buffer, 'report.json');

        expect(results).toHaveLength(1);
        expect(results[0]).not.toBeNull();
    });

    it('returns empty array for invalid content', () => {
        const buffer = Buffer.from('not a valid format', 'utf-8');
        const results = parseArtifactBufferAll(buffer, 'unknown.txt');

        expect(results).toStrictEqual([]);
    });

    it('returns all results from ZIP', () => {
        const ctrfContent = JSON.stringify({
            results: {
                tests: [{ name: 't1', status: 'passed', duration: 10 }],
                summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 100, stop: 200 },
            },
        });
        const zipBuf = createZipBuffer([
            { name: 'ctrf.json', content: ctrfContent },
            { name: 'junit.xml', content: '<testsuite name="test"><testcase name="t2"/></testsuite>' },
        ]);
        mockParseCtrfResults.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 10 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });
        mockParseJUnitXml.mockReturnValue({
            tests: [{ title: 't2', state: 'passed', duration: 5 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 5 },
        });

        const results = parseArtifactBufferAll(zipBuf, 'artifacts.zip');

        expect(results).toHaveLength(2);
    });
});
