import { sanitizeForLlm, truncateStacktrace } from './sanitize';

describe('sanitizeForLlm', () => {
    it('sanitizes Bearer tokens', () => {
        expect(sanitizeForLlm('Authorization: Bearer sk-abc123def456')).toContain('[...sanitized]');
    });

    it('sanitizes OpenAI-style API keys', () => {
        expect(sanitizeForLlm('key=sk-' + 'a'.repeat(30))).toContain('[...sanitized]');
    });

    it('sanitizes GitHub tokens', () => {
        expect(sanitizeForLlm('ghp_' + 'a'.repeat(40))).toContain('[...sanitized]');
        expect(sanitizeForLlm('github_pat_' + 'a'.repeat(30))).toContain('[...sanitized]');
    });

    it('sanitizes Google API keys', () => {
        expect(sanitizeForLlm('AIza' + 'a'.repeat(35))).toContain('[...sanitized]');
    });

    it('sanitizes private keys', () => {
        const key = '-----BEGIN PRIVATE KEY-----\nABCDEF123\n-----END PRIVATE KEY-----';
        const result = sanitizeForLlm(key);
        expect(result).toContain('[...sanitized...]');
        expect(result).not.toContain('ABCDEF123');
    });

    it('sanitizes URLs with embedded credentials', () => {
        expect(sanitizeForLlm('https://user:pass@example.com')).toContain('[...sanitized]');
    });

    it('passes through safe text unchanged', () => {
        const safe = 'This is a normal test failure message with no secrets.';
        expect(sanitizeForLlm(safe)).toBe(safe);
    });
});

describe('truncateStacktrace', () => {
    it('does not truncate short stacks', () => {
        const stack = 'Error\n  at line 1\n  at line 2';
        expect(truncateStacktrace(stack, 5)).toBe(stack);
    });

    it('truncates long stacks', () => {
        const lines = Array.from({ length: 30 }, (_, i) => '  at line ' + (i + 1));
        const stack = 'Error\n' + lines.join('\n');
        const result = truncateStacktrace(stack, 10);
        expect(result).toContain('[... truncated');
        expect(result.split('\n')).toHaveLength(11);
    });
});
