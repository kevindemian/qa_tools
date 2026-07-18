import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { rootLogger } from '../logger.js';
import { sanitizePath } from '../path-utils.js';

const GIT_BIN = '/usr/bin/git';

export function detectGitDir(startDir?: string): string | null {
    let dir = startDir ? path.resolve(startDir) : process.cwd();
    for (;;) {
        if (fs.existsSync(sanitizePath(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function resolveRefFromPackedRefs(gitDir: string, ref: string): string | null {
    const packedPath = sanitizePath(sanitizePath(gitDir, '.git'), 'packed-refs');
    if (!fs.existsSync(path.resolve(packedPath))) return null;
    const packed = fs.readFileSync(path.resolve(packedPath), 'utf8');
    for (const line of packed.split('\n')) {
        if (line.endsWith(ref) && !line.startsWith('#')) {
            const parts = line.split(' ');
            return parts[0]?.trim() ?? null;
        }
    }
    return null;
}

function resolveHeadViaFilesystem(gitDir: string): string | null {
    const headFile = sanitizePath(sanitizePath(gitDir, '.git'), 'HEAD');
    try {
        const head = fs.readFileSync(path.resolve(headFile), 'utf8').trim();
        if (head.startsWith('ref: ')) {
            const ref = head.slice(5);
            const refPath = sanitizePath(sanitizePath(gitDir, '.git'), ref);
            if (fs.existsSync(path.resolve(refPath))) {
                return fs.readFileSync(path.resolve(refPath), 'utf8').trim();
            }
            return resolveRefFromPackedRefs(gitDir, ref);
        }
        return head;
    } catch (err) {
        rootLogger.warn('getHeadSha: filesystem HEAD resolution failed: ' + String(err));
        return null;
    }
}

export function getHeadSha(env?: NodeJS.ProcessEnv): string | null {
    const e = env ?? process.env;

    const ciSha = e['GITHUB_SHA'] || e['CI_COMMIT_SHA'] || e['BUILD_SOURCEVERSION'] || null;
    if (ciSha) return ciSha;

    const gitDir = detectGitDir();
    if (gitDir) {
        const sha = resolveHeadViaFilesystem(gitDir);
        /* .git found but ref could not be resolved via filesystem —
         * do NOT fall back to git CLI: it may resolve in parent repo
         * (e.g., CI detached HEAD scenario) or produce wrong SHA. */
        return sha;
    }

    try {
        const sha = execFileSync(GIT_BIN, ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return sha || null;
    } catch (err) {
        rootLogger.warn('getHeadSha: git CLI fallback failed: ' + String(err));
        return null;
    }
}

export function getCurrentBranch(env?: NodeJS.ProcessEnv): string | null {
    const e = env ?? process.env;

    const ciBranch = e['GITHUB_REF_NAME'] || e['CI_COMMIT_BRANCH'] || e['BUILD_SOURCEBRANCHNAME'] || null;
    if (ciBranch) return ciBranch;

    try {
        return (
            execFileSync(GIT_BIN, ['rev-parse', '--abbrev-ref', 'HEAD'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim() || null
        );
    } catch (err) {
        rootLogger.warn('getCurrentBranch: git branch resolution failed: ' + String(err));
        return null;
    }
}
