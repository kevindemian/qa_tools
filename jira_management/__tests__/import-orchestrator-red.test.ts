/**
 * RED tests for BUG 8: CloudStepImporter receives wrong resource
 *
 * These tests verify that CloudStepImporter receives jiraResource (not jiraResourceXray).
 */
import { describe, it, expect } from 'vitest';

// Test the fix by verifying the code uses jiraResource instead of jiraResourceXray
describe('BUG 8: CloudStepImporter receives wrong resource', () => {
    it('red: verify fix was applied correctly', async () => {
        expect.hasAssertions();

        // Read the import-orchestrator.ts file and check the fix
        const fs = await import('node:fs');
        const content = fs.readFileSync(
            '/home/kdemian/PROJETOS/qa_tools/qa_tools/jira_management/import-orchestrator.ts',
            'utf-8',
        );

        // The fix should use jiraResource, not jiraResourceXray
        expect(content).toContain('createStepImporter(jiraResource, Config.get');
        expect(content).not.toContain('createStepImporter(jiraResourceXray');
    });

    it('green: verify the fix is in place', async () => {
        expect.hasAssertions();

        const fs = await import('node:fs');
        const content = fs.readFileSync(
            '/home/kdemian/PROJETOS/qa_tools/qa_tools/jira_management/import-orchestrator.ts',
            'utf-8',
        );

        // Find the line with createStepImporter call (not import)
        const lines = content.split('\n');
        const createStepLine = lines.find(
            (l) => l.includes('createStepImporter(') && !l.includes('import'),
        );

        expect(createStepLine).toContain('jiraResource');
        expect(createStepLine).not.toContain('jiraResourceXray');
    });
});
