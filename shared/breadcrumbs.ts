/** Navigation breadcrumbs for the interactive menu. Tracks the current screen path (e.g. "Jira > Import > CSV"). */
const _breadcrumbs: string[] = [];

/** Push a new breadcrumb (enter a screen). */
export function pushBreadcrumb(label: string): void {
    _breadcrumbs.push(label);
}

/** Pop the last breadcrumb (back/leave a screen). */
export function popBreadcrumb(): void {
    _breadcrumbs.pop();
}

/** Reset all breadcrumbs (e.g. on main menu). */
export function clearBreadcrumbs(): void {
    _breadcrumbs.length = 0;
}

/** Get the full breadcrumb path as a ` > `-separated string. */
export function getBreadcrumbPath(): string {
    return _breadcrumbs.join(' > ');
}

/** Reset all breadcrumbs (test helper). */
export function __resetBreadcrumbs(): void {
    _breadcrumbs.length = 0;
}
