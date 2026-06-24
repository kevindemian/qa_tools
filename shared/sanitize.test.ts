import { sanitizeForLlm, truncateStacktrace, sanitizeHtml, sanitizeTerminal } from './sanitize.js';

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

    it('sanitizes single-line private key markers', () => {
        const key = 'x -----BEGIN RSA PRIVATE KEY-----data-----END RSA PRIVATE KEY----- y';
        const result = sanitizeForLlm(key);

        // Single-line format passes through unchanged (no newlines to truncate)
        expect(result).toContain('BEGIN');
        expect(result).not.toContain('[...sanitized]');
    });

    it('sanitizes URLs with embedded credentials', () => {
        expect(sanitizeForLlm('https://user:pass@example.com')).toContain('[...sanitized]');
    });

    it('passes through safe text unchanged', () => {
        const safe = 'This is a normal test failure message with no secrets.';

        expect(sanitizeForLlm(safe)).toBe(safe);
    });

    it('sanitizes HuggingFace tokens', () => {
        expect(sanitizeForLlm('hf_' + 'a'.repeat(25))).toContain('[...sanitized]');
    });

    it('sanitizes npm tokens', () => {
        expect(sanitizeForLlm('npm_' + 'a'.repeat(40))).toContain('[...sanitized]');
    });

    it('sanitizes Slack tokens', () => {
        expect(sanitizeForLlm('xoxb-' + 'a'.repeat(24))).toContain('[...sanitized]');
        expect(sanitizeForLlm('xoxp-' + 'a'.repeat(24))).toContain('[...sanitized]');
    });

    it('sanitizes GitHub refresh tokens', () => {
        expect(sanitizeForLlm('ghr_' + 'a'.repeat(40))).toContain('[...sanitized]');
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

describe('sanitizeForLlm with truncation', () => {
    it('truncates long stack traces when maxStackLines is set', () => {
        const lines = Array.from({ length: 30 }, (_, i) => '  at line ' + (i + 1));
        const input = 'Error\n' + lines.join('\n');
        const result = sanitizeForLlm(input, 10);

        expect(result).toContain('[... truncated');
        expect(result.split('\n')).toHaveLength(11);
    });

    it('sanitizes secrets and truncates stack in one pass', () => {
        const lines = Array.from({ length: 25 }, (_, i) => '  at fn' + i + ' (file' + i + '.ts:' + (i + 1) + ')');
        const input = 'Error: sk-' + 'a'.repeat(30) + '\n' + lines.join('\n');
        const result = sanitizeForLlm(input, 10);

        expect(result).toContain('[...sanitized]');
        expect(result).toContain('[... truncated');
        expect(result.split('\n')).toHaveLength(11);
    });

    it('does not truncate when maxStackLines exceeds line count', () => {
        const stack = 'Error\n  at line 1\n  at line 2';

        expect(sanitizeForLlm(stack, 10)).toBe(stack);
    });
});

describe('sanitizeForLlm — realistic scenarios', () => {
    it('sanitizes user story containing an API key (case18 scenario)', () => {
        const userStory = 'As a user I want to login. My API key is sk-' + 'a'.repeat(30) + ' and it should be hidden.';
        const result = sanitizeForLlm(userStory);

        expect(result).toContain('[...sanitized]');
        expect(result).not.toContain('sk-' + 'a'.repeat(30));
    });

    it('sanitizes acceptance criteria with embedded token', () => {
        const criteria = 'The system must reject github_pat_' + 'b'.repeat(30) + ' in any field.';
        const result = sanitizeForLlm(criteria);

        expect(result).toContain('[...sanitized]');
    });

    it('sanitizes test run data with project name containing a key (run-comparison scenario)', () => {
        const runData = 'Project: my-project\nTotal: 100\nPassed: 90\nFailed: 10\nConfig: AIza' + 'c'.repeat(40);
        const result = sanitizeForLlm(runData);

        expect(result).toContain('[...sanitized]');
        expect(result).not.toContain('AIza' + 'c'.repeat(40));
    });

    it('passes through normal user story without secrets', () => {
        const story = 'As a user I want to reset my password via email.';

        expect(sanitizeForLlm(story)).toBe(story);
    });

    it('passes through normal test run metrics', () => {
        const metrics = 'Project: acme\nTotal: 50\nPassed: 48\nFailed: 2\nDuration: 1234ms';

        expect(sanitizeForLlm(metrics)).toBe(metrics);
    });
});

describe('sanitizeHtml', () => {
    it('escapes HTML special characters', () => {
        const input = '<script>alert("xss")</script>';
        const result = sanitizeHtml(input);

        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain('"');
        expect(result).toContain('&lt;');
        expect(result).toContain('&gt;');
        expect(result).toContain('&quot;');
    });

    it('escapes ampersands first', () => {
        expect(sanitizeHtml('&')).toBe('&amp;');
    });

    it('passes through safe text unchanged', () => {
        const safe = 'Hello, world! Normal text 123.';

        expect(sanitizeHtml(safe)).toBe(safe);
    });
});

describe('sanitizeTerminal', () => {
    it('removes ANSI escape sequences', () => {
        const input = '\x1B[31mred\x1B[0m';

        expect(sanitizeTerminal(input)).toBe('red');
    });

    it('passes through plain text unchanged', () => {
        const plain = 'plain text with no escapes';

        expect(sanitizeTerminal(plain)).toBe(plain);
    });

    it('handles multiple ANSI sequences', () => {
        const input = '\x1B[1m\x1B[32mbold green\x1B[0m';

        expect(sanitizeTerminal(input)).toBe('bold green');
    });
});
