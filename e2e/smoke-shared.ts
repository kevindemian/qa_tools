import Config from '../shared/config';
import GitHubManager from '../git_triggers/github_manager';

const E2E_REPO = 'kevindemian/qa_tools';

export function createGitHubSmokeManager(): GitHubManager {
    const token = Config.githubToken;
    if (!token) {
        console.error('GITHUB_TOKEN not set. Configure it in .env');
        process.exit(1);
    }
    return new GitHubManager(E2E_REPO, token);
}

export function assertOk(condition: boolean, label: string): void {
    if (!condition) {
        console.error('FAIL: ' + label);
        process.exitCode = 1;
    } else {
        console.log('  OK: ' + label);
    }
}
