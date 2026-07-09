import type { SessionContext } from '../session-context.js';
import type { Logger } from '../logger.js';
import type { DataHub } from './data-hub.js';

export interface CommandContext {
    jiraResource: unknown;
    jiraResourceXray: unknown;
    linkManager: unknown;
    linkManagerXray: unknown;
    csvResource: unknown;
    packageManager?: unknown;
    ctx: SessionContext;
    pushHistory: (op: string, detail: string, status: string) => void;
    printSessionSummary: () => void;
    base_url: string;
    sessionLog: Logger;
    dataHub?: DataHub;
}
