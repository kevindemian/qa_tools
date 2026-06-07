import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';
import { analyzeCoverage } from './coverage.js';

let mockJiraResource: ReturnType<typeof createMockJiraResource>;

beforeEach(() => {
    mockJiraResource = createMockJiraResource();
});

describe('analyzeCoverage', () => {
    it('returns coverage result with some mapped and some unmapped', async () => {
        mockJiraResource.searchJiraIssues.mockResolvedValueOnce({
            issues: [
                { key: 'TEST-1', fields: { summary: 'With steps', steps: [{ action: 'Step 1' }] } },
                {
                    key: 'TEST-2',
                    fields: { summary: 'With steps', steps: [{ action: 'Step A' }, { action: 'Step B' }] },
                },
                { key: 'TEST-3', fields: { summary: 'No steps' } },
                { key: 'TEST-4', fields: { summary: 'No steps' } },
            ],
            total: 4,
        });

        const result = await analyzeCoverage(mockJiraResource, 'TEST');

        expect(result.totalIssues).toBe(4);
        expect(result.mappedIssues).toBe(2);
        expect(result.totalSteps).toBe(3);
        expect(result.unmappedSteps).toEqual(['TEST-3', 'TEST-4']);
        expect(result.coveragePct).toBe(50);
    });

    it('handles empty response', async () => {
        mockJiraResource.searchJiraIssues.mockResolvedValueOnce({ issues: [], total: 0 });

        const result = await analyzeCoverage(mockJiraResource, 'TEST');

        expect(result.totalIssues).toBe(0);
        expect(result.mappedIssues).toBe(0);
        expect(result.coveragePct).toBe(0);
        expect(result.unmappedSteps).toEqual([]);
    });

    it('handles network error and returns zero coverage', async () => {
        mockJiraResource.searchJiraIssues.mockRejectedValueOnce(new Error('Network error'));

        const result = await analyzeCoverage(mockJiraResource, 'TEST');

        expect(result.totalIssues).toBe(0);
        expect(result.coveragePct).toBe(0);
    });

    it('groups gaps by epic when epic field is present', async () => {
        const mockEpic1 = { key: 'EPIC-1' };
        const mockEpic2 = { key: 'EPIC-2' };
        mockJiraResource.searchJiraIssues.mockResolvedValueOnce({
            issues: [
                { key: 'TEST-1', fields: { summary: 'No steps', customfield_10014: mockEpic1 } },
                { key: 'TEST-2', fields: { summary: 'No steps', customfield_10014: mockEpic2 } },
                { key: 'TEST-3', fields: { summary: 'No steps', customfield_10014: mockEpic2 } },
                { key: 'TEST-4', fields: { summary: 'With steps', steps: [{ action: 'Step' }] } },
            ],
            total: 4,
        });

        const result = await analyzeCoverage(mockJiraResource, 'TEST');

        expect(result.gapsByEpic['EPIC-1']).toEqual(['TEST-1']);
        expect(result.gapsByEpic['EPIC-2']).toEqual(['TEST-2', 'TEST-3']);
    });

    it('handles epic as object without key property', async () => {
        mockJiraResource.searchJiraIssues.mockResolvedValueOnce({
            issues: [
                { key: 'TEST-1', fields: { summary: 'No steps', customfield_10014: { value: 'something' } } },
                { key: 'TEST-2', fields: { summary: 'No steps', epic: true } },
            ],
            total: 2,
        });
        const result = await analyzeCoverage(mockJiraResource, 'TEST');
        expect(result.gapsByEpic).toEqual({});
    });
});
