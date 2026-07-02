/**
 * Safe filesystem operations — validate paths before I/O to satisfy
 * security/detect-non-literal-fs-filename ESLint rule.
 *
 * Every function validates the path with sanitizePath before delegating
 * to the real fs operation, ensuring no path-traversal attacks are possible.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sanitizePath } from './path-utils.js';

export function safeExistsSync(filePath: string): boolean {
    return fs.existsSync(sanitizePath(process.cwd(), filePath));
}

export function safeReadFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
    return fs.readFileSync(sanitizePath(process.cwd(), filePath), encoding);
}

export function safeReadFileSyncRaw(filePath: string): Buffer {
    return fs.readFileSync(sanitizePath(process.cwd(), filePath));
}

export function safeWriteFileSync(filePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
    const resolved = sanitizePath(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, data, encoding);
}

export function safeMkdirSync(dirPath: string, options?: fs.MakeDirectoryOptions): void {
    fs.mkdirSync(sanitizePath(process.cwd(), dirPath), options);
}

export function safeUnlinkSync(filePath: string): void {
    fs.unlinkSync(sanitizePath(process.cwd(), filePath));
}

export function safeRmSync(dirPath: string, options?: fs.RmOptions): void {
    fs.rmSync(sanitizePath(process.cwd(), dirPath), options);
}

export function safeReaddirSync(dirPath: string): fs.Dirent[] {
    return fs.readdirSync(sanitizePath(process.cwd(), dirPath), { withFileTypes: true });
}

export function safeStatSync(filePath: string): fs.Stats {
    return fs.statSync(sanitizePath(process.cwd(), filePath));
}

export function safeCopyFileSync(src: string, dest: string): void {
    fs.copyFileSync(sanitizePath(process.cwd(), src), sanitizePath(process.cwd(), dest));
}

export function safeRenameSync(oldPath: string, newPath: string): void {
    fs.renameSync(sanitizePath(process.cwd(), oldPath), sanitizePath(process.cwd(), newPath));
}

export function safeAppendFileSync(filePath: string, data: string): void {
    fs.appendFileSync(sanitizePath(process.cwd(), filePath), data);
}
