import fc from 'fast-check';
import { sanitizeHtml } from './escape.js';

describe('SanitizeHtml', () => {
    it('escapes ampersand', () => {
        expect(sanitizeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes less-than', () => {
        expect(sanitizeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes greater-than', () => {
        expect(sanitizeHtml('5 > 3')).toBe('5 &gt; 3');
    });

    it('escapes double quote', () => {
        expect(sanitizeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes apostrophe', () => {
        expect(sanitizeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes all five characters together', () => {
        const input = `<a href="test" title='foo'>&</a>`;
        const expected = '&lt;a href=&quot;test&quot; title=&#39;foo&#39;&gt;&amp;&lt;/a&gt;';

        expect(sanitizeHtml(input)).toBe(expected);
    });

    it('returns empty string unchanged', () => {
        expect(sanitizeHtml('')).toBe('');
    });

    it('returns string with no special chars unchanged', () => {
        expect(sanitizeHtml('hello world 123')).toBe('hello world 123');
    });

    it('handles multiple occurrences of the same character', () => {
        expect(sanitizeHtml('<<<>>>&&&"""\'\'\'')).toBe(
            '&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;&quot;&quot;&quot;&#39;&#39;&#39;',
        );
    });

    describe('Property-based invariants', () => {
        const SPECIAL = ['&', '<', '>', '"', "'"];

        it('never leaves an unescaped special character in the output', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.string(), (input) => {
                    const out = sanitizeHtml(input);
                    // After escaping, the only allowed occurrences of < > " ' are inside entities;
                    // ampersands must always begin a known entity. Re-escaping the entity-stripped
                    // text must be a no-op, proving no raw special char survived.
                    const stripped = out
                        .replace(/&amp;/g, '')
                        .replace(/&lt;/g, '')
                        .replace(/&gt;/g, '')
                        .replace(/&quot;/g, '')
                        .replace(/&#39;/g, '');

                    expect(SPECIAL.every((ch) => !stripped.includes(ch))).toBeTruthy();
                }),
            );
        });

        it('leaves strings without special characters unchanged', () => {
            expect.hasAssertions();

            const safeString = fc.string().map((s) => s.replace(/[&<>"']/g, ''));
            fc.assert(
                fc.property(safeString, (input) => {
                    expect(sanitizeHtml(input)).toBe(input);
                }),
            );
        });

        it('is deterministic (same input yields same output)', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.string(), (input) => {
                    const first = sanitizeHtml(input);
                    const second = sanitizeHtml(input);

                    expect(first).toBe(second);
                }),
            );
        });

        it('escaping is not shorter than the input (entities are >= 1 char)', () => {
            expect.hasAssertions();

            fc.assert(
                fc.property(fc.string(), (input) => {
                    expect(sanitizeHtml(input).length).toBeGreaterThanOrEqual(input.length);
                }),
            );
        });
    });
});
