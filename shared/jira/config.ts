import Config from '../config-accessor.js';

/** True when Jira base URL and personal token are configured with real values
 *  (non-empty, non-placeholder). Used to skip non-critical startup calls and to
 *  decide whether the splash may render Jira API/Token checks. Shared by
 *  jira_management, git_triggers and the entry menu (consistência sistêmica). */
export function isJiraConfigured(): boolean {
    const url = Config.get('jiraBaseUrl');
    const token = Config.get('jiraPersonalToken');
    if (!url || !token) return false;
    if (url.includes('seu-jira-server') || token === 'seu-token-aqui') return false;
    return true;
}
