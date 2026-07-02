/** Auto-publish report files to S3 or gh-pages.
 * Provides CLI-wrapper functions for uploading generated HTML reports. */
import { formatErr } from './errors.js';
import path from 'path';
import { execFileSync } from 'child_process';
import { rootLogger } from './logger.js';
import Config from './config.js';
import { cpSync, mkdirSync } from 'fs';
import os from 'os';
import { join } from 'path';

const GIT_BIN = '/usr/bin/git';
const AWS_BIN = '/usr/bin/aws';

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
        execFileSync(AWS_BIN, ['s3', 'cp', localPath, dest, '--no-progress'], { stdio: 'inherit', timeout: 120_000 });
    } catch (err: unknown) {
        rootLogger.error('S3 publish failed: ' + formatErr(err));
    }
}

/** Publish a file to gh-pages via the gh CLI. */
function publishToGhPages(localPath: string, destination?: string): void {
    const dest = destination || './report.html';
    const tmpDir = join(os.tmpdir(), 'qa-gh-pages-' + Date.now());
    try {
        execFileSync(GIT_BIN, ['clone', '--branch', 'gh-pages', '--single-branch', getOriginUrl(), tmpDir], {
            stdio: 'ignore',
            timeout: 120_000,
        });
    } catch (err) {
        rootLogger.warn('publish: git worktree add failed, using tmp dir: ' + String(err));
        mkdirSync(path.resolve(tmpDir), { recursive: true });
    }
    try {
        cpSync(localPath, join(tmpDir, dest));
        execFileSync(GIT_BIN, ['add', dest], { stdio: 'inherit', cwd: tmpDir, timeout: 120_000 });
        execFileSync(GIT_BIN, ['commit', '-m', 'Auto-publish report'], {
            stdio: 'inherit',
            cwd: tmpDir,
            timeout: 120_000,
        });
        execFileSync(GIT_BIN, ['push'], { stdio: 'inherit', cwd: tmpDir, timeout: 120_000 });
    } catch (err: unknown) {
        rootLogger.error('gh-pages publish failed: ' + formatErr(err));
    }
}

function getOriginUrl(): string {
    try {
        return execFileSync(GIT_BIN, ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    } catch (err) {
        rootLogger.warn('publish: failed to get origin URL: ' + String(err));
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
