import { describe, it, expect } from 'vitest';
import { parseJUnitXml } from '../junit-xml-parser.js';

describe('parseJUnitXml', () => {
    it('R1: JUnit XML válido retorna FlatTest[] e stats', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="MySuite" tests="2" failures="1" errors="0" skipped="0" time="1.5">
  <testcase name="test1" classname="MyClass" time="0.5"/>
  <testcase name="test2" classname="MyClass" time="1.0">
    <failure message="assertion failed"/>
  </testcase>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests).toHaveLength(2);
        expect(result!.stats).toEqual({
            passed: 1,
            failed: 1,
            skipped: 0,
            total: 2,
            duration: 1.5,
        });
    });

    it('R2: captura failure messages', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="1" failures="1" time="0.5">
  <testcase name="t1" classname="C" time="0.5">
    <failure message="Expected true, got false"/>
  </testcase>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests[0]!.status).toBe('failed');
        expect(result!.tests[0]!.message).toBe('Expected true, got false');
    });

    it('R3: conta skipped corretamente', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="3" failures="0" errors="0" skipped="1" time="1.0">
  <testcase name="t1" classname="C" time="0.3"/>
  <testcase name="t2" classname="C" time="0.3">
    <skipped/>
  </testcase>
  <testcase name="t3" classname="C" time="0.4"/>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.stats).toEqual({
            passed: 2,
            failed: 0,
            skipped: 1,
            total: 3,
            duration: 1.0,
        });
    });

    it('R4: retorna null para XML inválido', () => {
        const result = parseJUnitXml('not valid xml');
        expect(result).toBeNull();
    });

    it('R5: retorna stats zerados para XML vazio (0 testes)', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="Empty" tests="0" failures="0" errors="0" skipped="0" time="0">
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.stats).toEqual({
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            duration: 0,
        });
    });

    it('R6: merge de múltiplos testsuites', () => {
        const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="S1" tests="1" failures="0" time="0.3">
    <testcase name="t1" classname="C" time="0.3"/>
  </testsuite>
  <testsuite name="S2" tests="1" failures="0" time="0.7">
    <testcase name="t2" classname="C" time="0.7"/>
  </testsuite>
</testsuites>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests).toHaveLength(2);
        expect(result!.stats.total).toBe(2);
        expect(result!.stats.duration).toBeCloseTo(1.0);
    });

    it('R7: attachment tags não crasham', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="1" failures="0" time="0.5">
  <testcase name="t1" classname="C" time="0.5">
    <system-out>stdout log</system-out>
    <system-err>stderr log</system-err>
  </testcase>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests).toHaveLength(1);
        expect(result!.tests[0]!.status).toBe('passed');
    });

    it('classname ausente não crasha', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="1" failures="0" time="0.5">
  <testcase name="t1" time="0.5"/>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests).toHaveLength(1);
        expect(result!.tests[0]!.classname).toBe('');
    });

    it('failure com stack trace', () => {
        const xml = `<?xml version="1.0"?>
<testsuite name="S" tests="1" failures="1" time="0.5">
  <testcase name="t1" classname="C" time="0.5">
    <failure message="fail">Stack trace here
  line 2</failure>
  </testcase>
</testsuite>`;

        const result = parseJUnitXml(xml);
        expect(result).not.toBeNull();
        expect(result!.tests[0]!.status).toBe('failed');
        expect(result!.tests[0]!.message).toBe('fail');
        expect(result!.tests[0]!.stackTrace).toContain('Stack trace');
    });
});
