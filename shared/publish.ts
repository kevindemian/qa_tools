/** Auto-publish report files to S3 or gh-pages.
 * Provides CLI-wrapper functions for uploading generated HTML reports. */
import { execFileSync } from 'child_process';
import { rootLogger } from './logger.js';
import Config from './config.js';
import { cpSync, mkdirSync } from 'fs';
import { join } from 'path';

export type PublishTarget = 's3' | 'gh-pages';

export interface PublishOptions {
    target: PublishTarget;
    filePath: string;
    destination?: string;
}

/** Publish a file to S3 via the AWS CLI. */
function publishToS3(localPath: string, destination?: string): void {
    const dest = destination || Config.get('AWS_S3_BUCKET');
    if (!dest) {
        rootLogger.error('S3 publish requires either --dest or AWS_S3_BUCKET env var');
        return;
    }
    try {
        execFileSync('aws', ['s3', 'cp', localPath, dest, '--no-progress'], { stdio: 'inherit', timeout: 120_000 });
    } catch (err: unknown) {
        rootLogger.error('S3 publish failed: ' + (err as Error).message);
    }
}

/** Publish a file to gh-pages via the gh CLI. */
function publishToGhPages(localPath: string, destination?: string): void {
    const dest = destination || './report.html';
    const tmpDir = '/tmp/qa-gh-pages-' + Date.now();
    try {
        execFileSync('git', ['clone', '--branch', 'gh-pages', '--single-branch', getOriginUrl(), tmpDir], {
            stdio: 'ignore',
            timeout: 120_000,
        });
    } catch (err) {
        rootLogger.warn(
            'publish: git worktree add failed, using tmp dir: ' + (err instanceof Error ? err.message : String(err)),
        );
        mkdirSync(tmpDir, { recursive: true });
    }
    try {
        cpSync(localPath, join(tmpDir, dest));
        execFileSync('git', ['add', dest], { stdio: 'inherit', cwd: tmpDir, timeout: 120_000 });
        execFileSync('git', ['commit', '-m', 'Auto-publish report'], {
            stdio: 'inherit',
            cwd: tmpDir,
            timeout: 120_000,
        });
        execFileSync('git', ['push'], { stdio: 'inherit', cwd: tmpDir, timeout: 120_000 });
    } catch (err: unknown) {
        rootLogger.error('gh-pages publish failed: ' + (err as Error).message);
    }
}

function getOriginUrl(): string {
    try {
        return execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    } catch (err) {
        rootLogger.warn('publish: failed to get origin URL: ' + (err instanceof Error ? err.message : String(err)));
        return 'origin';
    }
}

function isValidTarget(t: string): boolean {
    return t === 's3' || t === 'gh-pages';
}

/** Auto-publish a local file to the configured target (s3 or gh-pages). */
export function publishReport(options: PublishOptions): void {
    if (!isValidTarget(options.target)) {
        rootLogger.error('Unknown publish target: ' + options.target + ' (expected s3 or gh-pages)');
        return;
    }
    rootLogger.info('Publishing report to ' + options.target + ': ' + options.filePath);
    if (options.target === 's3') {
        publishToS3(options.filePath, options.destination);
    } else {
        publishToGhPages(options.filePath, options.destination);
    }
}
