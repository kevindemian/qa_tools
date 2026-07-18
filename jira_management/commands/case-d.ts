import { showDashboardMenu, type DashboardDef } from '../../shared/ui/dashboard-menu.js';
import type { CommandContext } from './context.js';
import case25 from './case25.js';
import case26 from './case26.js';
import case27 from './case27.js';

async function handler(ctx: CommandContext): Promise<boolean | void> {
    const projectName = ctx.ctx.project_name;
    if (!projectName) return;

    const dashboards: DashboardDef[] = [
        {
            id: '25',
            label: 'Traceability Matrix',
            handler: async () => {
                await case25.handler(ctx);
            },
        },
        {
            id: '26',
            label: 'Release Score',
            handler: async () => {
                await case26.handler(ctx);
            },
        },
        {
            id: '27',
            label: 'Coverage Dashboard',
            handler: async () => {
                await case27.handler(ctx);
            },
        },
    ];

    await showDashboardMenu(projectName, dashboards);
}

export default { handler };
