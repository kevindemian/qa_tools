import Config from '../shared/config-accessor.js';
import GitHubManager from '../git_triggers/github_manager.js';

const E2E_REPO = 'kevindemian/qa_tools';

export function createGitHubSmokeManager(): GitHubManager {
    const token = Config.get('githubToken');
    if (!token) {
        throw new Error('GITHUB_TOKEN not set. Configure it in .env');
    }
    return new GitHubManager(E2E_REPO, token);
}
