/**
 * GREEN tests for BUG 8: CloudStepImporter receives wrong resource
 *
 * Verified: createStepImporter now receives jiraResourceXray (not jiraResource).
 */
import { describe, it, expect } from 'vitest';

describe('BUG 8: CloudStepImporter receives correct resource', () => {
    it('green: createStepImporter uses jiraResourceXray', async () => {
        expect.hasAssertions();

        const fs = await import('node:fs');
        const content = fs.readFileSync(
            new URL('../../jira_management/import-orchestrator.ts', import.meta.url),
            'utf-8',
        );

        const lines = content.split('\n');
        const createStepLine = lines.find((l) => l.includes('createStepImporter(') && !l.includes('import'));

        expect(createStepLine).toContain('jiraResourceXray');
        expect(createStepLine).not.toContain('createStepImporter(jiraResource,');
    });
});
