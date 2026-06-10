import { sanitizeHtml } from './escape.js';

describe('sanitizeHtml', () => {
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
});
