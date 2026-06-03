/**
 * In-memory + disk cache for LLM responses.
 * Memory cache uses TTL eviction; disk cache delegates to `disk-cache.ts`.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { diskCacheGet, diskCacheSet, clearDiskCache } from './disk-cache';
import { rootLogger } from './logger';
import type { ZodSchemaTyped as ZodSchema } from './types';

// ---- types ----

interface CacheEntry {
    response: string;
    expiresAt: number;
}

export type ProviderConfig = {
    apiKey: string;
    model: string;
    baseUrl: string;
    temperature: number;
    responseFormat?: string;
};

// ---- constants ----

export const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = CACHE_TTL_MS / 2;

// ---- state ----

const cache = new Map<string, CacheEntry>();
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ---- helpers ----

export function configUniqueKey(cfg: ProviderConfig): string {
    return (
        cfg.baseUrl +
        '|' +
        cfg.model +
        '|' +
        cfg.temperature +
        '|' +
        (cfg.responseFormat || 'text') +
        '|' +
        (cfg.apiKey ? crypto.createHash('sha256').update(cfg.apiKey).digest('hex').slice(0, 8) : '')
    );
}

export function cacheKey(
    tier: string,
    cfgKey: string,
    system: string,
    user: string,
    callerId?: string,
    responseFormat?: string,
): string {
    return crypto
        .createHash('sha256')
        .update(
            (callerId || '') + '|' + tier + '|' + cfgKey + '|' + (responseFormat || 'text') + '|' + system + '|' + user,
        )
        .digest('hex');
}

function parseRawOnce(raw: string): Record<string, unknown> | null {
    try {
        const json: unknown = JSON.parse(raw);
        const result = z.record(z.string(), z.unknown()).safeParse(json);
        return result.success ? result.data : null;
    } catch {
        /* cleanup — cache file cleanup, falha não afeta o fluxo */
        return null;
    }
}

function _validateWithSchema<T>(raw: string, schema: ZodSchema<T>): T | null {
    const parsed = parseRawOnce(raw);
    if (!parsed) return null;
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    return null;
}

function _warnIfNotJson(raw: string): void {
    const parsed = parseRawOnce(raw);
    if (!parsed) {
        rootLogger.warn('LLM response expected JSON but was not parseable — returning raw text');
    }
}

// ---- startup ----

function startCacheCleanup(): void {
    if (_cleanupTimer !== null) return;
    _cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of cache) {
            if (entry.expiresAt <= now) cache.delete(key);
        }
    }, CACHE_CLEANUP_INTERVAL_MS);
    if (_cleanupTimer && typeof _cleanupTimer === 'object' && 'unref' in _cleanupTimer) {
        _cleanupTimer.unref();
    }
}

startCacheCleanup();

// ---- public API ----

export interface CacheLookupResult<T> {
    data: T | null;
    hit: boolean;
}

export function checkMemoryCache<T>(
    cKey: string,
    tier: string,
    callerId: string | undefined,
    schema: ZodSchema<T> | undefined,
    responseFormat: string | undefined,
): CacheLookupResult<T> {
    const cached = cache.get(cKey);
    if (!cached || cached.expiresAt <= Date.now()) return { data: null, hit: false };
    rootLogger.info('LLM cache hit for tier=' + tier + (callerId ? ' callerId=' + callerId : ''));
    if (schema) {
        const valid = _validateWithSchema(cached.response, schema);
        if (valid !== null) return { data: valid, hit: true };
        rootLogger.warn('LLM cache hit but schema invalid — re-requesting');
        cache.delete(cKey);
        return { data: null, hit: false };
    }
    if (responseFormat === 'json') _warnIfNotJson(cached.response);
    const strResult = z.string().safeParse(cached.response);
    if (!strResult.success) return { data: null, hit: false };
    return { data: strResult.data as T, hit: true };
}

export function checkDiskCache<T>(
    cKey: string,
    schema: ZodSchema<T> | undefined,
    responseFormat: string | undefined,
): CacheLookupResult<T> {
    const diskCached = diskCacheGet(cKey);
    if (diskCached === null) return { data: null, hit: false };
    if (schema) {
        const valid = _validateWithSchema(diskCached, schema);
        if (valid !== null) {
            cache.set(cKey, { response: diskCached, expiresAt: Date.now() + CACHE_TTL_MS });
            return { data: valid, hit: true };
        }
        rootLogger.warn('LLM disk cache hit but schema invalid — re-requesting');
        return { data: null, hit: false };
    }
    if (responseFormat === 'json') _warnIfNotJson(diskCached);
    cache.set(cKey, { response: diskCached, expiresAt: Date.now() + CACHE_TTL_MS });
    const strResult = z.string().safeParse(diskCached);
    if (!strResult.success) return { data: null, hit: false };
    return { data: strResult.data as T, hit: true };
}

export function setMemoryCache(cKey: string, response: string): void {
    cache.set(cKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function setDiskCache(cKey: string, response: string): void {
    diskCacheSet(cKey, response);
}

/** Evict all cached LLM responses (memory + disk). */
export function clearCache(): void {
    cache.clear();
    clearDiskCache();
}

export function checkSchema<T>(raw: string, schema: ZodSchema<T>): T | null {
    return _validateWithSchema(raw, schema);
}

export function warnIfNotJson(raw: string): void {
    _warnIfNotJson(raw);
}
