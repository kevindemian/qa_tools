jest.mock('child_process');
jest.mock('./logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn() },
}));

import { execSync } from 'child_process';
import { rootLogger } from './logger';
import { publishReport } from './publish';

const mockExecSync = execSync as jest.Mock;
const mockLoggerError = rootLogger.error as jest.Mock;

describe('publishReport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AWS_S3_BUCKET;
    });

    describe('target: s3', () => {
        it('publishes to S3 using AWS_S3_BUCKET env var', () => {
            process.env.AWS_S3_BUCKET = 's3://my-bucket';
            publishReport({ target: 's3', filePath: '/path/to/report.html' });
            expect(mockExecSync).toHaveBeenCalledWith(
                'aws s3 cp "/path/to/report.html" "s3://my-bucket" --no-progress',
                { stdio: 'inherit' },
            );
        });

        it('publishes to S3 with custom destination overriding env var', () => {
            process.env.AWS_S3_BUCKET = 's3://my-bucket';
            publishReport({
                target: 's3',
                filePath: '/path/to/report.html',
                destination: 's3://custom-bucket',
            });
            expect(mockExecSync).toHaveBeenCalledWith(
                'aws s3 cp "/path/to/report.html" "s3://custom-bucket" --no-progress',
                { stdio: 'inherit' },
            );
        });

        it('logs error when AWS_S3_BUCKET not set and no destination', () => {
            publishReport({ target: 's3', filePath: '/path/to/report.html' });
            expect(mockLoggerError).toHaveBeenCalledWith('S3 publish requires either --dest or AWS_S3_BUCKET env var');
            expect(mockExecSync).not.toHaveBeenCalled();
        });

        it('logs error when S3 publish fails (execSync throws)', () => {
            process.env.AWS_S3_BUCKET = 's3://my-bucket';
            mockExecSync.mockImplementationOnce(() => {
                throw new Error('aws fail');
            });
            publishReport({ target: 's3', filePath: '/path/to/report.html' });
            expect(mockLoggerError).toHaveBeenCalledWith('S3 publish failed');
        });
    });

    describe('invalid target', () => {
        it('does nothing for unknown target', () => {
            publishReport({ target: 'ftp' as never, filePath: '/path/to/report.html' });
            expect(mockExecSync).not.toHaveBeenCalled();
        });
    });

    describe('target: gh-pages', () => {
        it('publishes to gh-pages successfully', () => {
            mockExecSync
                .mockReturnValueOnce('https://github.com/user/repo.git')
                .mockReturnValueOnce('')
                .mockReturnValueOnce('')
                .mockReturnValueOnce('');

            publishReport({ target: 'gh-pages', filePath: '/path/to/report.html' });

            expect(mockExecSync).toHaveBeenCalledTimes(4);
            expect(mockExecSync).toHaveBeenNthCalledWith(1, 'git remote get-url origin', { encoding: 'utf8' });
            expect(mockExecSync).toHaveBeenNthCalledWith(2, expect.stringContaining('git clone --branch gh-pages'), {
                stdio: 'ignore',
            });
            expect(mockExecSync).toHaveBeenNthCalledWith(
                3,
                expect.stringMatching(/^cp "\/path\/to\/report\.html" "\/tmp\/qa-gh-pages-\d+\/\.\/report\.html"$/),
                { stdio: 'inherit' },
            );
            expect(mockExecSync).toHaveBeenNthCalledWith(
                4,
                expect.stringContaining('git add "./report.html" && git commit'),
                { stdio: 'inherit' },
            );
        });

        it('publishes to gh-pages with custom destination', () => {
            mockExecSync
                .mockReturnValueOnce('https://github.com/user/repo.git')
                .mockReturnValueOnce('')
                .mockReturnValueOnce('')
                .mockReturnValueOnce('');

            publishReport({
                target: 'gh-pages',
                filePath: '/path/to/report.html',
                destination: 'docs/index.html',
            });

            expect(mockExecSync).toHaveBeenNthCalledWith(
                3,
                expect.stringMatching(/^cp "\/path\/to\/report\.html" "\/tmp\/qa-gh-pages-\d+\/docs\/index\.html"$/),
                { stdio: 'inherit' },
            );
            expect(mockExecSync).toHaveBeenNthCalledWith(
                4,
                expect.stringContaining('git add "docs/index.html" && git commit'),
                { stdio: 'inherit' },
            );
        });

        it('logs error when gh-pages publish fails', () => {
            mockExecSync.mockReturnValueOnce('https://github.com/user/repo.git').mockImplementationOnce(() => {
                throw new Error('gh-pages fail');
            });
            publishReport({ target: 'gh-pages', filePath: '/path/to/report.html' });
            expect(mockLoggerError).toHaveBeenCalledWith('gh-pages publish failed');
        });

        it('falls back to "origin" url when getOriginUrl fails', () => {
            mockExecSync
                .mockImplementationOnce(() => {
                    throw new Error('no remote');
                })
                .mockReturnValueOnce('')
                .mockReturnValueOnce('')
                .mockReturnValueOnce('');

            publishReport({ target: 'gh-pages', filePath: '/path/to/report.html' });

            expect(mockExecSync).toHaveBeenCalledTimes(4);
            expect(mockExecSync).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('git clone --branch gh-pages --single-branch "origin"'),
                { stdio: 'ignore' },
            );
        });
    });
});
