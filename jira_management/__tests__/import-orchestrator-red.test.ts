/**
 * Tests for BUG 8 regression: step importer resource must match the mode.
 *
 * The step importer receives a resource whose use depends on the mode:
 *  - Cloud mode: CloudStepImporter resolves the Jira numeric id via
 *    GET issue/{key} (xray-client.ts `_resolveNumericId`) — it needs the JIRA
 *    resource. The Xray GraphQL calls go through XrayCloudClient with its own
 *    base URL.
 *  - Server mode: ServerStepImporter POSTs test/{key}/steps to the Xray Server
 *    base — it needs the XRAY resource.
 * A hardcoded single resource breaks one of the two modes (§7): server mode
 * got a Jira base URL (steps hit the wrong path), cloud mode got an Xray base
 * URL that does not serve `issue/*` (Invalid URL at runtime).
 */
import { describe, it, expect } from 'vitest';

describe('BUG 8: step importer resource is mode-dependent', () => {
    function createStepLine(): string | undefined {
        const fs = require('node:fs');
        const content = fs.readFileSync(
            new URL('../../jira_management/import-orchestrator.ts', import.meta.url),
            'utf-8',
        );
        return content.split('\n').find((l: string) => l.includes('createStepImporter(') && !l.includes('import'));
    }

    it('cloud mode resolves jiraResource', async () => {
        expect.hasAssertions();
        const line = createStepLine();
        expect(line).toContain("mode === 'cloud' ? jiraResource : jiraResourceXray");
    });

    it('createStepImporter receives the mode-selected resource, not a hardcoded one', async () => {
        expect.hasAssertions();
        const line = createStepLine();
        expect(line).toContain('createStepImporter(');
        expect(line).not.toMatch(/createStepImporter\(jiraResource, Config\.get\('xrayMode'\)\)/);
        expect(line).not.toMatch(/createStepImporter\(jiraResourceXray, Config\.get\('xrayMode'\)\)/);
    });

    it('testCreationSetup accepts both jiraResource and jiraResourceXray', async () => {
        expect.hasAssertions();
        const fs = require('node:fs');
        const content = fs.readFileSync(
            new URL('../../jira_management/import-orchestrator.ts', import.meta.url),
            'utf-8',
        );
        const setup = content.match(/function testCreationSetup\([\s\S]*?\)/);
        expect(setup?.[0]).toContain('jiraResource: JiraResourceLike,');
        expect(setup?.[0]).toContain('jiraResourceXray: JiraResourceLike,');
    });
});
