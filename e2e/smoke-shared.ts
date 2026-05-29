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
