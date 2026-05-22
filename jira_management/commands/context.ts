import type JiraResource from '../jira_resource';
import type JiraLinkManager from '../jira_link_manager';
import type CsvResource from '../csv_resource';
import type PackageVersionManager from '../package_version_manager';
import type { SessionContext } from '../../shared/session-context';
import type { Logger } from '../../shared/logger';

export interface CommandContext {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    packageManager?: PackageVersionManager;
    ctx: SessionContext;
    pushHistory: (op: string, detail: string, status: string) => void;
    printSessionSummary: () => void;
    base_url: string;
    sessionLog: Logger;
}
