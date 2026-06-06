import { sanitizeHtml } from './escape.js';

describe('sanitizeHtml', () => {
    it('escapes ampersand', async () => {
        expect(sanitizeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes less-than', async () => {
        expect(sanitizeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes greater-than', async () => {
        expect(sanitizeHtml('5 > 3')).toBe('5 &gt; 3');
    });

    it('escapes double quote', async () => {
        expect(sanitizeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes apostrophe', async () => {
        expect(sanitizeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes all five characters together', async () => {
        const input = `<a href="test" title='foo'>&</a>`;
        const expected = '&lt;a href=&quot;test&quot; title=&#39;foo&#39;&gt;&amp;&lt;/a&gt;';
        expect(sanitizeHtml(input)).toBe(expected);
    });

    it('returns empty string unchanged', async () => {
        expect(sanitizeHtml('')).toBe('');
    });

    it('returns string with no special chars unchanged', async () => {
        expect(sanitizeHtml('hello world 123')).toBe('hello world 123');
    });

    it('handles multiple occurrences of the same character', async () => {
        expect(sanitizeHtml('<<<>>>&&&"""\'\'\'')).toBe(
            '&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;&quot;&quot;&quot;&#39;&#39;&#39;',
        );
    });
});
