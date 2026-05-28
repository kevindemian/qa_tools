import fs from 'fs';
import path from 'path';
import { rootLogger } from './logger';

const DISK_CACHE_TTL_MS = 60 * 60 * 1000;

interface DiskCacheEntry {
    response: string;
    createdAt: number;
}

function cacheDir(): string {
    return process.env.LLM_DISK_CACHE_DIR || path.join(process.cwd(), '.llm-cache');
}

function filePath(key: string): string {
    return path.join(cacheDir(), key + '.json');
}

export function diskCacheGet(key: string): string | null {
    const file = filePath(key);
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        const entry: DiskCacheEntry = JSON.parse(raw);
        if (Date.now() - entry.createdAt < DISK_CACHE_TTL_MS) {
            rootLogger.info('LLM disk cache hit for key=' + key.slice(0, 12) + '…');
            return entry.response;
        }
        fs.unlinkSync(file);
        rootLogger.info('LLM disk cache expired for key=' + key.slice(0, 12) + '…');
    } catch {
        // miss or corrupt
    }
    return null;
}

export function diskCacheSet(key: string, response: string): void {
    const dir = cacheDir();
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const entry: DiskCacheEntry = { response, createdAt: Date.now() };
        fs.writeFileSync(filePath(key), JSON.stringify(entry), 'utf-8');
    } catch (err) {
        rootLogger.warn('LLM disk cache write failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

export function clearDiskCache(): void {
    const dir = cacheDir();
    try {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
            }
        }
    } catch (err) {
        rootLogger.warn('LLM disk cache clear failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}
