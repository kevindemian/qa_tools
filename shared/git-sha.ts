import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export function detectGitDir(startDir?: string): string | null {
    let dir = startDir ? path.resolve(startDir) : process.cwd();
    while (true) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

export function getHeadSha(env?: NodeJS.ProcessEnv): string | null {
    const e = env ?? process.env;

    const ciSha = e.GITHUB_SHA || e.CI_COMMIT_SHA || e.BUILD_SOURCEVERSION || null;
    if (ciSha) return ciSha;

    const gitDir = detectGitDir();
    if (gitDir) {
        const headFile = path.join(gitDir, '.git', 'HEAD');
        try {
            const head = fs.readFileSync(headFile, 'utf8').trim();
            if (head.startsWith('ref: ')) {
                const ref = head.slice(5);
                const refPath = path.join(gitDir, '.git', ref);
                if (fs.existsSync(refPath)) {
                    return fs.readFileSync(refPath, 'utf8').trim();
                }
                const packedPath = path.join(gitDir, '.git', 'packed-refs');
                if (fs.existsSync(packedPath)) {
                    const packed = fs.readFileSync(packedPath, 'utf8');
                    for (const line of packed.split('\n')) {
                        if (line.endsWith(ref) && !line.startsWith('#')) {
                            const parts = line.split(' ');
                            return parts[0]?.trim() ?? null;
                        }
                    }
                }
            } else {
                return head;
            }
        } catch {
            /* fall through */
        }
    }

    try {
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return sha || null;
    } catch {
        return null;
    }
}

export function getCurrentBranch(env?: NodeJS.ProcessEnv): string | null {
    const e = env ?? process.env;

    const ciBranch = e.GITHUB_REF_NAME || e.CI_COMMIT_BRANCH || e.BUILD_SOURCEBRANCHNAME || null;
    if (ciBranch) return ciBranch;

    try {
        return (
            execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim() || null
        );
    } catch {
        return null;
    }
}
