import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { parseArtifactBuffer, parseZipBuffer, isCTRF, isJUnit, isMochawesome } =
    await import('../../data-hub/artifact-parser.js');

function createZipBuffer(files: Array<{ name: string; content: string }>): Buffer {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    for (const f of files) {
        zip.addFile(f.name, Buffer.from(f.content, 'utf-8'));
    }
    return zip.toBuffer();
}

describe('isCTRF', () => {
    it('detects CTRF JSON content', () => {
        const content = JSON.stringify({ results: { tests: [], summary: { tests: 0 } } });
        expect(isCTRF(content)).toBe(true);
    });

    it('rejects non-CTRF JSON', () => {
        expect(isCTRF(JSON.stringify({ foo: 'bar' }))).toBe(false);
    });

    it('rejects non-JSON content', () => {
        expect(isCTRF('not json')).toBe(false);
    });
});

describe('isJUnit', () => {
    it('detects JUnit XML content', () => {
        expect(isJUnit('<testsuite name="test"><testcase name="t1"/></testsuite>')).toBe(true);
    });

    it('detects multiple testsuites', () => {
        expect(isJUnit('<testsuites><testsuite name="t1"/></testsuites>')).toBe(true);
    });

    it('rejects non-XML content', () => {
        expect(isJUnit('not xml')).toBe(false);
    });

    it('rejects non-JUnit XML', () => {
        expect(isJUnit('<html><body></body></html>')).toBe(false);
    });
});

describe('isMochawesome', () => {
    it('detects Mochawesome JSON content', () => {
        expect(isMochawesome(JSON.stringify({ stats: {}, results: [] }))).toBe(true);
    });

    it('rejects non-Mochawesome JSON', () => {
        expect(isMochawesome(JSON.stringify({ foo: 'bar' }))).toBe(false);
    });
});

describe('parseArtifactBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('R2: retorna ParseResult para CTRF buffer', () => {
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
        expect(result!.fileName).toBe('report.json');
        expect(result!.data.tests).toHaveLength(1);
    });

    it('R3: retorna ParseResult para JUnit buffer', () => {
        const buffer = Buffer.from('<testsuite name="test"><testcase name="t1"/></testsuite>', 'utf-8');
        mockParseJUnitXml.mockReturnValue({
            tests: [{ title: 't1', state: 'passed', duration: 5 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 5 },
        });

        const result = parseArtifactBuffer(buffer, 'results.xml');
        expect(result).not.toBeNull();
        expect(result!.fileName).toBe('results.xml');
        expect(result!.data.tests).toHaveLength(1);
    });

    it('R4: retorna null para buffer inválido', () => {
        const buffer = Buffer.from('not a valid format', 'utf-8');
        const result = parseArtifactBuffer(buffer, 'unknown.txt');
        expect(result).toBeNull();
    });

    it('R2: extrai CTRF de dentro de ZIP', () => {
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
        expect(result!.format).toBe('ctrf');
    });
});

describe('parseZipBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('R5: retorna array vazio para ZIP vazio', () => {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        const results = parseZipBuffer(zip.toBuffer());
        expect(results).toEqual([]);
    });

    it('R1: retorna resultados para ZIP com CTRF', () => {
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
        expect(results[0]!.data.tests).toHaveLength(1);
    });

    it('R6: processa ZIP com múltiplos formatos', () => {
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
