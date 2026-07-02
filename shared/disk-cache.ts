/** Disk-backed LLM response cache with AES-256-GCM encryption (when `LLM_CACHE_KEY` is set) and TTL expiry. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sanitizePath } from './path-utils.js';
import { z } from 'zod';
import { rootLogger } from './logger.js';
import Config from './config.js';

const DISK_CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_DIR_PERM = 0o700;
const CACHE_FILE_PERM = 0o600;

interface DiskCacheEntry {
    response: string;
    createdAt: number;
}

const DiskCacheEntrySchema = z.object({
    response: z.string(),
    createdAt: z.number(),
});

const EncryptedPayloadSchema = z.object({
    e: z.string(),
    iv: z.string(),
    t: z.string(),
});

function cacheDir(): string {
    return Config.get('LLM_DISK_CACHE_DIR') || path.join(process.cwd(), '.llm-cache');
}

function filePath(key: string): string {
    return sanitizePath(cacheDir(), key + '.json');
}

function cacheKeyBytes(): Buffer {
    const raw = Config.get('LLM_CACHE_KEY');
    if (!raw) return Buffer.alloc(0);
    return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext: string): string {
    const key = cacheKeyBytes();
    if (key.length === 0) return plaintext;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        e: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        t: tag.toString('base64'),
    });
}

function decrypt(data: string): string | null {
    const key = cacheKeyBytes();
    if (key.length === 0) return data;
    try {
        const parsed: unknown = JSON.parse(data);
        const p = EncryptedPayloadSchema.parse(parsed);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(p.t, 'base64'));
        return decipher.update(Buffer.from(p.e, 'base64'), undefined, 'utf8') + decipher.final('utf8');
    } catch (err: unknown) {
        rootLogger.debug(
            'Disk cache decrypt failed — treating as cache miss: ' + (err instanceof Error ? err.message : String(err)),
        );
        return null;
    }
}

function ensureCacheDir(dir: string): void {
    try {
        if (!fs.existsSync(path.resolve(dir))) {
            fs.mkdirSync(path.resolve(dir), { recursive: true });
            fs.chmodSync(path.resolve(dir), CACHE_DIR_PERM);
        }
    } catch (err) {
        rootLogger.warn('LLM disk cache dir init failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

/** Retrieve a cached LLM response. Returns `null` on miss, expiry, or decryption failure. */
export function diskCacheGet(key: string): string | null {
    const file = filePath(key);
    try {
        const raw = fs.readFileSync(path.resolve(file), 'utf-8');
        const decrypted = decrypt(raw);
        if (decrypted === null) {
            rootLogger.warn('LLM disk cache decrypt failed for key=' + key.slice(0, 12) + '… — removing');
            try {
                fs.unlinkSync(path.resolve(file));
            } catch (err) {
                rootLogger.debug(
                    'LLM disk cache: failed to remove corrupted entry: ' +
                        (err instanceof Error ? err.message : String(err)),
                );
                /* best effort */
            }
            return null;
        }
        const parsedEntry: unknown = JSON.parse(decrypted);
        const entry = DiskCacheEntrySchema.parse(parsedEntry);
        if (Date.now() - entry.createdAt < DISK_CACHE_TTL_MS) {
            rootLogger.info('LLM disk cache hit for key=' + key.slice(0, 12) + '…');
            return entry.response;
        }
        fs.unlinkSync(path.resolve(file));
        rootLogger.info('LLM disk cache expired for key=' + key.slice(0, 12) + '…');
    } catch (err) {
        rootLogger.debug('LLM disk cache: miss or corrupt: ' + (err instanceof Error ? err.message : String(err)));
    }
    return null;
}

/** Store an LLM response in the disk cache (encrypted if `LLM_CACHE_KEY` is set). */
export function diskCacheSet(key: string, response: string): void {
    const dir = cacheDir();
    try {
        ensureCacheDir(dir);
        const entry: DiskCacheEntry = { response, createdAt: Date.now() };
        const serialized = JSON.stringify(entry);
        const encrypted = encrypt(serialized);
        const file = filePath(key);
        fs.writeFileSync(path.resolve(file), encrypted, 'utf-8');
        fs.chmodSync(path.resolve(file), CACHE_FILE_PERM);
    } catch (err) {
        rootLogger.warn('LLM disk cache write failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

/** Delete all cached `.json` files in the cache directory. */
export function clearDiskCache(): void {
    const dir = cacheDir();
    try {
        if (fs.existsSync(path.resolve(dir))) {
            const files = fs.readdirSync(path.resolve(dir));
            for (const f of files) {
                if (f.endsWith('.json')) fs.unlinkSync(sanitizePath(dir, f));
            }
        }
    } catch (err) {
        rootLogger.warn('LLM disk cache clear failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}
