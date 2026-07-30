/**
 * Centralized Test Constants — Semantic Naming (Purpose-based)
 *
 * Constants organized by PURPOSE, not by tool/provider.
 * Example: `PROJECT_MANAGEMENT_PATH.BASE_URL` instead of `TEST_URLS.JIRA`
 *
 * @module constants
 */

// === Caminhos de Sistema (Purpose-based) ===
/** URLs para gerenciamento de projetos (Jira, etc.) */
export const PROJECT_MANAGEMENT_PATH = {
    BASE_URL: 'https://jira.test.com',
    API_BASE: 'https://jira.test.com/rest/api/2',
} as const;

/** URLs para provedores de CI/CD */
export const CI_CD_PATH = {
    GITHUB_API: 'https://api.github.com',
    GITLAB_API: 'https://gitlab.com',
    GITLAB_TEST: 'https://gitlab.test.com',
} as const;

// === Identificadores de Contexto (not tool-specific) ===
/** Identificadores de contexto para testes */
export const CONTEXT_IDS = {
    ORGANIZATION: 'myorg',
    REPOSITORY: 'myrepo',
    GITLAB_ORGANIZATION: 'owner',
    GITLAB_REPOSITORY: 'repo',
    GITLAB_PROJECT: 'project-123',
    DEFAULT_BRANCH: 'main',
    FEATURE_BRANCH: 'feature',
} as const;

// === Credenciais de Teste (Purpose-based) ===
/** Credenciais de autenticação para testes */
export const TEST_CREDENTIALS = {
    /** Token para provedores CI (GitHub) */
    CI_PROVIDER: 'ghp_test',
    /** Token para provedores CI (GitLab) */
    CI_PROVIDER_GITLAB: 'test-token',
    /** Token para gerenciamento de projetos (Jira) */
    PROJECT_MANAGEMENT: 'fake-token',
} as const;

// === Versões de Ações (CI/CD) ===
/** Versões de ações do GitHub Actions — re-exportado de shared/constants/ci-versions.ts */
export { ACTION_VERSIONS } from '../constants/ci-versions.js';

// === Configurações de Paginação ===
/** Configurações padrão de paginação para APIs */
export const PAGINATION = {
    DEFAULT: 100,
    SMALL: 10,
    ISSUES: 30,
} as const;
