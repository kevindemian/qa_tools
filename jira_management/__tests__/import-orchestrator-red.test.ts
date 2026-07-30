/**
 * RED tests for BUG 8: CloudStepImporter receives wrong resource
 *
 * Behavior tests: verify that testCreationSetup passes jiraResource (not jiraResourceXray)
 * to createStepImporter. Tests exercise the actual call chain with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraResourceLike } from '../../shared/types.js';

vi.mock('../../shared/config-accessor.js', () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'xrayMode') return 'cloud';
            if (key === 'autoConfirm') return false;
            return undefined;
        }),
        set: vi.fn(),
    },
}));

vi.mock('../xray-client.js', () => ({
    createStepImporter: vi.fn().mockReturnValue({
        importStep: vi.fn(),
        setSteps: vi.fn(),
    }),
}));

vi.mock('../../shared/ui/prompt.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    showSelect: vi.fn().mockResolvedValue('skip'),
}));

vi.mock('../jira_link_manager.js', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            preconditionHandler: { setTransientErrorHandler: vi.fn() },
            linkTypeManager: {},
            linkOperations: {},
            jiraResource: {},
        })),
    };
});

vi.mock('../issue-linker.js', () => ({
    default: class MockIssueLinker {
        constructor(..._args: unknown[]) {}
    },
}));

vi.mock('../test-case-factory.js', () => ({
    default: class MockTestCaseFactory {
        constructor(..._args: unknown[]) {}
        setSnapshotContext = vi.fn();
        setStepFailureHandler = vi.fn();
    },
}));

import { testCreationSetup } from '../import-orchestrator.js';
import { createStepImporter } from '../xray-client.js';
import Config from '../../shared/config-accessor.js';

describe('BUG 8: CloudStepImporter receives correct resource', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(Config.get).mockImplementation((key: string) => {
            if (key === 'xrayMode') return 'cloud';
            if (key === 'autoConfirm') return false;
            return undefined;
        });
    });

    it('passes jiraResource (first arg) to createStepImporter, not jiraResourceXray', () => {
        expect.hasAssertions();

        const jiraResource = { baseUrl: 'https://jira.example.com' } as unknown as JiraResourceLike;
        const jiraResourceXray = { baseUrl: 'https://xray.example.com' } as unknown as JiraResourceLike;
        const linkManager = {
            preconditionHandler: { setTransientErrorHandler: vi.fn() },
        } as never;

        testCreationSetup(jiraResource, jiraResourceXray, linkManager);

        expect(createStepImporter).toHaveBeenCalledTimes(1);
        expect(createStepImporter).toHaveBeenCalledWith(jiraResource, 'cloud');
    });

    it('does NOT pass jiraResourceXray to createStepImporter', () => {
        expect.hasAssertions();

        const jiraResource = { baseUrl: 'https://jira.example.com' } as unknown as JiraResourceLike;
        const jiraResourceXray = { baseUrl: 'https://xray.example.com' } as unknown as JiraResourceLike;
        const linkManager = {
            preconditionHandler: { setTransientErrorHandler: vi.fn() },
        } as never;

        testCreationSetup(jiraResource, jiraResourceXray, linkManager);

        expect(createStepImporter).not.toHaveBeenCalledWith(jiraResourceXray, expect.anything());
    });
});
