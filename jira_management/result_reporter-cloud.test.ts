import { describe, it, expect, vi } from 'vitest';

vi.mock('../shared/config', () => ({
    default: {
        getDefault: () => ({
            get: (_key: string) => undefined,
        }),
        get: (_key: string) => undefined,
    },
}));

import { importExecutionResults } from './result_reporter.js';
import type { JiraResourceLike } from '../shared/types.js';

function makeResource(withApiRoot: boolean): JiraResourceLike {
    const base: JiraResourceLike = {
        getJiraResource: vi.fn().mockResolvedValue({}),
        postJiraResource: vi.fn().mockResolvedValue({}),
        putJiraResource: vi.fn().mockResolvedValue(null),
        searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
        getTransitionsForIssue: vi.fn().mockResolvedValue({}),
        transitionIssue: vi.fn().mockResolvedValue(undefined),
    };
    if (withApiRoot) {
        base.postToApiRoot = vi.fn().mockResolvedValue(null);
    }
    return base;
}

const matched = [
    { key: 'TEST-1', status: 'passed', duration: 10 },
    { key: 'TEST-2', status: 'failed', duration: 20 },
    { key: 'TEST-3', status: 'skipped', duration: 5 },
];

describe('ImportExecutionResults (C0)', () => {
    it('POSTs a raven 2.0 execution import with PASS/FAIL status mapping', async () => {
        expect.hasAssertions();

        const resource = makeResource(true);
        await importExecutionResults(resource, 'EXEC-1', matched);

        const mock = resource.postToApiRoot as ReturnType<typeof vi.fn>;

        expect(mock).toHaveBeenCalledWith();

        const calls = mock.mock.calls;

        expect(calls).toHaveLength(1);

        const call = calls[0];
        if (!call) throw new Error('expected import call');

        expect(call[0]).toBe('rest/raven/2.0/api/import/execution/json');

        const payload = call[1] as {
            info: { testExecutionKey: string };
            tests: Array<{ testKey: string; status: string }>;
        };

        expect(payload.info.testExecutionKey).toBe('EXEC-1');
        expect(payload.tests).toContainEqual(expect.objectContaining({ testKey: 'TEST-1', status: 'PASS' }));
        expect(payload.tests).toContainEqual(expect.objectContaining({ testKey: 'TEST-2', status: 'FAIL' }));
        // skipped tests are excluded from import
        expect(payload.tests.find((t) => t.testKey === 'TEST-3')).toBeUndefined();
    });

    it('skips import (with explicit log) when postToApiRoot is unsupported', async () => {
        expect.hasAssertions();

        const resource = makeResource(false);
        await importExecutionResults(resource, 'EXEC-1', matched);

        expect(resource.postToApiRoot).toBeUndefined();
    });

    it('reports import errors explicitly (never silent) and resolves', async () => {
        expect.hasAssertions();

        const resource = makeResource(true);
        const mock = resource.postToApiRoot as ReturnType<typeof vi.fn>;
        mock.mockRejectedValueOnce(new Error('401 Unauthorized'));

        await expect(importExecutionResults(resource, 'EXEC-1', matched)).resolves.toBeUndefined();
        expect(mock).toHaveBeenCalledWith();
    });
});
