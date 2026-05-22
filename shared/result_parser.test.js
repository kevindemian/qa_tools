const path = require('path');
const fs = require('fs');
const { parseMochawesome, parseCypressResults } = require('./result_parser');

const SAMPLE_MOCHAWESOME = {
    stats: { passes: 2, failures: 1, pending: 1, tests: 4, duration: 5000 },
    results: [{
        suites: [{
            title: 'Login Tests',
            tests: [
                { title: 'TC01 - Login valido', state: 'passed', duration: 300 },
                { title: 'TC02 - Login invalido', state: 'failed', duration: 200, err: [{ message: 'AssertionError' }] },
            ],
            suites: [{
                title: 'Edge cases',
                tests: [
                    { title: 'TC03 - Empty password', state: 'pending', duration: 0 },
                ],
            }],
        }, {
            title: 'Logout Tests',
            tests: [
                { title: 'TC04 - Logout', state: 'passed', duration: 150 },
            ],
        }],
    }],
};

describe('parseMochawesome', () => {
    it('extracts all tests flat from nested suites', () => {
        const result = parseMochawesome(SAMPLE_MOCHAWESOME);
        expect(result.tests).toHaveLength(4);
        expect(result.tests[0].title).toBe('TC01 - Login valido');
        expect(result.tests[0].state).toBe('passed');
        expect(result.tests[1].state).toBe('failed');
        expect(result.tests[2].state).toBe('skipped');
        expect(result.tests[3].state).toBe('passed');
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
        const result = parseMochawesome(null);
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
        expect(result.tests[0].state).toBe('skipped');
    });
});

describe('parseCypressResults', () => {
    const tmpFile = path.join(require('os').tmpdir(), 'qa-test-mochawesome-' + Date.now() + '.json');

    beforeEach(() => {
        fs.writeFileSync(tmpFile, JSON.stringify(SAMPLE_MOCHAWESOME), 'utf8');
    });

    afterEach(() => {
        try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
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
        require('fs').writeFileSync(invalidFile, 'not json', 'utf8');
        const result = parseCypressResults(invalidFile);
        expect(result.error).toContain('Erro ao ler/parsear');
        try { require('fs').unlinkSync(invalidFile); } catch (e) { /* ignore */ }
    });
});
