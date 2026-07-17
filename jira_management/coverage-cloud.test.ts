import { describe, it, expect, vi } from 'vitest';

vi.mock('../shared/config-accessor.js', () => ({
    default: {
        getDefault: () => ({
            get: (key: string) => (key === 'jiraMode' ? 'cloud' : undefined),
        }),
        get: (key: string) => (key === 'jiraMode' ? 'cloud' : undefined),
    },
}));

import { analyzeCoverage } from './coverage.js';
import type JiraResource from './jira_resource.js';

function makeResource(): JiraResource {
    return {
        searchJiraIssues: vi.fn().mockResolvedValue({
            issues: [
                { key: 'TEST-1', fields: { summary: 'a' } },
                { key: 'TEST-2', fields: { summary: 'b' } },
            ],
        }),
        getFromOriginPath: vi.fn((path: string) => {
            if (path.includes('TEST-1')) return Promise.resolve([{ id: '1' }]);
            return Promise.resolve([]);
        }),
    } as unknown as JiraResource;
}

describe('AnalyzeCoverage (cloud mode)', () => {
    it('counts steps via the Xray raven steps endpoint, not the Jira steps field', async () => {
        expect.hasAssertions();

        const result = await analyzeCoverage(makeResource(), 'PROJ');

        expect(result.totalIssues).toBe(2);
        expect(result.mappedIssues).toBe(1);
        expect(result.unmappedSteps).toContain('TEST-2');
        expect(result.unmappedSteps).not.toContain('TEST-1');
    });

    it('does not mix the server Jira steps field into the cloud count', async () => {
        expect.hasAssertions();

        const resource = makeResource();
        // Even if a steps field were present on the Jira issue, cloud ignores it:
        (resource.searchJiraIssues as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            issues: [{ key: 'TEST-3', fields: { summary: 'c', steps: [{ action: 'x' }] } }],
        });
        const result = await analyzeCoverage(resource, 'PROJ');

        // raven steps returned [] for TEST-3 -> unmapped
        expect(result.mappedIssues).toBe(0);
        expect(result.unmappedSteps).toContain('TEST-3');
    });
});
