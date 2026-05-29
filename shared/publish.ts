/** Auto-publish report files to S3 or gh-pages.
 * Provides CLI-wrapper functions for uploading generated HTML reports. */
import { execSync } from 'child_process';
import { rootLogger } from './logger';

export type PublishTarget = 's3' | 'gh-pages';

export interface PublishOptions {
    target: PublishTarget;
    filePath: string;
    destination?: string;
}

/** Publish a file to S3 via the AWS CLI. */
function publishToS3(localPath: string, destination?: string): void {
    const dest = destination || process.env.AWS_S3_BUCKET;
    if (!dest) {
        rootLogger.error('S3 publish requires either --dest or AWS_S3_BUCKET env var');
        return;
    }
    const cmd = `aws s3 cp "${localPath}" "${dest}" --no-progress`;
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch {
        rootLogger.error('S3 publish failed');
    }
}

/** Publish a file to gh-pages via the gh CLI. */
function publishToGhPages(localPath: string, destination?: string): void {
    const dest = destination || './report.html';
    const tmpDir = '/tmp/qa-gh-pages-' + Date.now();
    try {
        execSync(
            `git clone --branch gh-pages --single-branch "${getOriginUrl()}" "${tmpDir}" 2>/dev/null || mkdir -p "${tmpDir}"`,
            { stdio: 'ignore' },
        );
        execSync(`cp "${localPath}" "${tmpDir}/${dest}"`, { stdio: 'inherit' });
        execSync(`cd "${tmpDir}" && git add "${dest}" && git commit -m "Auto-publish report" && git push`, {
            stdio: 'inherit',
        });
    } catch {
        rootLogger.error('gh-pages publish failed');
    }
}

function getOriginUrl(): string {
    try {
        return execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    } catch {
        return 'origin';
    }
}

/** Auto-publish a local file to the configured target (s3 or gh-pages). */
export function publishReport(options: PublishOptions): void {
    rootLogger.info('Publishing report to ' + options.target + ': ' + options.filePath);
    if (options.target === 's3') {
        publishToS3(options.filePath, options.destination);
    } else if (options.target === 'gh-pages') {
        publishToGhPages(options.filePath, options.destination);
    }
}
