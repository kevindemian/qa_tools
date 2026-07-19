# Centralize Test Constants — Single Source of Truth (Refined)

## Overview

Centralizes all hardcoded test values into shared modules with **semantic naming** (purpose-based, not tool-based). Eliminates ~976+ scattered string literals across ~100 test files.

**Problem**: Action versions, mock modules, test identifiers, and URLs are hardcoded in 10+ source files and 100+ test files. Updating a single action version requires editing 10+ files. Mock boilerplate is copy-pasted 34-44 times per module.

**Solution**: Create `shared/test-utils/constants.ts` and `shared/test-utils/mock-modules.ts` as single sources of truth. Migrate all consumers incrementally.

**Aligned with**: Existing factory system (`shared/test-utils/factories/`), project ESM + strict TypeScript conventions.

**Key Refinement**: Constants named by **purpose**, not by tool. Example:

- `PROJECT_MANAGEMENT_PATH.BASE_URL` instead of `TEST_URLS.JIRA`
- `CI_CD_PATH.GITHUB_API` instead of `TEST_URLS.GITHUB_API`
- `CONTEXT_IDS.ORGANIZATION` instead of `TEST_IDS.GITHUB_OWNER`

---

## Architecture

```
shared/test-utils/
├── constants.ts          ← NEW: All test constants (semantic naming)
├── mock-modules.ts       ← NEW: Reusable mock module factories
├── mock-types.ts         ← EXISTS: MockedSafe<T> (no changes)
└── factories/            ← EXISTS: Object factories (no changes)
    ├── index.ts
    ├── git-provider-factory.ts
    ├── jira-resource-factory.ts
    ├── config-factory.ts
    ├── context-factory.ts
    ├── response-factory.ts
    └── ...
```

**Import pattern for consumers:**

```typescript
// Before (hardcoded)
vi.mock('../shared/prompt', () => ({
    info: vi.fn(),
    // ... 10 more lines
}));

// After (centralized)
import { mockPromptModule } from '../test-utils/mock-modules.js';
vi.mock('../shared/prompt', mockPromptModule);
```

**Semantic constants (purpose-based):**

```typescript
// Before (tool-based)
import { TEST_URLS } from '../test-utils/constants.js';
const url = TEST_URLS.JIRA; // 'https://jira.test.com'

// After (purpose-based)
import { PROJECT_MANAGEMENT_PATH } from '../test-utils/constants.js';
const url = PROJECT_MANAGEMENT_PATH.BASE_URL; // 'https://jira.test.com'
```

**Constants hierarchy:**

| Constant                  | Purpose                               | Example                             |
| ------------------------- | ------------------------------------- | ----------------------------------- |
| `PROJECT_MANAGEMENT_PATH` | Jira/project management URLs          | `BASE_URL`, `API_BASE`              |
| `CI_CD_PATH`              | CI/CD provider URLs                   | `GITHUB_API`, `GITLAB_API`          |
| `CONTEXT_IDS`             | Test identifiers (not tool-specific)  | `ORGANIZATION`, `REPOSITORY`        |
| `TEST_CREDENTIALS`        | Authentication tokens (purpose-based) | `CI_PROVIDER`, `PROJECT_MANAGEMENT` |
| `ACTION_VERSIONS`         | CI/CD action versions                 | `CHECKOUT`, `SETUP_NODE`            |
| `PAGINATION`              | API pagination defaults               | `DEFAULT`, `SMALL`, `ISSUES`        |

---

## FAZE 1 — Create Constants Module

### Task 1: Create `shared/test-utils/constants.ts`

| Item        | Conteúdo                                           |
| ----------- | -------------------------------------------------- |
| **Gap**     | Sem fonte única para action versions, IDs, URLs    |
| **Arquivo** | `shared/test-utils/constants.ts` (novo)            |
| **Mudança** | Criar módulo com constantes semânticas (propósito) |

**Tarefa 1a — RED:**

| #   | Teste                                 | Esperado                              |
| --- | ------------------------------------- | ------------------------------------- |
| R1  | `ACTION_VERSIONS.CHECKOUT`            | `'actions/checkout@v5'`               |
| R2  | `ACTION_VERSIONS.SETUP_NODE`          | `'actions/setup-node@v6'`             |
| R3  | `ACTION_VERSIONS.UPLOAD_ARTIFACT`     | `'actions/upload-artifact@v7'`        |
| R4  | `ACTION_VERSIONS.DOWNLOAD_ARTIFACT`   | `'actions/download-artifact@v8'`      |
| R5  | `ACTION_VERSIONS.CODEQL_INIT`         | `'github/codeql-action/init@v3'`      |
| R6  | `ACTION_VERSIONS.CODEQL_AUTOBUILD`    | `'github/codeql-action/autobuild@v3'` |
| R7  | `ACTION_VERSIONS.CODEQL_ANALYZE`      | `'github/codeql-action/analyze@v3'`   |
| R8  | `PROJECT_MANAGEMENT_PATH.BASE_URL`    | `'https://jira.test.com'`             |
| R9  | `PROJECT_MANAGEMENT_PATH.API_BASE`    | `'https://jira.test.com/rest/api/2'`  |
| R10 | `CI_CD_PATH.GITHUB_API`               | `'https://api.github.com'`            |
| R11 | `CI_CD_PATH.GITLAB_API`               | `'https://gitlab.com'`                |
| R12 | `CI_CD_PATH.GITLAB_TEST`              | `'https://gitlab.test.com'`           |
| R13 | `CONTEXT_IDS.ORGANIZATION`            | `'myorg'`                             |
| R14 | `CONTEXT_IDS.REPOSITORY`              | `'myrepo'`                            |
| R15 | `CONTEXT_IDS.GITLAB_ORGANIZATION`     | `'owner'`                             |
| R16 | `CONTEXT_IDS.GITLAB_REPOSITORY`       | `'repo'`                              |
| R17 | `CONTEXT_IDS.GITLAB_PROJECT`          | `'project-123'`                       |
| R18 | `CONTEXT_IDS.DEFAULT_BRANCH`          | `'main'`                              |
| R19 | `CONTEXT_IDS.FEATURE_BRANCH`          | `'feature'`                           |
| R20 | `TEST_CREDENTIALS.CI_PROVIDER`        | `'ghp_test'`                          |
| R21 | `TEST_CREDENTIALS.CI_PROVIDER_GITLAB` | `'test-token'`                        |
| R22 | `TEST_CREDENTIALS.PROJECT_MANAGEMENT` | `'fake-token'`                        |
| R23 | `PAGINATION.DEFAULT`                  | `100`                                 |
| R24 | `PAGINATION.SMALL`                    | `10`                                  |
| R25 | `PAGINATION.ISSUES`                   | `30`                                  |

**Tarefa 1b — GREEN:** Criar `shared/test-utils/constants.ts`

```typescript
// shared/test-utils/constants.ts

// === Caminhos de Sistema (Purpose-based) ===
export const PROJECT_MANAGEMENT_PATH = {
    BASE_URL: 'https://jira.test.com',
    API_BASE: 'https://jira.test.com/rest/api/2',
} as const;

export const CI_CD_PATH = {
    GITHUB_API: 'https://api.github.com',
    GITLAB_API: 'https://gitlab.com',
    GITLAB_TEST: 'https://gitlab.test.com',
} as const;

// === Identificadores de Contexto (not tool-specific) ===
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
export const TEST_CREDENTIALS = {
    CI_PROVIDER: 'ghp_test',
    CI_PROVIDER_GITLAB: 'test-token',
    PROJECT_MANAGEMENT: 'fake-token',
} as const;

// === Versões de Ações (CI/CD) ===
export const ACTION_VERSIONS = {
    CHECKOUT: 'actions/checkout@v5',
    SETUP_NODE: 'actions/setup-node@v6',
    UPLOAD_ARTIFACT: 'actions/upload-artifact@v7',
    DOWNLOAD_ARTIFACT: 'actions/download-artifact@v8',
    CODEQL_INIT: 'github/codeql-action/init@v3',
    CODEQL_AUTOBUILD: 'github/codeql-action/autobuild@v3',
    CODEQL_ANALYZE: 'github/codeql-action/analyze@v3',
} as const;

// === Configurações de Paginação ===
export const PAGINATION = {
    DEFAULT: 100,
    SMALL: 10,
    ISSUES: 30,
} as const;
```

**Tarefa 1c — Quality Gate:** `npx vitest run shared/test-utils/constants.test.ts` = 100% pass

---

### Task 2: Create `shared/test-utils/mock-modules.ts`

| Item        | Conteúdo                                         |
| ----------- | ------------------------------------------------ |
| **Gap**     | Mock modules copy-pasted 34-44 vezes por arquivo |
| **Arquivo** | `shared/test-utils/mock-modules.ts` (novo)       |
| **Mudança** | Criar factories reutilizáveis com overrides      |

**Tarefa 2a — RED:**

| #   | Teste                                                      | Esperado                               |
| --- | ---------------------------------------------------------- | -------------------------------------- |
| R1  | `mockLoggerModule()`                                       | Retorna objeto com Logger + rootLogger |
| R2  | `mockLoggerModule().Logger`                                | É `vi.fn()`                            |
| R3  | `mockLoggerModule().rootLogger.error`                      | É `vi.fn()`                            |
| R4  | `mockPromptModule()`                                       | Retorna objeto com 12 funções mock     |
| R5  | `mockPromptModule().withSpinner`                           | Retorna `fn()` diretamente             |
| R6  | `mockPromptModule({ info: customFn })`                     | Override funciona                      |
| R7  | `mockGitProviderError()`                                   | Retorna objeto com handleError         |
| R8  | `mockGitProviderError().handleError` c/ `returnNull: true` | Retorna `null`                         |
| R9  | `mockGitProviderError().handleError` sem opts              | Re-throw erro                          |
| R10 | `mockHttpClientModule()`                                   | Retorna objeto com HttpClient          |
| R11 | `mockSessionStateModule()`                                 | Retorna objeto com pushHistory etc.    |
| R12 | `mockSessionStateModule({ currentProjectName: 'custom' })` | Override funciona                      |
| R13 | `mockStateModule()`                                        | Retorna objeto com load + update       |
| R14 | `mockConfigModule()`                                       | Retorna objeto com jiraProject + get   |

**Tarefa 2b — GREEN:** Criar `shared/test-utils/mock-modules.ts`

```typescript
// shared/test-utils/mock-modules.ts

import { vi } from 'vitest';

// === Mock Logger Module ===
export function mockLoggerModule() {
    return {
        Logger: vi.fn().mockImplementation(function () {
            return { error: vi.fn(), warn: vi.fn() };
        }),
        rootLogger: { error: vi.fn(), warn: vi.fn() },
    };
}

// === Mock Prompt Module (full with overrides) ===
export function mockPromptModule(overrides?: Partial<ReturnType<typeof mockPromptModule>>) {
    const defaults = {
        print: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        title: vi.fn(),
        prompt: vi.fn(),
        confirm: vi.fn(),
        printError: vi.fn(),
        error: vi.fn(),
        withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
        extractErrorMessage: vi.fn((err: Error) => err.message || 'Erro desconhecido'),
        smartPrompt: vi.fn(),
        ask: vi.fn(),
    };
    return { ...defaults, ...overrides };
}

// === Mock Prompt Module (minimal — only extractErrorMessage) ===
export function mockPromptModuleMinimal() {
    return {
        info: vi.fn(),
        extractErrorMessage: vi.fn((err: Error) => err.message || 'Erro desconhecido'),
    };
}

// === Mock GitProviderError ===
export function mockGitProviderError() {
    return {
        handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
            if (opts?.returnNull) return null;
            throw err;
        }),
    };
}

// === Mock HttpClient Module ===
export function mockHttpClientModule() {
    return {
        HttpClient: vi.fn().mockImplementation(() => ({})),
    };
}

// === Mock Session State Module ===
export function mockSessionStateModule(overrides?: Partial<{ currentProjectName: string; currentProvider: string }>) {
    return {
        pushHistory: vi.fn(),
        printSessionSummary: vi.fn(),
        createManagerForProject: vi.fn(),
        setCurrentProjectName: vi.fn(),
        setProjectId: vi.fn(),
        setManager: vi.fn(),
        getProjects: vi.fn(() => ({})),
        currentProjectName: '',
        currentProvider: 'gitlab',
        ...overrides,
    };
}

// === Mock State Module ===
export function mockStateModule() {
    return {
        load: vi.fn(() => ({})),
        update: vi.fn((fn: (s: JsonObject) => void) => {
            const s: JsonObject = {};
            fn(s);
            return s;
        }),
    };
}

// === Mock Config Module ===
export function mockConfigModule(overrides?: Partial<{ jiraProject: string }>) {
    return {
        __esModule: true,
        default: {
            jiraProject: 'TEST',
            get: vi.fn((key: string) => Reflect.get(process.env, key) || undefined),
            ...overrides,
        },
    };
}
```

**Tarefa 2c — Quality Gate:** `npx vitest run shared/test-utils/mock-modules.test.ts` = 100% pass

---

### Task 3: Update factories/index.ts exports

| Item        | Conteúdo                                        |
| ----------- | ----------------------------------------------- |
| **Gap**     | Factories existentes não exportam novos módulos |
| **Arquivo** | `shared/test-utils/factories/index.ts`          |
| **Mudança** | Adicionar exports de constants e mock-modules   |

**Tarefa 3a — RED:**

| #   | Teste                                                     | Esperado         |
| --- | --------------------------------------------------------- | ---------------- |
| R1  | `import { PROJECT_MANAGEMENT_PATH } from '../test-utils'` | Compila sem erro |
| R2  | `import { mockPromptModule } from '../test-utils'`        | Compila sem erro |
| R3  | `import { ACTION_VERSIONS } from '../test-utils'`         | Compila sem erro |

**Tarefa 3b — GREEN:** Atualizar `shared/test-utils/factories/index.ts`

```typescript
export { createMockJiraResource } from './jira-resource-factory.js';
export { createMockLinkManager } from './link-manager-factory.js';
export { createMockGitProvider } from './git-provider-factory.js';
export { createMockConfig, createMockConfigInstance } from './config-factory.js';
export type { MockConfigStatic } from './config-factory.js';
export { createMockTestExecutionCreator } from './test-execution-creator-factory.js';
export { createMockContext } from './context-factory.js';
export { createMockResponse, createMockAxiosInstance } from './response-factory.js';
export { createFlatTest, createFlatTests } from './flat-test-factory.js';

// Centralized semantic constants (purpose-based)
export {
    PROJECT_MANAGEMENT_PATH,
    CI_CD_PATH,
    CONTEXT_IDS,
    TEST_CREDENTIALS,
    ACTION_VERSIONS,
    PAGINATION,
} from '../constants.js';

// Reusable mock module factories
export {
    mockLoggerModule,
    mockPromptModule,
    mockPromptModuleMinimal,
    mockGitProviderError,
    mockHttpClientModule,
    mockSessionStateModule,
    mockStateModule,
    mockConfigModule,
} from '../mock-modules.js';
```

**Tarefa 3c — Quality Gate:** `npx vitest run` = 100% pass (sem quebras)

---

## FAZE 2 — Migrate ci-injector.ts (Production Code)

### Task 4: Migrate `shared/ci-injector.ts` to use ACTION_VERSIONS

| Item        | Conteúdo                                              |
| ----------- | ----------------------------------------------------- |
| **Gap**     | `ci-injector.ts` hardcoded `@v5`, `@v6`, `@v7`, `@v8` |
| **Arquivo** | `shared/ci-injector.ts:58-82`                         |
| **Mudança** | Substituir strings por `ACTION_VERSIONS.*`            |

**Tarefa 4a — RED:**

| #   | Teste                                         | Esperado         |
| --- | --------------------------------------------- | ---------------- |
| R1  | `ci-injector.test.ts` importa ACTION_VERSIONS | Compila sem erro |
| R2  | Testes existentes passam                      | 100% pass        |

**Tarefa 4b — GREEN:** Editar `shared/ci-injector.ts`

```typescript
import { ACTION_VERSIONS } from './test-utils/constants.js';

// Nas linhas 58-82, substituir:
// ANTES: 'actions/checkout@v5'
// DEPOIS: ACTION_VERSIONS.CHECKOUT
```

**Tarefa 4c — Quality Gate:** `npx vitest run shared/ci-injector.test.ts` = 100% pass

---

### Task 5: Migrate `setup/templates/github-ci.ts` to use ACTION_VERSIONS

| Item        | Conteúdo                                                       |
| ----------- | -------------------------------------------------------------- |
| **Gap**     | `github-ci.ts` usa `@v4` (desatualizado) para todas as actions |
| **Arquivo** | `setup/templates/github-ci.ts:53-65`                           |
| **Mudança** | Substituir `@v4` por `ACTION_VERSIONS.*` (resolve drift)       |

**Tarefa 5a — RED:**

| #   | Teste                                | Esperado                                                |
| --- | ------------------------------------ | ------------------------------------------------------- |
| R1  | `github-ci.test.ts` — versão = `@v5` | `checkout` usa `ACTION_VERSIONS.CHECKOUT`               |
| R2  | `github-ci.test.ts` — versão = `@v6` | `setup-node` usa `ACTION_VERSIONS.SETUP_NODE`           |
| R3  | `github-ci.test.ts` — versão = `@v7` | `upload-artifact` usa `ACTION_VERSIONS.UPLOAD_ARTIFACT` |

**Tarefa 5b — GREEN:** Editar `setup/templates/github-ci.ts`

```typescript
import { ACTION_VERSIONS } from '../test-utils/constants.js';

// ANTES: `actions/checkout@v4`
// DEPOIS: ACTION_VERSIONS.CHECKOUT
```

**Tarefa 5c — Quality Gate:** `npx vitest run setup/templates/github-ci.test.ts` = 100% pass

**Checkpoint Fase 2:** Production code usa ACTION_VERSIONS. Tests passam. `github-ci.ts` drift corrigido.
**Commit:** `refactor(ci): centralize action versions in constants module`

---

## FAZE 3 — Migrate Template Generators

### Task 6: Migrate `setup/templates/qa-post-process-workflow.ts`

| Item        | Conteúdo                                                           |
| ----------- | ------------------------------------------------------------------ |
| **Gap**     | `qa-post-process-workflow.ts` hardcoded `@v5`, `@v6`, `@v7`, `@v8` |
| **Arquivo** | `setup/templates/qa-post-process-workflow.ts:30-54`                |
| **Mudança** | Substituir por `ACTION_VERSIONS.*`                                 |

**Tarefa 6a — RED:**

| #   | Teste                                      | Esperado         |
| --- | ------------------------------------------ | ---------------- |
| R1  | `qa-post-process-workflow.test.ts` importa | Compila sem erro |
| R2  | Todos os testes passam                     | 100% pass        |

**Tarefa 6b — GREEN:** Editar `setup/templates/qa-post-process-workflow.ts`

**Tarefa 6c — Quality Gate:** `npx vitest run setup/templates/qa-post-process-workflow.test.ts` = 100% pass

---

### Task 7: Migrate `setup/templates/github-ci.test.ts`

| Item        | Conteúdo                                              |
| ----------- | ----------------------------------------------------- |
| **Gap**     | Teste assertion hardcoded `@v4` — deve usar constante |
| **Arquivo** | `setup/templates/github-ci.test.ts:70`                |
| **Mudança** | Assertion importa `ACTION_VERSIONS`                   |

**Tarefa 7a — RED:**

| #   | Teste                                     | Esperado                    |
| --- | ----------------------------------------- | --------------------------- |
| R1  | Assertion compara com `ACTION_VERSIONS.*` | Versão correta da constante |

**Tarefa 7b — GREEN:** Editar `setup/templates/github-ci.test.ts`

**Tarefa 7c — Quality Gate:** `npx vitest run setup/templates/github-ci.test.ts` = 100% pass

---

### Task 8: Migrate `setup/templates/qa-post-process-workflow.test.ts`

| Item        | Conteúdo                                                 |
| ----------- | -------------------------------------------------------- |
| **Gap**     | Teste assertions hardcoded `@v5`, `@v6`, `@v7`, `@v8`    |
| **Arquivo** | `setup/templates/qa-post-process-workflow.test.ts:70-90` |
| **Mudança** | Assertions importam `ACTION_VERSIONS`                    |

**Tarefa 8a — RED:**

| #   | Teste                                        | Esperado         |
| --- | -------------------------------------------- | ---------------- |
| R1  | Todas as assertions usam `ACTION_VERSIONS.*` | Versões corretas |

**Tarefa 8b — GREEN:** Editar `setup/templates/qa-post-process-workflow.test.ts`

**Tarefa 8c — Quality Gate:** `npx vitest run setup/templates/qa-post-process-workflow.test.ts` = 100% pass

---

### Task 9: Migrate `shared/ci-injector.test.ts`

| Item        | Conteúdo                                              |
| ----------- | ----------------------------------------------------- |
| **Gap**     | Teste assertions hardcoded `@v5`, `@v6`, `@v7`, `@v8` |
| **Arquivo** | `shared/ci-injector.test.ts:29, 139, 196, 329-332`    |
| **Mudança** | Assertions importam `ACTION_VERSIONS`                 |

**Tarefa 9a — RED:**

| #   | Teste                                        | Esperado         |
| --- | -------------------------------------------- | ---------------- |
| R1  | Todas as assertions usam `ACTION_VERSIONS.*` | Versões corretas |

**Tarefa 9b — GREEN:** Editar `shared/ci-injector.test.ts`

**Tarefa 9c — Quality Gate:** `npx vitest run shared/ci-injector.test.ts` = 100% pass

**Checkpoint Fase 3:** Todos os templates e testes de templates usam ACTION_VERSIONS.
**Commit:** `refactor(templates): migrate all template tests to centralized constants`

---

## FAZE 4 — Migrate Mock Modules (High Impact)

### Task 10: Migrate `git_triggers/github_manager.test.ts`

| Item        | Conteúdo                                                               |
| ----------- | ---------------------------------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock('../shared/prompt')`, `vi.mock('../shared/logger')` |
| **Arquivo** | `git_triggers/github_manager.test.ts`                                  |
| **Mudança** | Substituir por `mockPromptModule()`, `mockLoggerModule()`              |

**Tarefa 10a — RED:**

| #   | Teste                   | Esperado                       |
| --- | ----------------------- | ------------------------------ |
| R1  | `vi.mock` usa factories | Linhas 2-20 reduzidas para 2-3 |
| R2  | Todos os testes passam  | 100% pass                      |

**Tarefa 10b — GREEN:** Editar `git_triggers/github_manager.test.ts`

```typescript
import { mockPromptModule, mockLoggerModule, mockGitProviderError } from '../shared/test-utils/mock-modules.js';

vi.mock('../shared/prompt', mockPromptModule);
vi.mock('../shared/logger', mockLoggerModule);
vi.mock('../shared/git-provider-error', mockGitProviderError);
```

**Tarefa 10c — Quality Gate:** `npx vitest run git_triggers/github_manager.test.ts` = 100% pass

---

### Task 11: Migrate `git_triggers/gitlab_manager.test.ts`

| Item        | Conteúdo                                                               |
| ----------- | ---------------------------------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock('../shared/prompt')`, `vi.mock('../shared/logger')` |
| **Arquivo** | `git_triggers/gitlab_manager.test.ts`                                  |
| **Mudança** | Substituir por factories                                               |

**Tarefa 11a — RED:**

| #   | Teste                   | Esperado         |
| --- | ----------------------- | ---------------- |
| R1  | `vi.mock` usa factories | Linhas reduzidas |
| R2  | Todos os testes passam  | 100% pass        |

**Tarefa 11b — GREEN:** Editar `git_triggers/gitlab_manager.test.ts`

**Tarefa 11c — Quality Gate:** `npx vitest run git_triggers/gitlab_manager.test.ts` = 100% pass

---

### Task 12: Migrate `git_triggers/github-workflow.test.ts`

| Item        | Conteúdo                                           |
| ----------- | -------------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock` + hardcoded URLs e identifiers |
| **Arquivo** | `git_triggers/github-workflow.test.ts`             |
| **Mudança** | Substituir por factories + semantic constants      |

**Tarefa 12a — RED:**

| #   | Teste                                                | Esperado         |
| --- | ---------------------------------------------------- | ---------------- |
| R1  | `vi.mock` usa factories                              | Linhas reduzidas |
| R2  | `'myorg'` → `CONTEXT_IDS.ORGANIZATION`               | Constante usada  |
| R3  | `'https://api.github.com'` → `CI_CD_PATH.GITHUB_API` | Constante usada  |
| R4  | Todos os testes passam                               | 100% pass        |

**Tarefa 12b — GREEN:** Editar `git_triggers/github-workflow.test.ts`

**Tarefa 12c — Quality Gate:** `npx vitest run git_triggers/github-workflow.test.ts` = 100% pass

---

### Task 13: Migrate `git_triggers/gitlab-workflow.test.ts`

| Item        | Conteúdo                                           |
| ----------- | -------------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock` + hardcoded URLs e identifiers |
| **Arquivo** | `git_triggers/gitlab-workflow.test.ts`             |
| **Mudança** | Substituir por factories + semantic constants      |

**Tarefa 13a — RED:**

| #   | Teste                                            | Esperado         |
| --- | ------------------------------------------------ | ---------------- |
| R1  | `vi.mock` usa factories                          | Linhas reduzidas |
| R2  | `'owner'` → `CONTEXT_IDS.GITLAB_ORGANIZATION`    | Constante usada  |
| R3  | `'https://gitlab.com'` → `CI_CD_PATH.GITLAB_API` | Constante usada  |
| R4  | Todos os testes passam                           | 100% pass        |

**Tarefa 13b — GREEN:** Editar `git_triggers/gitlab-workflow.test.ts`

**Tarefa 13c — Quality Gate:** `npx vitest run git_triggers/gitlab-workflow.test.ts` = 100% pass

**Checkpoint Fase 4:** 4 arquivos de teste migrados para mock factories + constants.
**Commit:** `refactor(tests): migrate top 4 test files to centralized mocks`

---

## FAZE 5 — Migrate Remaining Mock Modules (Batch 2)

### Task 14: Migrate `git_triggers/pipeline-handler.test.ts`

| Item        | Conteúdo                                                                        |
| ----------- | ------------------------------------------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock` + session state + config mocks                              |
| **Arquivo** | `git_triggers/pipeline-handler.test.ts`                                         |
| **Mudança** | Substituir por `mockPromptModule`, `mockSessionStateModule`, `mockConfigModule` |

**Tarefa 14a — RED:**

| #   | Teste                   | Esperado         |
| --- | ----------------------- | ---------------- |
| R1  | `vi.mock` usa factories | Linhas reduzidas |
| R2  | Todos os testes passam  | 100% pass        |

**Tarefa 14b — GREEN:** Editar `git_triggers/pipeline-handler.test.ts`

**Tarefa 14c — Quality Gate:** `npx vitest run git_triggers/pipeline-handler.test.ts` = 100% pass

---

### Task 15: Migrate `git_triggers/batch-mode.test.ts`

| Item        | Conteúdo                                                      |
| ----------- | ------------------------------------------------------------- |
| **Gap**     | Hardcoded mock provider object (factory exists mas não usado) |
| **Arquivo** | `git_triggers/batch-mode.test.ts`                             |
| **Mudança** | Usar `createMockGitProvider()` + `mockSessionStateModule`     |

**Tarefa 15a — RED:**

| #   | Teste                         | Esperado                |
| --- | ----------------------------- | ----------------------- |
| R1  | Usa `createMockGitProvider()` | Linhas 16-35 eliminadas |
| R2  | Todos os testes passam        | 100% pass               |

**Tarefa 15b — GREEN:** Editar `git_triggers/batch-mode.test.ts`

**Tarefa 15c — Quality Gate:** `npx vitest run git_triggers/batch-mode.test.ts` = 100% pass

---

### Task 16: Migrate `git_triggers/main.test.ts`

| Item        | Conteúdo                                |
| ----------- | --------------------------------------- |
| **Gap**     | Hardcoded `vi.mock('../shared/prompt')` |
| **Arquivo** | `git_triggers/main.test.ts`             |
| **Mudança** | Substituir por `mockPromptModule`       |

**Tarefa 16a — RED:**

| #   | Teste                  | Esperado         |
| --- | ---------------------- | ---------------- |
| R1  | `vi.mock` usa factory  | Linhas reduzidas |
| R2  | Todos os testes passam | 100% pass        |

**Tarefa 16b — GREEN:** Editar `git_triggers/main.test.ts`

**Tarefa 16c — Quality Gate:** `npx vitest run git_triggers/main.test.ts` = 100% pass

---

### Task 17: Migrate `git_triggers/github-pr.test.ts`

| Item        | Conteúdo                                    |
| ----------- | ------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock` + hardcoded identifiers |
| **Arquivo** | `git_triggers/github-pr.test.ts`            |
| **Mudança** | Substituir por factories + constants        |

**Tarefa 17a — RED:**

| #   | Teste                   | Esperado         |
| --- | ----------------------- | ---------------- |
| R1  | `vi.mock` usa factories | Linhas reduzidas |
| R2  | Todos os testes passam  | 100% pass        |

**Tarefa 17b — GREEN:** Editar `git_triggers/github-pr.test.ts`

**Tarefa 17c — Quality Gate:** `npx vitest run git_triggers/github-pr.test.ts` = 100% pass

---

### Task 18: Migrate `git_triggers/gitlab-pr.test.ts`

| Item        | Conteúdo                                    |
| ----------- | ------------------------------------------- |
| **Gap**     | Hardcoded `vi.mock` + hardcoded identifiers |
| **Arquivo** | `git_triggers/gitlab-pr.test.ts`            |
| **Mudança** | Substituir por factories + constants        |

**Tarefa 18a — RED:**

| #   | Teste                   | Esperado         |
| --- | ----------------------- | ---------------- |
| R1  | `vi.mock` usa factories | Linhas reduzidas |
| R2  | Todos os testes passam  | 100% pass        |

**Tarefa 18b — GREEN:** Editar `git_triggers/gitlab-pr.test.ts`

**Tarefa 18c — Quality Gate:** `npx vitest run git_triggers/gitlab-pr.test.ts` = 100% pass

**Checkpoint Fase 5:** 5 arquivos adicionais migrados.
**Commit:** `refactor(tests): migrate batch-2 test files to centralized mocks`

---

## FAZE 6 — Migrate Batch 3 (github-\*.test.ts)

### Task 19: Migrate `git_triggers/github-branch.test.ts`

| Item        | Conteúdo                                             |
| ----------- | ---------------------------------------------------- |
| **Gap**     | Hardcoded identifiers                                |
| **Arquivo** | `git_triggers/github-branch.test.ts`                 |
| **Mudança** | Usar `TEST_IDS.GITHUB_OWNER`, `TEST_IDS.GITHUB_REPO` |

**Tarefa 19a — RED:** Todos os testes passam
**Tarefa 19b — GREEN:** Editar arquivo
**Tarefa 19c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 20: Migrate `git_triggers/github-issues.test.ts`

**Tarefa 20a — RED:** Todos os testes passam
**Tarefa 20b — GREEN:** Editar arquivo
**Tarefa 20c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 21: Migrate `git_triggers/github-api.test.ts`

**Tarefa 21a — RED:** Todos os testes passam
**Tarefa 21b — GREEN:** Editar arquivo
**Tarefa 21c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 22: Migrate `git_triggers/gitlab-branch.test.ts`

**Tarefa 22a — RED:** Todos os testes passam
**Tarefa 22b — GREEN:** Editar arquivo
**Tarefa 22c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 23: Migrate `git_triggers/gitlab-issues.test.ts`

**Tarefa 23a — RED:** Todos os testes passam
**Tarefa 23b — GREEN:** Editar arquivo
**Tarefa 23c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 24: Migrate `git_triggers/gitlab-api.test.ts`

**Tarefa 24a — RED:** Todos os testes passam
**Tarefa 24b — GREEN:** Editar arquivo
**Tarefa 24c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 6:** 6 arquivos github/gitlab migrados.
**Commit:** `refactor(tests): migrate batch-3 github/gitlab test files`

---

## FAZE 7 — Migrate Batch 4 (shared/ + jira_management/)

### Task 25: Migrate `shared/github-check-run.test.ts`

**Tarefa 25a — RED:** Todos os testes passam
**Tarefa 25b — GREEN:** Editar arquivo (usar `TEST_TOKENS.GITHUB`, `TEST_URLS.GITHUB_API`)
**Tarefa 25c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 26: Migrate `shared/github-pr-comment.test.ts`

**Tarefa 26a — RED:** Todos os testes passam
**Tarefa 26b — GREEN:** Editar arquivo
**Tarefa 26c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 27: Migrate `shared/git-artifact-downloader.test.ts`

**Tarefa 27a — RED:** Todos os testes passam
**Tarefa 27b — GREEN:** Editar arquivo (usar `TEST_URLS.GITLAB_TEST`)
**Tarefa 27c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 28: Migrate `jira_management/jira_resource.test.ts`

**Tarefa 28a — RED:** Todos os testes passam
**Tarefa 28b — GREEN:** Editar arquivo (usar `TEST_TOKENS.JIRA`, `TEST_URLS.JIRA_API`)
**Tarefa 28c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 29: Migrate `jira_management/result_reporter.test.ts`

**Tarefa 29a — RED:** Todos os testes passam
**Tarefa 29b — GREEN:** Editar arquivo
**Tarefa 29c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 30: Migrate `jira_management/import-orchestrator.test.ts`

**Tarefa 30a — RED:** Todos os testes passam
**Tarefa 30b — GREEN:** Editar arquivo
**Tarefa 30c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 7:** 6 arquivos shared/jira migrados.
**Commit:** `refactor(tests): migrate batch-4 shared/jira test files`

---

## FAZE 8 — Migrate Batch 5 (e2e + remaining)

### Task 31: Migrate `e2e/handlers-happy-paths.test.ts`

**Tarefa 31a — RED:** Todos os testes passam
**Tarefa 31b — GREEN:** Editar arquivo (usar `TEST_TOKENS`, `TEST_URLS`)
**Tarefa 31c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 32: Migrate `jira_management/jira-resource-sprint.test.ts`

**Tarefa 32a — RED:** Todos os testes passam
**Tarefa 32b — GREEN:** Editar arquivo
**Tarefa 32c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 33: Migrate `jira_management/jira-resource-version.test.ts`

**Tarefa 33a — RED:** Todos os testes passam
**Tarefa 33b — GREEN:** Editar arquivo
**Tarefa 33c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 34: Migrate `shared/__tests__/pr-report.test.ts`

**Tarefa 34a — RED:** Todos os testes passam
**Tarefa 34b — GREEN:** Editar arquivo (usar `TEST_TOKENS.GITHUB`)
**Tarefa 34c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 8:** Todos os arquivos de teste migrados.
**Commit:** `refactor(tests): migrate batch-5 e2e/remaining test files`

---

## FAZE 9 — Update Factories to Use Centralized Constants

### Task 35: Update `jira-resource-factory.ts` to use semantic constants

| Item        | Conteúdo                                                                           |
| ----------- | ---------------------------------------------------------------------------------- |
| **Gap**     | `jira-resource-factory.ts` hardcoded `https://jira.test.com`, `fake-token`         |
| **Arquivo** | `shared/test-utils/factories/jira-resource-factory.ts:10-12`                       |
| **Mudança** | Importar `PROJECT_MANAGEMENT_PATH.BASE_URL`, `TEST_CREDENTIALS.PROJECT_MANAGEMENT` |

**Tarefa 35a — RED:**

| #   | Teste                                            | Esperado                           |
| --- | ------------------------------------------------ | ---------------------------------- |
| R1  | `createMockJiraResource()` retorna URLs corretas | Usa constantes                     |
| R2  | `createMockJiraResource().baseUrl`               | `PROJECT_MANAGEMENT_PATH.BASE_URL` |

**Tarefa 35b — GREEN:** Editar `jira-resource-factory.ts`

```typescript
import { PROJECT_MANAGEMENT_PATH, TEST_CREDENTIALS } from '../constants.js';

// Na linha 10-12:
// ANTES:
// baseUrl: 'https://jira.test.com',
// personalToken: 'fake-token',
// DEPOIS:
// baseUrl: PROJECT_MANAGEMENT_PATH.BASE_URL,
// personalToken: TEST_CREDENTIALS.PROJECT_MANAGEMENT,
```

**Tarefa 35c — Quality Gate:** `npx vitest run` = 100% pass

---

### Task 36: Update `context-factory.ts` to use semantic constants

| Item        | Conteúdo                                               |
| ----------- | ------------------------------------------------------ |
| **Gap**     | `context-factory.ts` hardcoded `https://jira.test.com` |
| **Arquivo** | `shared/test-utils/factories/context-factory.ts:46`    |
| **Mudança** | Importar `PROJECT_MANAGEMENT_PATH.BASE_URL`            |

**Tarefa 36a — RED:**

| #   | Teste                                       | Esperado                           |
| --- | ------------------------------------------- | ---------------------------------- |
| R1  | `createMockContext()` retorna URLs corretas | Usa constantes                     |
| R2  | `createMockContext().jiraBaseUrl`           | `PROJECT_MANAGEMENT_PATH.BASE_URL` |

**Tarefa 36b — GREEN:** Editar `context-factory.ts`

```typescript
import { PROJECT_MANAGEMENT_PATH } from '../constants.js';

// Na linha 46:
// ANTES:
// jiraBaseUrl: 'https://jira.test.com',
// DEPOIS:
// jiraBaseUrl: PROJECT_MANAGEMENT_PATH.BASE_URL,
```

**Checkpoint Fase 9:** Factories existentes usam constantes centralizadas.
**Commit:** `refactor(test-utils): update existing factories to use centralized constants`

---

## FAZE 10 — Full Audit + Final Validation

### Task 37: Run complete test suite

| Item         | Conteúdo                                      |
| ------------ | --------------------------------------------- |
| **Gap**      | Validar que todas as migrações foram corretas |
| **Comando**  | `npx vitest run`                              |
| **Esperado** | 100% pass, 0 falhas                           |

**Tarefa 37a — Audit:**

| #   | Verificação                                     | Esperado                                     |
| --- | ----------------------------------------------- | -------------------------------------------- |
| A1  | `npx vitest run`                                | 100% pass                                    |
| A2  | `npx tsc --noEmit`                              | 0 erros                                      |
| A3  | `npm run lint`                                  | 0 violações                                  |
| A4  | Grep `@v4` em arquivos .ts (excluindo fixtures) | 0 ocorrências                                |
| A5  | Grep `@v5` hardcoded (excluindo constants.ts)   | 0 ocorrências                                |
| A6  | Grep `vi.mock('../shared/prompt')`              | 0 ocorrências (todas usam factory)           |
| A7  | Grep `vi.mock('../shared/logger')`              | 0 ocorrências (todas usam factory)           |
| A8  | Grep `'myorg'` em arquivos .test.ts             | 0 ocorrências (usam CONTEXT_IDS)             |
| A9  | Grep `'https://api.github.com'` em .test.ts     | 0 ocorrências (usam CI_CD_PATH)              |
| A10 | Grep `'https://jira.test.com'` em .test.ts      | 0 ocorrências (usam PROJECT_MANAGEMENT_PATH) |
| A11 | Grep `'fake-token'` em .test.ts                 | 0 ocorrências (usam TEST_CREDENTIALS)        |

**Tarefa 37b — Final Quality Gate:**

```
npx vitest run         → 100% pass
npx tsc --noEmit       → 0 erros
npm run lint           → 0 violações
```

**Checkpoint Fase 10:** Auditoria completa. Todos os hardcoded values migrados. Testes passam.
**Commit:** `chore(audit): verify all hardcoded values migrated to centralized constants`

---

## Affected Files

### Arquivos Novos (Criar)

| Arquivo                                  | Descrição                               |
| ---------------------------------------- | --------------------------------------- |
| `shared/test-utils/constants.ts`         | Action versions, test IDs, URLs, tokens |
| `shared/test-utils/constants.test.ts`    | Tests para constants                    |
| `shared/test-utils/mock-modules.ts`      | Reusable mock module factories          |
| `shared/test-utils/mock-modules.test.ts` | Tests para mock modules                 |

### Arquivos Modificados

| Arquivo                                                | Mudanças                                      |
| ------------------------------------------------------ | --------------------------------------------- |
| `shared/test-utils/factories/index.ts`                 | +exports de constants e mock-modules          |
| `shared/ci-injector.ts`                                | `ACTION_VERSIONS.*` em vez de strings         |
| `shared/ci-injector.test.ts`                           | Assertions usam `ACTION_VERSIONS.*`           |
| `setup/templates/github-ci.ts`                         | `ACTION_VERSIONS.*` em vez de `@v4`           |
| `setup/templates/github-ci.test.ts`                    | Assertions usam `ACTION_VERSIONS.*`           |
| `setup/templates/qa-post-process-workflow.ts`          | `ACTION_VERSIONS.*` em vez de strings         |
| `setup/templates/qa-post-process-workflow.test.ts`     | Assertions usam `ACTION_VERSIONS.*`           |
| `git_triggers/github_manager.test.ts`                  | `mockPromptModule`, `mockLoggerModule`        |
| `git_triggers/gitlab_manager.test.ts`                  | `mockPromptModule`, `mockLoggerModule`        |
| `git_triggers/github-workflow.test.ts`                 | factories + `CONTEXT_IDS` + `CI_CD_PATH`      |
| `git_triggers/gitlab-workflow.test.ts`                 | factories + `CONTEXT_IDS` + `CI_CD_PATH`      |
| `git_triggers/pipeline-handler.test.ts`                | factories + `mockSessionStateModule`          |
| `git_triggers/batch-mode.test.ts`                      | `createMockGitProvider()` + factories         |
| `git_triggers/main.test.ts`                            | `mockPromptModule`                            |
| `git_triggers/github-pr.test.ts`                       | factories + constants                         |
| `git_triggers/gitlab-pr.test.ts`                       | factories + constants                         |
| `git_triggers/github-branch.test.ts`                   | `CONTEXT_IDS`                                 |
| `git_triggers/github-issues.test.ts`                   | `CONTEXT_IDS`                                 |
| `git_triggers/github-api.test.ts`                      | `CI_CD_PATH`                                  |
| `git_triggers/gitlab-branch.test.ts`                   | `CONTEXT_IDS`                                 |
| `git_triggers/gitlab-issues.test.ts`                   | `CONTEXT_IDS`                                 |
| `git_triggers/gitlab-api.test.ts`                      | `CI_CD_PATH`                                  |
| `shared/github-check-run.test.ts`                      | `TEST_CREDENTIALS`, `CI_CD_PATH`              |
| `shared/github-pr-comment.test.ts`                     | `TEST_CREDENTIALS`, `CI_CD_PATH`              |
| `shared/git-artifact-downloader.test.ts`               | `CI_CD_PATH`                                  |
| `shared/__tests__/pr-report.test.ts`                   | `TEST_CREDENTIALS`                            |
| `jira_management/jira_resource.test.ts`                | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `jira_management/result_reporter.test.ts`              | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `jira_management/import-orchestrator.test.ts`          | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `jira_management/jira-resource-sprint.test.ts`         | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `jira_management/jira-resource-version.test.ts`        | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `jira_management/create_tests.test.ts`                 | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `shared/test-utils/factories/jira-resource-factory.ts` | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |
| `shared/test-utils/factories/context-factory.ts`       | `PROJECT_MANAGEMENT_PATH`                     |
| `e2e/handlers-happy-paths.test.ts`                     | `PROJECT_MANAGEMENT_PATH`, `TEST_CREDENTIALS` |

### Arquivos NÃO Modificados (Manter Hardcoded)

| Arquivo                                  | Razão                                                |
| ---------------------------------------- | ---------------------------------------------------- |
| `.github/workflows/*.yml`                | YAML não pode importar TS                            |
| `setup/builder/workflow-builder.test.ts` | `@v4` é fixture data (input de teste), não assertion |

---

## Estimates

| Phase     | Tasks        | Hours   | Risk   |
| --------- | ------------ | ------- | ------ |
| 1         | 1-3          | 2h      | Low    |
| 2         | 4-5          | 1h      | Low    |
| 3         | 6-9          | 2h      | Low    |
| 4         | 10-13        | 3h      | Medium |
| 5         | 14-18        | 3h      | Medium |
| 6         | 19-24        | 3h      | Medium |
| 7         | 25-30        | 3h      | Medium |
| 8         | 31-34        | 2h      | Low    |
| 9         | 35-36        | 1h      | Low    |
| 10        | 37           | 1h      | Low    |
| **Total** | **37 tasks** | **21h** | —      |

---

## Dependencies

```
Phase 1 (Constants + Mocks) ──→ Phase 2 (Production Code)
                              ──→ Phase 3 (Templates)
                              ──→ Phase 4-8 (Test Migration — can parallelize)
                              ──→ Phase 9 (Update Factories)
                              ──→ Phase 10 (Audit)
```

---

## Quality Gates

| Phase | tsc --noEmit | lint | vitest  | Audit       |
| ----- | ------------ | ---- | ------- | ----------- |
| 1     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 2     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 3     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 4     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 5     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 6     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 7     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 8     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 9     | ✅ 0 erros   | ✅ 0 | ✅ 100% | —           |
| 10    | ✅ 0 erros   | ✅ 0 | ✅ 100% | ✅ completa |

---

## Pre-flight Checks per Phase

```bash
# Before each commit:
npx vitest run           # All tests pass
npx tsc --noEmit         # No type errors
npm run lint             # No lint violations

# After Phase 10 (final audit):
grep -r "@v4" --include="*.ts" shared/ setup/ git_triggers/ | grep -v "constants.ts" | grep -v "workflow-builder.test.ts"
# Expected: 0 results (only in constants.ts and workflow-builder fixture)

grep -r "vi.mock('../shared/prompt')" --include="*.test.ts" git_triggers/ shared/ jira_management/ e2e/
# Expected: 0 results (all use mockPromptModule)

grep -r "'myorg'" --include="*.test.ts" git_triggers/ setup/
# Expected: 0 results (all use CONTEXT_IDS.ORGANIZATION)

grep -r "'https://api.github.com'" --include="*.test.ts" git_triggers/ shared/ jira_management/ e2e/
# Expected: 0 results (all use CI_CD_PATH.GITHUB_API)

grep -r "'https://jira.test.com'" --include="*.test.ts" git_triggers/ shared/ jira_management/ e2e/
# Expected: 0 results (all use PROJECT_MANAGEMENT_PATH.BASE_URL)

grep -r "'fake-token'" --include="*.test.ts" git_triggers/ shared/ jira_management/ e2e/
# Expected: 0 results (all use TEST_CREDENTIALS.PROJECT_MANAGEMENT)
```
