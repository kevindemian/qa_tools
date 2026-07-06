import { describe, it, expect } from 'vitest';
import { extractTestCounts } from '../../extractors/test-count-extractor.js';

describe('ExtractTestCounts', () => {
    it('r1: CTRF com summary → retorna counts', () => {
        const result = extractTestCounts({
            ctrf: {
                results: {
                    summary: { passed: 10, failed: 2, skipped: 1, total: 13 },
                },
            },
        });

        expect(result).not.toBeNull();

        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(10);
        expect(r.failed).toBe(2);
        expect(r.skipped).toBe(1);
        expect(r.total).toBe(13);
    });

    it('r2: JUnit XML → retorna counts', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="5" failures="1" errors="0" skipped="1" time="2.0">
  <testcase name="t1" classname="C" time="0.5"/>
  <testcase name="t2" classname="C" time="0.5"/>
  <testcase name="t3" classname="C" time="0.5">
    <failure message="fail"/>
  </testcase>
  <testcase name="t4" classname="C" time="0.5">
    <skipped/>
  </testcase>
  <testcase name="t5" classname="C" time="0.0"/>
</testsuite>`;
        const result = extractTestCounts({ junitXml: xml });

        expect(result).not.toBeNull();

        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(3);
        expect(r.failed).toBe(1);
        expect(r.skipped).toBe(1);
        expect(r.total).toBe(5);
    });

    it('r3: Check Run summary → retorna counts', () => {
        const result = extractTestCounts({
            checkRunSummary: 'Tests: 20 passed, 3 failed, 23 total',
        });

        expect(result).not.toBeNull();

        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(20);
        expect(r.failed).toBe(3);
        expect(r.total).toBe(23);
    });

    it('r4: Regex no log → retorna counts', () => {
        const log = 'Tests  15 passed (15)\n  Tests with failures: 2';
        const result = extractTestCounts({ logText: log });

        expect(result).not.toBeNull();

        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(15);
    });

    it('r5: Sem dados → retorna null', () => {
        const result = extractTestCounts({});

        expect(result).toBeNull();
    });

    it('r6: Prioridade: CTRF > JUnit > Check Runs > Regex > User', () => {
        const result = extractTestCounts({
            ctrf: { results: { summary: { passed: 5, failed: 1, skipped: 0, total: 6 } } },
            junitXml: '<?xml version="1.0"?><testsuite name="S" tests="10" failures="2" time="1"/>',
            checkRunSummary: 'Tests: 20 passed, 3 failed, 23 total',
        });
        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(5);
        expect(r.total).toBe(6);
    });

    it('r7: Mochawesome stats → retorna counts', () => {
        const result = extractTestCounts({
            mochawesome: {
                stats: { passes: 8, failures: 2, pending: 1, tests: 11 },
            },
        });

        expect(result).not.toBeNull();

        const r = result as NonNullable<typeof result>;

        expect(r.passed).toBe(8);
        expect(r.failed).toBe(2);
        expect(r.skipped).toBe(1);
        expect(r.total).toBe(11);
    });
});
