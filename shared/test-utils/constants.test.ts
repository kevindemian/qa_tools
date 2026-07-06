import { describe, it, expect } from 'vitest';
import {
    PROJECT_MANAGEMENT_PATH,
    CI_CD_PATH,
    CONTEXT_IDS,
    TEST_CREDENTIALS,
    ACTION_VERSIONS,
    PAGINATION,
} from './constants.js';

describe('Constants', () => {
    describe('PROJECT_MANAGEMENT_PATH', () => {
        it('has correct BASE_URL', () => {
            expect(PROJECT_MANAGEMENT_PATH.BASE_URL).toBe('https://jira.test.com');
        });

        it('has correct API_BASE', () => {
            expect(PROJECT_MANAGEMENT_PATH.API_BASE).toBe('https://jira.test.com/rest/api/2');
        });
    });

    describe('CI_CD_PATH', () => {
        it('has correct GITHUB_API', () => {
            expect(CI_CD_PATH.GITHUB_API).toBe('https://api.github.com');
        });

        it('has correct GITLAB_API', () => {
            expect(CI_CD_PATH.GITLAB_API).toBe('https://gitlab.com');
        });

        it('has correct GITLAB_TEST', () => {
            expect(CI_CD_PATH.GITLAB_TEST).toBe('https://gitlab.test.com');
        });
    });

    describe('CONTEXT_IDS', () => {
        it('has correct ORGANIZATION', () => {
            expect(CONTEXT_IDS.ORGANIZATION).toBe('myorg');
        });

        it('has correct REPOSITORY', () => {
            expect(CONTEXT_IDS.REPOSITORY).toBe('myrepo');
        });

        it('has correct GITLAB_ORGANIZATION', () => {
            expect(CONTEXT_IDS.GITLAB_ORGANIZATION).toBe('owner');
        });

        it('has correct GITLAB_REPOSITORY', () => {
            expect(CONTEXT_IDS.GITLAB_REPOSITORY).toBe('repo');
        });

        it('has correct GITLAB_PROJECT', () => {
            expect(CONTEXT_IDS.GITLAB_PROJECT).toBe('project-123');
        });

        it('has correct DEFAULT_BRANCH', () => {
            expect(CONTEXT_IDS.DEFAULT_BRANCH).toBe('main');
        });

        it('has correct FEATURE_BRANCH', () => {
            expect(CONTEXT_IDS.FEATURE_BRANCH).toBe('feature');
        });
    });

    describe('TEST_CREDENTIALS', () => {
        it('has correct CI_PROVIDER', () => {
            expect(TEST_CREDENTIALS.CI_PROVIDER).toBe('ghp_test');
        });

        it('has correct CI_PROVIDER_GITLAB', () => {
            expect(TEST_CREDENTIALS.CI_PROVIDER_GITLAB).toBe('test-token');
        });

        it('has correct PROJECT_MANAGEMENT', () => {
            expect(TEST_CREDENTIALS.PROJECT_MANAGEMENT).toBe('fake-token');
        });
    });

    describe('ACTION_VERSIONS', () => {
        it('has correct CHECKOUT', () => {
            expect(ACTION_VERSIONS.CHECKOUT).toBe('actions/checkout@v5');
        });

        it('has correct SETUP_NODE', () => {
            expect(ACTION_VERSIONS.SETUP_NODE).toBe('actions/setup-node@v6');
        });

        it('has correct UPLOAD_ARTIFACT', () => {
            expect(ACTION_VERSIONS.UPLOAD_ARTIFACT).toBe('actions/upload-artifact@v7');
        });

        it('has correct DOWNLOAD_ARTIFACT', () => {
            expect(ACTION_VERSIONS.DOWNLOAD_ARTIFACT).toBe('actions/download-artifact@v8');
        });

        it('has correct CODEQL_INIT', () => {
            expect(ACTION_VERSIONS.CODEQL_INIT).toBe('github/codeql-action/init@v3');
        });

        it('has correct CODEQL_AUTOBUILD', () => {
            expect(ACTION_VERSIONS.CODEQL_AUTOBUILD).toBe('github/codeql-action/autobuild@v3');
        });

        it('has correct CODEQL_ANALYZE', () => {
            expect(ACTION_VERSIONS.CODEQL_ANALYZE).toBe('github/codeql-action/analyze@v3');
        });
    });

    describe('PAGINATION', () => {
        it('has correct DEFAULT', () => {
            expect(PAGINATION.DEFAULT).toBe(100);
        });

        it('has correct SMALL', () => {
            expect(PAGINATION.SMALL).toBe(10);
        });

        it('has correct ISSUES', () => {
            expect(PAGINATION.ISSUES).toBe(30);
        });
    });
});
