import { publishReport, type PublishTarget } from './publish';

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

jest.mock('./logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn() },
}));

const mockExecSync = jest.requireMock('child_process').execSync as jest.Mock;
const mockLogger = jest.requireMock('./logger').rootLogger;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('publishReport', () => {
    it('should call aws s3 cp for s3 target', () => {
        process.env.AWS_S3_BUCKET = 's3://my-bucket';
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockExecSync).toHaveBeenCalledWith('aws s3 cp "./report.html" "s3://my-bucket" --no-progress', {
            stdio: 'inherit',
        });
    });

    it('should use explicit destination for s3 target', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://other' });
        expect(mockExecSync).toHaveBeenCalledWith('aws s3 cp "./report.html" "s3://other" --no-progress', {
            stdio: 'inherit',
        });
    });

    it('should log error when s3 dest is missing', () => {
        delete process.env.AWS_S3_BUCKET;
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockExecSync).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('S3 publish requires either --dest or AWS_S3_BUCKET env var');
    });

    it('should log error when s3 publish fails', () => {
        process.env.AWS_S3_BUCKET = 's3://bucket';
        mockExecSync.mockImplementationOnce(() => {
            throw new Error('aws failed');
        });
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockLogger.error).toHaveBeenCalledWith('S3 publish failed');
    });

    it('should call git commands for gh-pages target', () => {
        mockExecSync
            .mockReturnValueOnce('git@github.com:user/repo.git') // getOriginUrl
            .mockReturnValueOnce('') // git clone
            .mockReturnValueOnce(undefined) // cp
            .mockReturnValueOnce(undefined); // git add + commit + push
        publishReport({ target: 'gh-pages', filePath: './report.html' });
        expect(mockExecSync).toHaveBeenNthCalledWith(2, expect.stringContaining('git clone --branch gh-pages'), {
            stdio: 'ignore',
        });
    });

    it('should log error when gh-pages publish fails', () => {
        mockExecSync
            .mockReturnValueOnce('git@github.com:user/repo.git') // getOriginUrl
            .mockReturnValueOnce('') // clone
            .mockImplementationOnce(() => {
                throw new Error('cp failed');
            });
        publishReport({ target: 'gh-pages', filePath: './report.html' });
        expect(mockLogger.error).toHaveBeenCalledWith('gh-pages publish failed');
    });

    it('should log info about target and file path', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://b' });
        expect(mockLogger.info).toHaveBeenCalledWith('Publishing report to s3: ./report.html');
    });

    it('should handle missing origin url gracefully', () => {
        // getOriginUrl throws → caught internally → returns 'origin'
        mockExecSync
            .mockImplementationOnce(() => {
                throw new Error('no remote');
            }) // getOriginUrl
            .mockReturnValueOnce('') // clone
            .mockReturnValueOnce(undefined) // cp
            .mockReturnValueOnce(undefined); // git add + commit + push
        publishReport({ target: 'gh-pages', filePath: './report.html' });
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle unsupported target gracefully', () => {
        publishReport({ target: 'ftp' as PublishTarget, filePath: './x.html' });
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown publish target'));
        expect(mockExecSync).not.toHaveBeenCalled();
    });
});
