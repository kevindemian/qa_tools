import type { ListedProject } from '../project-registry.js';

/** True when a project entry is protected against edit/removal (migrated from legacy, D-U4). */
export function isProjectProtected(entry: ListedProject): boolean {
    return entry.migrated === true;
}

export type ProjectChoice =
    | { kind: 'add' }
    | { kind: 'manage' }
    | { kind: 'none' }
    | { kind: 'invalid'; choice: string }
    | { kind: 'select'; project: ListedProject };

/** Pure resolution of the project-selection menu choice (D-U2 / 050).
 * Maps the user's choice to a discriminated action without performing I/O. */
export function resolveProjectChoice(choice: string | undefined, projects: ListedProject[]): ProjectChoice {
    if (choice === '__add__') return { kind: 'add' };
    if (choice === '__manage__') return { kind: 'manage' };
    if (!choice) return { kind: 'none' };
    const p = projects.find((x) => x.name === choice);
    if (!p) return { kind: 'invalid', choice };
    return { kind: 'select', project: p };
}

export type ManageChoice =
    | { kind: 'back' }
    | { kind: 'unknown' }
    | { kind: 'protected'; project: ListedProject }
    | { kind: 'manage'; project: ListedProject };

/** Pure resolution of the "Gerenciar projetos" menu choice (052, D-U4). */
export function resolveManageChoice(choice: string | undefined, projects: ListedProject[]): ManageChoice {
    if (choice === '__back__') return { kind: 'back' };
    const p = projects.find((x) => x.name === choice);
    if (!p) return { kind: 'unknown' };
    if (isProjectProtected(p)) return { kind: 'protected', project: p };
    return { kind: 'manage', project: p };
}

export type ManageOneAction = 'edit' | 'remove' | 'back';

/** Pure resolution of the per-project management action (052). */
export function resolveManageOneAction(action: string | undefined): ManageOneAction | null {
    if (action === '__back__') return 'back';
    if (action === 'edit') return 'edit';
    if (action === 'remove') return 'remove';
    return null;
}

/** Resolve the module entry script for a spawned module (053). */
export function moduleScript(module: 'jira' | 'git'): string {
    return module === 'jira' ? 'jira_management/main.ts' : 'git_triggers/main.ts';
}
