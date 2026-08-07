import nock from 'nock';

/** Test-only bridge: reexports nock for tests outside `shared/` (DepWall: direct
 * external imports are forbidden in `git_triggers/**` and `jira_management/**`).
 * nock MUST stay out of `shared/deps.ts` — importing it activates the global
 * http.ClientRequest interceptor at import time, breaking runtime egress proxies. */
export default nock;
