const _breadcrumbs: string[] = [];

export function pushBreadcrumb(label: string): void {
    _breadcrumbs.push(label);
}

export function popBreadcrumb(): void {
    _breadcrumbs.pop();
}

export function clearBreadcrumbs(): void {
    _breadcrumbs.length = 0;
}

export function getBreadcrumbPath(): string {
    return _breadcrumbs.join(' > ');
}

export function __resetBreadcrumbs(): void {
    _breadcrumbs.length = 0;
}
