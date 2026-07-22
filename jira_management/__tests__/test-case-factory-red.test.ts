/**
 * RED tests for BUG 9: CSV import doesn't update existing issues
 *
 * These tests verify that when skipExisting finds a match, the issue is updated (not skipped).
 */
import { describe, it, expect, vi } from 'vitest';
import TestCaseFactory from '../test-case-factory.js';
import type { JiraResourceLike } from '../../shared/types.js';

describe('BUG 9: CSV import doesn\'t update existing issues', () => {
    it('red: when skipexisting finds match, issue should be updated (not skipped)', async () => {
        expect.hasAssertions();

        const mockResource = {
            searchJiraIssues: vi.fn().mockResolvedValue({
                issues: [{ key: 'TEST-1', fields: { summary: 'Existing Test' } }],
            }),
            putJiraResource: vi.fn().mockResolvedValue({}),
            postJiraResource: vi.fn(),
        } as unknown as JiraResourceLike;

        const mockStepImporter = {
            importStep: vi.fn(),
            setSteps: vi.fn(),
        } as never;

        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        const result = await factory.createIssue({
            testData: { fields: { summary: 'Updated Test', project: 'TEST' } },
            testTitle: 'Existing Test',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            skipExisting: true,
        });

        // Should NOT be skipped
        expect(result.skipped).not.toBeTruthy();

        // Should be updated
        expect(result.updated).toBeTruthy();

        // Should have called putJiraResource
        expect(mockResource.putJiraResource).toHaveBeenCalledWith(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('green: when no match found, issue is created', async () => {
        expect.hasAssertions();

        const mockResource = {
            searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
            putJiraResource: vi.fn(),
            postJiraResource: vi.fn().mockResolvedValue({ key: 'TEST-NEW' }),
        } as unknown as JiraResourceLike;

        const mockStepImporter = {
            importStep: vi.fn(),
            setSteps: vi.fn(),
        } as never;

        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        const result = await factory.createIssue({
            testData: { fields: { summary: 'New Test', project: 'TEST' } },
            testTitle: 'New Test',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            skipExisting: true,
        });

        expect(result.key).toBe('TEST-NEW');
        expect(result.skipped).toBeUndefined();
        expect(result.updated).toBeUndefined();
        expect(mockResource.postJiraResource).toHaveBeenCalledWith(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('green: when search fails, gracefully continues to create', async () => {
        expect.hasAssertions();

        const mockResource = {
            searchJiraIssues: vi.fn().mockRejectedValue(new Error('Search failed')),
            putJiraResource: vi.fn(),
            postJiraResource: vi.fn().mockResolvedValue({ key: 'TEST-NEW' }),
        } as unknown as JiraResourceLike;

        const mockStepImporter = {
            importStep: vi.fn(),
            setSteps: vi.fn(),
        } as never;

        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        const result = await factory.createIssue({
            testData: { fields: { summary: 'New Test', project: 'TEST' } },
            testTitle: 'New Test',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            skipExisting: true,
        });

        // Should create new issue when search fails
        expect(result.key).toBe('TEST-NEW');
        expect(result.skipped).toBeUndefined();
        expect(result.updated).toBeUndefined();
    });
});
