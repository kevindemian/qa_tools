/** Command context — dependency injection for all handlers (DIP pattern). */
import type JiraResource from '../jira_resource';
import type JiraLinkManager from '../jira_link_manager';
import type CsvResource from '../csv_resource';
import type PackageVersionManager from '../package_version_manager';
import type { CommandContext as SharedCommandContext } from '../../shared/types/command-context';

export interface CommandContext extends SharedCommandContext {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    packageManager?: PackageVersionManager;
}
