/**
 * CI/CD action version constants.
 *
 * Centralized version pins for GitHub Actions used in CI template generation.
 * Moved from shared/test-utils/constants.ts to eliminate test-utils dependency
 * in production CI code.
 */

/** GitHub Actions version pins. */
export const ACTION_VERSIONS = {
    CHECKOUT: 'actions/checkout@v5',
    SETUP_NODE: 'actions/setup-node@v6',
    UPLOAD_ARTIFACT: 'actions/upload-artifact@v7',
    DOWNLOAD_ARTIFACT: 'actions/download-artifact@v8',
    CODEQL_INIT: 'github/codeql-action/init@v3',
    CODEQL_AUTOBUILD: 'github/codeql-action/autobuild@v3',
    CODEQL_ANALYZE: 'github/codeql-action/analyze@v3',
} as const;
