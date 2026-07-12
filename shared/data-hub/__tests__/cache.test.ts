/**
 * Unit tests for session cache.
 *
 * Tests cache get/set/clear/valid operations for multi-project support.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedHub, setCachedHub, clearCache, clearRepoCache, isCacheValid, getCacheSize } from '../cache.js';
import type { DataHub } from '../../types/data-hub.js';
import { makeDataHubMock } from '../../test-utils/factories/data-hub-mock.js';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function makeHub(repo = 'test/repo'): DataHub {
    return makeDataHubMock({ repo });
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Session Cache', () => {
    beforeEach(() => {
        clearCache();
    });

    it('returns undefined on cache miss', () => {
        const result = getCachedHub('test/repo');

        expect(result).toBeUndefined();
    });

    it('returns cached hub on cache hit', () => {
        const hub = makeHub('test/repo');
        setCachedHub('test/repo', hub);

        const result = getCachedHub('test/repo');

        expect(result).toBe(hub);
    });

    it('returns undefined for different repo', () => {
        const hub = makeHub('repo-a');
        setCachedHub('repo-a', hub);

        const result = getCachedHub('repo-b');

        expect(result).toBeUndefined();
    });

    it('clears cache', () => {
        const hub = makeHub('test/repo');
        setCachedHub('test/repo', hub);
        clearCache();

        const result = getCachedHub('test/repo');

        expect(result).toBeUndefined();
    });
});

/* ── Multi-project cache ────────────────────────────────────────────────── */

describe('Multi-project Cache', () => {
    beforeEach(() => {
        clearCache();
    });

    it('stores multiple repos independently', () => {
        const hubA = makeHub('repo-a');
        const hubB = makeHub('repo-b');
        setCachedHub('repo-a', hubA);
        setCachedHub('repo-b', hubB);

        expect(getCachedHub('repo-a')).toBe(hubA);
        expect(getCachedHub('repo-b')).toBe(hubB);
        expect(getCacheSize()).toBe(2);
    });

    it('clearRepoCache evicts only specified repo', () => {
        const hubA = makeHub('repo-a');
        const hubB = makeHub('repo-b');
        setCachedHub('repo-a', hubA);
        setCachedHub('repo-b', hubB);

        clearRepoCache('repo-a');

        expect(getCachedHub('repo-a')).toBeUndefined();
        expect(getCachedHub('repo-b')).toBe(hubB);
        expect(getCacheSize()).toBe(1);
    });

    it('isCacheValid returns correct status', () => {
        expect(isCacheValid('repo-a')).toBeFalsy();

        setCachedHub('repo-a', makeHub('repo-a'));

        expect(isCacheValid('repo-a')).toBeTruthy();
        expect(isCacheValid('repo-b')).toBeFalsy();
    });

    it('overwrites existing cache entry for same repo', () => {
        const hubV1 = makeHub('repo-a');
        const hubV2 = makeHub('repo-a');
        setCachedHub('repo-a', hubV1);
        setCachedHub('repo-a', hubV2);

        expect(getCachedHub('repo-a')).toBe(hubV2);
        expect(getCacheSize()).toBe(1);
    });

    it('getCacheSize returns accurate count', () => {
        expect(getCacheSize()).toBe(0);

        setCachedHub('a', makeHub('a'));

        expect(getCacheSize()).toBe(1);

        setCachedHub('b', makeHub('b'));

        expect(getCacheSize()).toBe(2);

        clearRepoCache('a');

        expect(getCacheSize()).toBe(1);

        clearCache();

        expect(getCacheSize()).toBe(0);
    });
});

describe('GetOrFetchWithLock', () => {
    beforeEach(() => {
        clearCache();
    });

    it('returns cached hub if exists', async () => {
        expect.hasAssertions();

        const { getOrFetchWithLock } = await import('../cache.js');
        const mockHub = makeHub('test');
        setCachedHub('test', mockHub);
        const fetchFn = vi.fn();
        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toBe(mockHub);
    });

    it('calls fetchFn on cache miss', async () => {
        expect.hasAssertions();

        const { getOrFetchWithLock } = await import('../cache.js');
        const mockHub = makeHub('test');
        const fetchFn = vi.fn().mockResolvedValue(mockHub);
        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(mockHub);
    });

    it('prevents duplicate concurrent fetches', async () => {
        expect.hasAssertions();

        const { getOrFetchWithLock } = await import('../cache.js');
        const mockHub = makeHub('test');
        const fetchFn = vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return mockHub;
        });
        const [result1, result2] = await Promise.all([
            getOrFetchWithLock('test', fetchFn),
            getOrFetchWithLock('test', fetchFn),
        ]);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result1).toBe(mockHub);
        expect(result2).toBe(mockHub);
    });

    it('allows fetch after lock released', async () => {
        expect.hasAssertions();

        const { getOrFetchWithLock } = await import('../cache.js');
        const mockHub1 = makeHub('test');
        const mockHub2 = makeHub('test');
        const fetchFn = vi.fn().mockResolvedValueOnce(mockHub1).mockResolvedValueOnce(mockHub2);
        await getOrFetchWithLock('test', fetchFn);
        clearRepoCache('test');
        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(result).toBe(mockHub2);
    });
});
