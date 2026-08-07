import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Config from '../config-accessor.js';
import { isJiraConfigured } from '../jira/config.js';

describe('IsJiraConfigured (shared/jira/config.ts)', () => {
    const cases: Array<{ name: string; url: string; token: string; expected: boolean }> = [
        { name: 'missing base URL', url: '', token: 'token123', expected: false },
        { name: 'missing personal token', url: 'https://jira.example.com', token: '', expected: false },
        { name: 'placeholder base URL', url: 'https://seu-jira-server', token: 'token123', expected: false },
        {
            name: 'placeholder personal token',
            url: 'https://jira.example.com',
            token: 'seu-token-aqui',
            expected: false,
        },
        { name: 'real values', url: 'https://jira.example.com', token: 'real-token-123', expected: true },
    ];

    beforeEach(() => {
        Config.reset();
        delete process.env['JIRA_BASE_URL'];
        delete process.env['JIRA_PERSONAL_TOKEN'];
    });

    afterEach(() => {
        Config.reset();
        delete process.env['JIRA_BASE_URL'];
        delete process.env['JIRA_PERSONAL_TOKEN'];
    });

    it.each(cases)('returns $expected when $name', ({ url, token, expected }) => {
        process.env['JIRA_BASE_URL'] = url;
        process.env['JIRA_PERSONAL_TOKEN'] = token;

        expect(isJiraConfigured()).toBe(expected);
    });
});
