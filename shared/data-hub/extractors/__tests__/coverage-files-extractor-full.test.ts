import { describe, expect, it } from 'vitest';
import { extractCoverageFiles } from '../coverage-files-extractor.js';

const ISTANBUL = JSON.stringify({
    'src/a.ts': { lines: { total: 10, covered: 7 }, branches: { total: 4, covered: 2 } },
    'src/b.ts': { lines: { total: 5, covered: 5 } },
});

const COBERTURA = `<?xml version="1.0"?>
<coverage line-rate="0.8">
  <packages>
    <package name="pkg">
      <classes>
        <class name="C" filename="src/c.ts">
          <lines>
            <line number="1" hits="1" condition-coverage="50% (1/2)"/>
            <line number="2" hits="0"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

const JACOCO = `<?xml version="1.0"?>
<report name="r">
  <package name="com/x">
    <sourcefile name="D.java">
      <counter type="LINE" missed="1" covered="9"/>
      <counter type="BRANCH" missed="2" covered="2"/>
      <counter type="METHOD" missed="0" covered="3"/>
    </sourcefile>
  </package>
</report>`;

describe('DataHub/extractors/coverage-files — extractCoverageFiles', () => {
    describe('Istanbul Json-summary', () => {
        it('parses per-file lines and sub-metrics', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('coverage-final.json', Buffer.from(ISTANBUL));

            expect(out.files).toHaveLength(2);

            const a = out.files.find((f) => f.file === 'src/a.ts');

            expect(a?.lines).toStrictEqual({ total: 10, covered: 7, percentage: 70 });
            expect(a?.branches).toStrictEqual({ total: 4, covered: 2, percentage: 50 });
        });

        it('omits percentage when total is zero (never fabricated)', () => {
            expect.hasAssertions();

            const json = JSON.stringify({ 'src/z.ts': { lines: { total: 0, covered: 0 } } });
            const out = extractCoverageFiles('coverage-summary.json', Buffer.from(json));

            expect(out.files[0]?.lines).toStrictEqual({ total: 0, covered: 0 });
            expect('percentage' in (out.files[0]?.lines ?? {})).toBeFalsy();
        });

        it('records errors for malformed entries (not silently dropped)', () => {
            expect.hasAssertions();

            const json = JSON.stringify({
                'src/bad.ts': { lines: 'not-an-object' },
                'src/bad2.ts': { lines: { total: 5 } },
                'src/covered-gt-total.ts': { lines: { total: 3, covered: 9 } },
            });
            const out = extractCoverageFiles('coverage-final.json', Buffer.from(json));

            expect(out.files).toHaveLength(0);
            expect(out.errors).toHaveLength(3);
        });

        it('records an error for invalid JSON', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('coverage-final.json', Buffer.from('{not json'));

            expect(out.files).toHaveLength(0);
            expect(out.errors[0]?.reason).toMatch(/invalid JSON/);
        });

        it('records an error when root is not an object', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('coverage-final.json', Buffer.from('[1,2,3]'));

            expect(out.errors[0]?.reason).toBe('root is not an object');
        });
    });

    describe('Cobertura', () => {
        it('aggregates line hits and condition coverage per file', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('cobertura-coverage.xml', Buffer.from(COBERTURA));

            expect(out.files).toHaveLength(1);

            const c = out.files[0];

            expect(c?.file).toBe('src/c.ts');
            expect(c?.lines).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
            expect(c?.branches).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
        });

        it('records an error when coverage root is missing (non-coverage XML)', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('cobertura.xml', Buffer.from('<notcoverage/>'));

            expect(out.errors[0]?.reason).toBe('missing <coverage> root');
        });

        it('records an error when coverage root is missing', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('cobertura.xml', Buffer.from('<notcoverage/>'));

            expect(out.errors[0]?.reason).toBe('missing <coverage> root');
        });
    });

    describe('Jacoco', () => {
        it('parses sourcefile counters with package prefix', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('jacoco.xml', Buffer.from(JACOCO));

            expect(out.files).toHaveLength(1);

            const d = out.files[0];

            expect(d?.file).toBe('com/x/D.java');
            expect(d?.lines).toStrictEqual({ total: 10, covered: 9, percentage: 90 });
            expect(d?.branches).toStrictEqual({ total: 4, covered: 2, percentage: 50 });
        });

        it('records an error when report root is missing', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('jacoco.xml', Buffer.from('<notreport/>'));

            expect(out.errors[0]?.reason).toBe('missing <report> root');
        });
    });

    describe('Dispatch / unknown', () => {
        it('records an error for an unrecognized format', () => {
            expect.hasAssertions();

            const out = extractCoverageFiles('random.txt', Buffer.from('just text, no coverage markers'));

            expect(out.files).toHaveLength(0);
            expect(out.errors[0]?.reason).toBe('unrecognized coverage format');
        });

        it('ignores non-coverage zip entries but parses coverage ones', async () => {
            expect.hasAssertions();

            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip();
            zip.addFile('README.md', Buffer.from('not coverage'));
            zip.addFile('coverage-final.json', Buffer.from(ISTANBUL));
            const out = extractCoverageFiles('archive.zip', zip.toBuffer());

            expect(out.files).toHaveLength(2);
        });
    });
});
