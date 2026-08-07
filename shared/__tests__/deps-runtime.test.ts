import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type * as HttpModule from 'node:http';

const require = createRequire(import.meta.url);

describe('Deps — runtime HTTP integrity (jira first-run crash root cause)', () => {
    it('importing the runtime dependency wall must not hijack http.ClientRequest (nock interceptor)', async () => {
        expect.hasAssertions();

        const httpModule = require('node:http') as typeof HttpModule;
        const originalClientRequest: typeof httpModule.ClientRequest = httpModule.ClientRequest;

        await import('../deps.js');

        expect(httpModule.ClientRequest).toBe(originalClientRequest);
    });
});
