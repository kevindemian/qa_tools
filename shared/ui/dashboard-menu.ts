/**
 * Generic dashboard submenu — renders a selectable list of dashboards.
 * Used by both git_triggers (17 dashboards) and jira_management (3 dashboards).
 */
import { showSelect, warn } from './prompt.js';

export interface DashboardDef {
    id: string;
    label: string;
    handler: () => Promise<void>;
}

export async function showDashboardMenu(projectName: string, dashboards: DashboardDef[]): Promise<void> {
    if (!projectName) {
        warn('Nenhum projeto selecionado.');
        return;
    }
    const choice = await showSelect(
        '      Selecione um dashboard',
        [...dashboards.map((d) => ({ name: d.label, value: d.id })), { name: 'Voltar', value: '0' }],
        { menuMode: true },
    );
    if (choice === '0') return;
    const dashboard = dashboards.find((d) => d.id === choice);
    if (dashboard) {
        await dashboard.handler();
    }
}
