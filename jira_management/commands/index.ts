/** Command registry — maps case IDs (01-29 + exit) to handler modules.
 * Handlers are loaded lazily (`() => import()`) so the heavy per-command
 * dependency graphs (xlsx, axios, csv) are NOT resolved at CLI startup. */

import type { CommandContext } from './context.js';

type HandlerFn = (ctx: CommandContext) => Promise<boolean | void> | boolean | void;
type HandlerLoader = () => Promise<{ handler: HandlerFn }>;

const loaders: Record<string, HandlerLoader> = {
    '1': () => import('./case01.js').then((m) => m.default),
    '2': () => import('./case02.js').then((m) => m.default),
    '3': () => import('./case03.js').then((m) => m.default),
    '4': () => import('./case04.js').then((m) => m.default),
    '5': () => import('./case05.js').then((m) => m.default),
    '6': () => import('./case06.js').then((m) => m.default),
    '7': () => import('./case07.js').then((m) => m.default),
    '8': () => import('./case08.js').then((m) => m.default),
    '9': () => import('./case09.js').then((m) => m.default),
    '10': () => import('./case10.js').then((m) => m.default),
    '11': () => import('./case11.js').then((m) => m.default),
    '12': () => import('./case12.js').then((m) => m.default),
    '13': () => import('./case13.js').then((m) => m.default),
    '14': () => import('./case14.js').then((m) => m.default),
    '15': () => import('./case15.js').then((m) => m.default),
    '16': () => import('./case16.js').then((m) => m.default),
    '17': () => import('./case17.js').then((m) => m.default),
    '18': () => import('./case18.js').then((m) => m.default),
    '19': () => import('./case19.js').then((m) => m.default),
    '20': () => import('./case20.js').then((m) => m.default),
    '21': () => import('./case21.js').then((m) => m.default),
    '22': () => import('./case22.js').then((m) => m.default),
    '23': () => import('./case23.js').then((m) => m.default),
    '24': () => import('./case24.js').then((m) => m.default),
    '25': () => import('./case25.js').then((m) => m.default),
    '26': () => import('./case26.js').then((m) => m.default),
    '27': () => import('./case27.js').then((m) => m.default),
    '28': () => import('./case28.js').then((m) => m.default),
    '29': () => import('./case29.js').then((m) => m.default),
    d: () => import('./case-d.js').then((m) => m.default),
};

function getHandler(caseNumber: string): HandlerFn | null {
    const loader: unknown = Reflect.get(loaders, caseNumber);
    if (typeof loader !== 'function') return null;
    return async (ctx: CommandContext): Promise<boolean | void> => {
        const mod = await (loader as HandlerLoader)();
        return mod.handler(ctx);
    };
}

export { getHandler };
