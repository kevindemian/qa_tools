/** Command context — dependency injection for all handlers (DIP pattern). */
import type JiraResource from '../jira_resource.js';
import type JiraLinkManager from '../jira_link_manager.js';
import type CsvResource from '../csv_resource.js';
import type PackageVersionManager from '../package_version_manager.js';
import type { CommandContext as SharedCommandContext } from '../../shared/types/command-context.js';

export interface CommandContext extends SharedCommandContext {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    packageManager?: PackageVersionManager;
}
