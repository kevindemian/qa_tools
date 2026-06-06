/** Jira sprint management: add tasks to active sprint. */
import { success, info, warn, extractErrorMessage } from '../shared/prompt.js';
import type { JiraResourceLike } from './jira-resource-types.js';
import {
    addingTasksToSprint,
    TASKS_ADDED_TO_SPRINT,
    errorAddingToSprint,
    skippingTask,
    taskIncompleteData,
    taskCurrentStatus,
    noTransitions,
    statusNotMapped,
    transitionNotFound,
    errorMovingTask,
    errorMovingTaskShort,
} from './constants.js';

interface TransitionData {
    id: string;
    to?: { name: string };
}

export async function addTasksToSprint(resource: JiraResourceLike, taskIds: string[], sprintId: string): Promise<void> {
    const payload = { issues: taskIds };

    try {
        info(addingTasksToSprint(taskIds.length, sprintId));
        await resource.postJiraResource(`sprint/${sprintId}/issue`, payload);
        success(TASKS_ADDED_TO_SPRINT);
    } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } };
        resource.log.error(errorAddingToSprint(extractErrorMessage(err)), {
            sprintId,
            taskCount: taskIds.length,
            status: axiosErr.response?.status,
        });
        throw err;
    }
}

export async function getTransitionsForIssue(
    resource: JiraResourceLike,
    issueKey: string,
): Promise<Record<string, string>> {
    try {
        const data = await resource.getJiraResource<{ transitions?: TransitionData[] }>(
            `issue/${issueKey}/transitions`,
        );
        if (!data || !data.transitions) return {};
        const map: Record<string, string> = {};
        for (const t of data.transitions) {
            if (t.to && t.to.name) {
                map[t.to.name.toLowerCase()] = t.id;
            }
        }
        return map;
    } catch (err: unknown) {
        resource.log.error(`Erro GET issue/${issueKey}/transitions: ${extractErrorMessage(err)}`);
        return {};
    }
}

export async function transitionIssue(
    resource: JiraResourceLike,
    issueId: string,
    transitionId: string,
): Promise<void> {
    const payload = { transition: { id: transitionId } };
    resource.log.info(`   Movendo ${issueId} (transição ${transitionId})...`);

    try {
        await resource.postJiraResource(`issue/${issueId}/transitions`, payload);
    } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } };
        resource.log.error(errorMovingTaskShort(extractErrorMessage(err)), {
            issueId,
            transitionId,
            status: axiosErr.response?.status,
        });
        throw err;
    }
}

export const WORKFLOW_MAP: Record<string, string[]> = {
    new: ['approve', 'use test case'],
    'coding in progress': ['coding done', 'done'],
    'coding done': ['done'],
    approve: ['use test case'],
};

export async function moveCardsToDone(resource: JiraResourceLike, taskIds: string[]): Promise<void> {
    for (const taskId of taskIds) {
        let issueData: { fields?: { status?: { name: string } } };
        try {
            issueData = await resource.getJiraResource(`issue/${taskId}`);
        } catch (err: unknown) {
            resource.log.warn(skippingTask(taskId) + ' — ' + (err as Error).message);
            continue;
        }
        if (!issueData.fields || !issueData.fields.status) {
            resource.log.warn(taskIncompleteData(taskId));
            continue;
        }

        const currentStatus = issueData.fields.status.name;
        resource.log.info(taskCurrentStatus(taskId, currentStatus));

        const transitionsMap = await resource.getTransitionsForIssue(taskId);
        if (Object.keys(transitionsMap).length === 0) {
            resource.log.warn(noTransitions(taskId));
            continue;
        }

        const statusLower = currentStatus.toLowerCase();
        try {
            const targets = WORKFLOW_MAP[statusLower];
            if (!targets) {
                warn(statusNotMapped(taskId, currentStatus));
            } else {
                for (const target of targets) {
                    const transitionId = transitionsMap[target];
                    if (!transitionId) {
                        warn(transitionNotFound(target, taskId));
                        continue;
                    }
                    resource.log.info(`   ${taskId}: -> ${target}`);
                    await resource.transitionIssue(taskId, transitionId);
                }
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } };
            resource.log.error(errorMovingTask(taskId, extractErrorMessage(err)), {
                status: axiosErr.response?.status,
            });
        }
    }
}
