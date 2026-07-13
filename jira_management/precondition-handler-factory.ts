/** Factory + Cloud variant for PreconditionHandler.
 *
 *  On Jira Cloud (Xray for Jira), preconditions are associated via native issue
 *  links (type "Pre-Condition"), NOT the Jira Server custom field
 *  `com.xpandit.plugins.xray:test-precondition-custom-field` (which does not exist
 *  on Cloud). The base `PreconditionHandler` (in the locked `precondition-importer.ts`)
 *  implements the Server model; this module provides the Cloud override without
 *  modifying that file. */
import Config from '../shared/config.js';
import { info } from '../shared/prompt.js';
import { PreconditionHandler } from './precondition-handler.js';
import type JiraLinkManager from './jira_link_manager.js';
import type { JiraResourceLike, JsonObject } from '../shared/types.js';

export class CloudPreconditionHandler extends PreconditionHandler {
    private readonly _linkManager: JiraLinkManager | undefined;

    constructor(jiraResource: JiraResourceLike, linkManager?: JiraLinkManager) {
        super(jiraResource);
        this._linkManager = linkManager;
    }

    /** Cloud has no Server custom field. Association is done via native issue link. */
    override _getPreconditionFieldId(): Promise<string> {
        return Promise.reject(
            new Error(
                'Cloud mode: Xray Cloud does not use the Jira Server precondition custom field. ' +
                    'Preconditions are associated via native issue links.',
            ),
        );
    }

    /** Associate a precondition to a test via the "Pre-Condition" issue link. */
    override async associatePrecondition(testKey: string, preconditionKey: string): Promise<JsonObject | null> {
        if (!this._linkManager) {
            throw new Error('Cloud precondition association requires a JiraLinkManager; none was provided.');
        }
        info(`Associando pre-condition ${preconditionKey} ao teste ${testKey} via issue link (Cloud)...`);
        await this._linkManager.createIssueLink(testKey, preconditionKey, 'Pre-Condition');
        return null;
    }
}

function _isCloud(): boolean {
    try {
        return Config.getDefault().get('jiraMode') === 'cloud';
    } catch {
        return false;
    }
}

/** Returns a Cloud-aware or Server PreconditionHandler depending on `jiraMode`. */
export function createPreconditionHandler(
    jiraResource: JiraResourceLike,
    linkManager?: JiraLinkManager,
): PreconditionHandler {
    if (_isCloud()) {
        return new CloudPreconditionHandler(jiraResource, linkManager);
    }
    return new PreconditionHandler(jiraResource);
}
