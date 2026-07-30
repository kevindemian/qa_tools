# Fix: Xray GraphQL 400 + extractHost URL Resolution

**Status:** ACTIVE
**Author:** OpenCode Agent
**Date:** 2026-07-28
**Trigger:** ECSPOL-511 live test revealed two pre-existing bugs: Xray Cloud GraphQL queries returning 400 (steps=0, prec=0) and extractHost warnings polluting output (14+ per issue)

---

## 1. Problem Statement

### Bug 1: Xray Cloud GraphQL 400 — silent data loss

Both `getTestSteps` and `getTestPreconditions` queries pass `limit` arguments to sub-fields of `getTest` that the Xray Cloud GraphQL schema does not support:

| Query | Line | Invalid arg | Effect |
|-------|------|-------------|--------|
| `getTestSteps` | `xray-cloud-client.ts:268` | `steps(limit: 100)` | HTTP 400 → returns `[]` |
| `getTestPreconditions` | `xray-cloud-client.ts:297` | `preconditions(limit: $limit)` | HTTP 400 → returns `[]` |

The `graphql()` method (line 80-99) catches the HTTP error, logs a warning, and returns `null`. Callers treat `null` as "no data" → silently proceed with empty arrays.

**Impact:** Steps and preconditions are ALWAYS empty during clean-slate operations. The snapshot/clear/rebuild pipeline operates on void data. **Data loss silencioso — viola Rule 25 (Zero Silencing).**

Commit `1bb3be2d` (2026-07-23) claims to fix this but only removed `limit` from `getTest()` top-level, NOT from the sub-fields.

### Bug 2: extractHost URL resolution broken — throttling defeated

`shared/infra/http-client.ts:269` — axios interceptors receive relative paths (`/api/v2/graphql`) from XrayCloudClient. `extractHost('/api/v2/graphql')` calls `new URL('/api/v2/graphql')` which throws (not a valid absolute URL) → returns `'unknown'`.

**Impact:**
1. **14+ warning lines per issue** polluting terminal output
2. **Host throttling inutilizado** — all requests grouped under `'unknown'` → per-host semaphore becomes global semaphore, no actual per-host isolation

---

## 2. Root Cause Analysis

### Bug 1: GraphQL `limit` arguments

The Xray Cloud GraphQL `Test` type defines `steps` and `preconditions` as **fixed collections** (not paginated fields with a `limit` argument). The correct schema:

```graphql
type Test {
    steps: StepResult!          # NO limit argument
    preconditions: PreconditionResult!  # NO limit argument
}

type StepResult {
    total: Int!
    results: [Step!]!
}

type PreconditionResult {
    total: Int!
    results: [Precondition!]!
}
```

The `limit` argument is valid on the **top-level** `getTestRuns` query (which IS paginated), but NOT on sub-fields of `getTest`.

### Bug 2: Axios interceptor URL resolution order

Axios processes requests in this order:
1. Request interceptors run → `config.url` is the **original relative path**
2. `buildFullPath(baseURL, url)` merges baseURL → `config.url` becomes absolute
3. HTTP request dispatched

The throttle interceptor at step 1 sees `config.url = '/api/v2/graphql'`, NOT the resolved `https://xray.cloud.getxray.net/api/v2/graphql`.

---

## 3. Solution: Bug 1 — Xray GraphQL

### 3.1 Remove invalid `limit` arguments

**`xray-cloud-client.ts:265-277` — getTestSteps:**

```graphql
# BEFORE (400):
query GetTestSteps($issueId: String!) {
    getTest(issueId: $issueId) {
        steps(limit: 100) {        # ← REMOVE limit
            results { id action data result }
        }
    }
}

# AFTER (200):
query GetTestSteps($issueId: String!) {
    getTest(issueId: $issueId) {
        steps {                    # ← no limit
            results { id action data result }
        }
    }
}
```

**`xray-cloud-client.ts:294-302` — getTestPreconditions:**

```graphql
# BEFORE (400):
query GetTestPreconditions($issueId: String!, $limit: Int!) {
    getTest(issueId: $issueId) {
        preconditions(limit: $limit) {   # ← REMOVE limit
            total
            results { issueId }
        }
    }
}

# AFTER (200):
query GetTestPreconditions($issueId: String!) {
    getTest(issueId: $issueId) {
        preconditions {                   # ← no limit
            total
            results { issueId }
        }
    }
}
```

Also remove `$limit` from variables: `{ issueId: testIssueId }` (line 304).

### 3.2 Harden `graphql()` error handling

The `graphql()` method currently:
- Catches HTTP errors → returns `null` (silent)
- Ignores `res.data.errors` (GraphQL errors in 200 response)

**Fix:** Check `res.data.errors` and log them:

```ts
async graphql(query, variables, clientId, clientSecret): Promise<Record<string, unknown> | null> {
    const token = await this._ensureToken(clientId, clientSecret);
    if (!token) return null;
    try {
        const res = await this.httpClient.post<GraphqlResponse>(
            GRAPHQL_PATH,
            { query, variables },
            { headers: { Authorization: 'Bearer ' + token } },
        );
        // Check for GraphQL errors in response body
        if (res.data.errors?.length) {
            for (const gqlErr of res.data.errors) {
                rootLogger.warn('GraphQL error: ' + gqlErr.message);
            }
        }
        return res.data.data ?? null;
    } catch (err) {
        rootLogger.warn('Xray Cloud GraphQL call failed: ' + formatErr(err));
        return null;
    }
}
```

**Why this is the technically superior approach:**
- Preserves backward compatibility (still returns `null` on failure)
- Makes errors visible (Rule 25: zero silent errors)
- Does NOT throw (callers already handle `null`)
- Consistent with `graphqlMutation()` which checks errors

---

## 4. Solution: Bug 2 — extractHost

### 4.1 Resolve full URL in interceptors

**`http-client.ts` — request interceptor (line 269):**

```ts
instance.interceptors.request.use(async (cfg) => {
    if (_throttled.has(cfg)) return cfg;
    // Resolve full URL from baseURL + relative path
    const resolvedUrl = cfg.baseURL
        ? (cfg.url?.startsWith('http') ? cfg.url : new URL(cfg.url || '/', cfg.baseURL).href)
        : (cfg.url || '');
    const host = extractHost(resolvedUrl);
    rootLogger.debug(`Throttle: waiting for slot on ${host} (concurrency ${maxConcurrency})`);
    await semaphore.acquire(host);
    _throttled.set(cfg, true);
    return cfg;
});
```

**Response interceptor (line 278):**

```ts
(response) => {
    const url = response.config?.url || '';
    const base = response.config?.baseURL || '';
    const resolvedUrl = url.startsWith('http') ? url : (base ? new URL(url, base).href : url);
    const host = extractHost(resolvedUrl);
    semaphore.release(host);
    return response;
},
```

**Error interceptor (line 283):**

```ts
(error) => {
    const url = (error as { config?: { url?: string; baseURL?: string } }).config?.url || '';
    const base = (error as { config?: { baseURL?: string } }).config?.baseURL || '';
    const resolvedUrl = url.startsWith('http') ? url : (base ? new URL(url, base).href : url);
    const host = extractHost(resolvedUrl);
    semaphore.release(host);
    throw error;
},
```

**Why this is the technically superior approach:**
- Works for ANY caller (XrayCloudClient, GitHubManager, GitLabManager)
- No changes required in callers
- Per-host throttling actually works
- Zero warnings (URL always valid)
- Resilient: handles both relative and absolute URLs

### 4.2 extractHost log level

**`host-semaphore.ts` — extractHost:**

```ts
export function extractHost(url: string): string {
    // Relative paths are expected in axios interceptors — not a warning
    if (!url.startsWith('http')) {
        return 'unknown';
    }
    try {
        const u = new URL(url);
        return u.hostname;
    } catch (err) {
        rootLogger.warn('extractHost: invalid absolute URL: ' + url);
        return 'unknown';
    }
}
```

**Why:** Paths relativos são comportamento esperado em interceptors axios. Warning só para URLs absolutas inválidas (que indicam bug real).

---

## 5. Test Strategy (AGENTS.md compliance)

### 5.1 Testing discipline

- **TDD:** Write failing tests FIRST, then fix code
- **PBT:** Property-based tests for URL resolution invariants
- **Strict mocks:** Mock ONLY external boundaries (Xray API, Jira API, HTTP). NEVER mock `extractHost`, `graphql()`, or `HostSemaphore` internals
- **Zero silent errors:** Tests MUST verify that GraphQL errors are logged, not swallowed
- **Rule 19.3:** Expected values from requirements, not current code output

### 5.2 Test files

| File | Tests | Focus |
|------|-------|-------|
| `shared/__tests__/xray-graphql-queries-red.test.ts` | ~4 | RED: queries fail with limit → GREEN: queries succeed without limit |
| `shared/__tests__/xray-graphql-error-handling.test.ts` | ~4 | GraphQL errors in response body are logged, not silent |
| `shared/__tests__/http-client-url-resolution-red.test.ts` | ~6 | RED: interceptors see relative path → GREEN: interceptors resolve full URL |
| `shared/__tests__/host-semaphore-extracthost.test.ts` | ~4 | extractHost handles relative paths, absolute URLs, invalid URLs |
| `shared/__tests__/xray-graphql-pbt.test.ts` | ~3 | PBT: all query responses have correct shape regardless of input |
| `jira_management/__tests__/clean-slate-xray-integration.test.ts` | ~3 | Integration: clean-slate with real Xray mock returning steps/preconditions |

### 5.3 PBT properties

1. **For all URLs `u`:** `extractHost(u)` returns a non-empty string
2. **For all absolute URLs `u`:** `extractHost(u)` returns the hostname (not 'unknown')
3. **For all relative paths `p` (starts with `/`):** `extractHost(p)` returns 'unknown' without warning

---

## 6. Implementation Order

1. **RED phase:** Write failing tests for both bugs
2. **Fix Bug 1:** Remove `limit` from GraphQL queries + harden `graphql()`
3. **GREEN phase:** Verify tests pass
4. **Fix Bug 2:** Resolve URL in interceptors + fix extractHost log level
5. **GREEN phase:** Verify tests pass
6. **PBT:** Write property-based tests
7. **Full test suite regression**
8. **Build clean**
9. **Live test ECSPOL-511**

---

## 7. Expected Outcome

### Before fix:
```
! extractHost: invalid URL, returning unknown    ×14 per issue
! Xray Cloud GraphQL call failed: 400            ×2 per issue
i snapshot: capturado estado de ECSPOL-1628 — desc=yes, steps=0, prec=0, links=0
```

### After fix:
```
i snapshot: capturado estado de ECSPOL-1628 — desc=yes, steps=3, prec=4, links=1
✓ clean-slate: update concluido para ECSPOL-1628
```

- Zero `extractHost` warnings
- Zero GraphQL 400 errors
- Steps and preconditions populated correctly
- Per-host throttling functional

---

## 8. Rules Compliance

- **Rule 4 (Root Cause):** Fixing query schema at origin, not suppressing errors
- **Rule 5 (Safety Immutability):** Tests written FIRST (TDD), not weakened
- **Rule 25 (Zero Silencing):** GraphQL errors logged, not swallowed
- **Rule 19 (Testing):** TDD, PBT, strict mocks, tests as source of truth
- **Rule 14 (Communication):** Factual, explicit, non-speculative
