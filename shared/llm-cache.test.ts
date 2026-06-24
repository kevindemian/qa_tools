vi.mock('./disk-cache', () => ({
    diskCacheGet: vi.fn(() => null),
    diskCacheSet: vi.fn(),
    clearDiskCache: vi.fn(),
}));

import { z } from 'zod';
import { diskCacheGet, diskCacheSet, clearDiskCache } from './disk-cache.js';
import {
    configUniqueKey,
    cacheKey,
    checkMemoryCache,
    checkDiskCache,
    setMemoryCache,
    setDiskCache,
    clearCache,
    checkSchema,
    warnIfNotJson,
    CACHE_TTL_MS,
} from './llm-cache.js';
import { rootLogger } from './logger.js';

const testSchema = z.object({ ok: z.boolean() });

function makeCfg(
    overrides: Partial<{
        apiKey: string;
        model: string;
        baseUrl: string;
        temperature: number;
        responseFormat?: string;
    }> = {},
) {
    return {
        apiKey: overrides.apiKey ?? 'sk-test',
        model: overrides.model ?? 'gpt-4',
        baseUrl: overrides.baseUrl ?? 'https://api.test.com/v1',
        temperature: overrides.temperature ?? 0.3,
        ...(overrides.responseFormat !== undefined ? { responseFormat: overrides.responseFormat } : {}),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
    vi.useRealTimers();
});

describe('ConfigUniqueKey', () => {
    it('generates a unique key from provider config', () => {
        const key = configUniqueKey(makeCfg());

        expect(key).toContain('https://api.test.com/v1');
        expect(key).toContain('gpt-4');
        expect(key).toContain('0.3');
    });

    it('includes api key hash when present', () => {
        const withKey = configUniqueKey(makeCfg({ apiKey: 'sk-test12345' }));
        const withoutKey = configUniqueKey(makeCfg({ apiKey: '' }));

        expect(withKey).not.toBe(withoutKey);
    });

    it('defaults responseFormat to text when not provided', () => {
        const key = configUniqueKey(makeCfg());

        expect(key).toContain('text');
    });

    it('includes responseFormat when provided', () => {
        const key = configUniqueKey(makeCfg({ responseFormat: 'json' }));

        expect(key).toContain('json');
    });
});

describe('CacheKey', () => {
    it('generates a deterministic 64-char hex string', () => {
        const key = cacheKey('main', 'cfgKey', 'system prompt', 'user message');

        expect(key).toHaveLength(64);
        expect(/^[a-f0-9]+$/.test(key)).toBeTruthy();
    });

    it('produces different keys for different inputs', () => {
        const k1 = cacheKey('main', 'cfg1', 'sys', 'usr');
        const k2 = cacheKey('main', 'cfg1', 'sys', 'different');

        expect(k1).not.toBe(k2);
    });

    it('includes callerId when provided', () => {
        const withCaller = cacheKey('main', 'cfg', 'sys', 'usr', 'caller1');
        const withoutCaller = cacheKey('main', 'cfg', 'sys', 'usr');

        expect(withCaller).not.toBe(withoutCaller);
    });

    it('includes responseFormat when provided', () => {
        const jsonKey = cacheKey('main', 'cfg', 'sys', 'usr', undefined, 'json');
        const textKey = cacheKey('main', 'cfg', 'sys', 'usr', undefined, 'text');

        expect(jsonKey).not.toBe(textKey);
    });
});

describe('CheckMemoryCache', () => {
    it('returns miss when key is not in cache', () => {
        const result = checkMemoryCache('nonexistent', 'main', undefined, undefined, undefined);

        expect(result.hit).toBeFalsy();
        expect(result.data).toBeNull();
    });

    it('returns hit when key is in cache and not expired', () => {
        setMemoryCache('test-key', 'cached response');
        const result = checkMemoryCache('test-key', 'main', undefined, undefined, undefined);

        expect(result.hit).toBeTruthy();
        expect(result.data).toBe('cached response');
    });

    it('returns miss when cached entry has expired', () => {
        setMemoryCache('expired-key', 'stale');
        vi.useFakeTimers();
        vi.advanceTimersByTimeAsync(CACHE_TTL_MS + 1000);
        const result = checkMemoryCache('expired-key', 'main', undefined, undefined, undefined);

        expect(result.hit).toBeFalsy();
        expect(result.data).toBeNull();

        vi.useRealTimers();
    });

    it('returns validated data when schema matches', () => {
        setMemoryCache('schema-key', '{"ok": true}');
        const result = checkMemoryCache('schema-key', 'main', 'caller', testSchema, 'json');

        expect(result.hit).toBeTruthy();
        expect(result.data).toStrictEqual({ ok: true });
    });

    it('returns miss and deletes entry when schema validation fails', () => {
        setMemoryCache('bad-schema', '{"ok": "not_boolean"}');
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        const result = checkMemoryCache('bad-schema', 'main', 'caller', testSchema, 'json');

        expect(result.hit).toBeFalsy();
        expect(result.data).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('schema invalid'));

        const secondCheck = checkMemoryCache('bad-schema', 'main', undefined, undefined, undefined);

        expect(secondCheck.hit).toBeFalsy();

        warnSpy.mockRestore();
    });

    it('warns when responseFormat=json but content is not JSON', () => {
        setMemoryCache('nonjson-key', 'not json at all');
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        checkMemoryCache('nonjson-key', 'main', undefined, undefined, 'json');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not parseable'));

        warnSpy.mockRestore();
    });

    it('returns hit with raw string when no schema and format is text', () => {
        setMemoryCache('raw-key', 'plain text');
        const result = checkMemoryCache('raw-key', 'main', undefined, undefined, 'text');

        expect(result.hit).toBeTruthy();
        expect(result.data).toBe('plain text');
    });
});

describe('CheckDiskCache', () => {
    it('returns miss when disk cache returns null', () => {
        vi.mocked(diskCacheGet).mockReturnValue(null);
        const result = checkDiskCache('missing', undefined, undefined);

        expect(result.hit).toBeFalsy();
        expect(result.data).toBeNull();
    });

    it('returns hit with string when disk cache has data without schema', () => {
        vi.mocked(diskCacheGet).mockReturnValue('disk value');
        const result = checkDiskCache('disk-key', undefined, undefined);

        expect(result.hit).toBeTruthy();
        expect(result.data).toBe('disk value');
    });

    it('returns validated data and populates memory cache when schema matches', () => {
        vi.mocked(diskCacheGet).mockReturnValue('{"ok": true}');
        const result = checkDiskCache('disk-schema', testSchema, 'json');

        expect(result.hit).toBeTruthy();
        expect(result.data).toStrictEqual({ ok: true });

        const memHit = checkMemoryCache('disk-schema', 'main', undefined, undefined, undefined);

        expect(memHit.hit).toBeTruthy();
    });

    it('warns and returns miss when disk cache data fails schema', () => {
        vi.mocked(diskCacheGet).mockReturnValue('{"ok": "bad"}');
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        const result = checkDiskCache('disk-bad-schema', testSchema, 'json');

        expect(result.hit).toBeFalsy();
        expect(result.data).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('disk cache hit but schema invalid'));

        warnSpy.mockRestore();
    });

    it('warns when responseFormat=json but content is not JSON from disk', () => {
        vi.mocked(diskCacheGet).mockReturnValue('not json');
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        checkDiskCache('disk-nonjson', undefined, 'json');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not parseable'));

        warnSpy.mockRestore();
    });
});

describe('SetMemoryCache / setDiskCache', () => {
    it('setMemoryCache stores and can be retrieved', () => {
        setMemoryCache('store-key', 'stored value');
        const result = checkMemoryCache('store-key', 'main', undefined, undefined, undefined);

        expect(result.hit).toBeTruthy();
        expect(result.data).toBe('stored value');
    });

    it('setDiskCache calls diskCacheSet', () => {
        setDiskCache('disk-write-key', 'disk value');

        expect(diskCacheSet).toHaveBeenCalledWith('disk-write-key', 'disk value');
    });
});

describe('ClearCache', () => {
    it('clears memory cache', () => {
        setMemoryCache('clear-key', 'value');
        clearCache();
        const result = checkMemoryCache('clear-key', 'main', undefined, undefined, undefined);

        expect(result.hit).toBeFalsy();
    });

    it('calls clearDiskCache', () => {
        vi.mocked(clearDiskCache).mockClear();
        clearCache();

        expect(clearDiskCache).toHaveBeenCalledTimes(1);
    });
});

describe('CheckSchema', () => {
    it('returns validated data when schema matches', () => {
        const result = checkSchema('{"ok": true}', testSchema);

        expect(result).toStrictEqual({ ok: true });
    });

    it('returns null when raw string is not valid JSON', () => {
        const result = checkSchema('not json', testSchema);

        expect(result).toBeNull();
    });

    it('returns null when schema validation fails', () => {
        const result = checkSchema('{"ok": "not_boolean"}', testSchema);

        expect(result).toBeNull();
    });
});

describe('WarnIfNotJson', () => {
    it('does not warn when response is valid JSON', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        warnIfNotJson('{"valid": true}');

        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('warns when response is not valid JSON', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        warnIfNotJson('plain text with no json');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not parseable'));

        warnSpy.mockRestore();
    });
});
