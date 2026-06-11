import { validateRequiredEnv } from './config-validator.js';

describe('validateRequiredEnv', () => {
    const REQUIRED = ['JIRA_BASE_URL', 'JIRA_PERSONAL_TOKEN', 'XRAY_BASE_URL'];

    beforeEach(() => {
        REQUIRED.forEach((v) => delete process.env[v]);
    });

    afterAll(() => {
        REQUIRED.forEach((v) => delete process.env[v]);
    });

    it('throws when JIRA_BASE_URL is missing', () => {
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        process.env['XRAY_BASE_URL'] = 'url';
        expect(() => validateRequiredEnv()).toThrow(/Jira base URL/);
    });

    it('throws when JIRA_PERSONAL_TOKEN is missing', () => {
        process.env['JIRA_BASE_URL'] = 'url';
        process.env['XRAY_BASE_URL'] = 'url';
        expect(() => validateRequiredEnv()).toThrow(/Jira personal token/);
    });

    it('throws when XRAY_BASE_URL is missing', () => {
        process.env['JIRA_BASE_URL'] = 'url';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok';
        expect(() => validateRequiredEnv()).toThrow(/Xray base URL/);
    });

    it('passes when all required env vars are set', () => {
        process.env['JIRA_BASE_URL'] = 'https://jira.example.com';
        process.env['JIRA_PERSONAL_TOKEN'] = 'tok-123';
        process.env['XRAY_BASE_URL'] = 'https://xray.example.com';
        expect(() => validateRequiredEnv()).not.toThrow();
    });
});
