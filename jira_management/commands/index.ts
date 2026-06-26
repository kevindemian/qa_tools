/** Command registry — maps case IDs (01-23 + exit) to handler modules. */
import type { CommandContext } from './context.js';
import case01 from './case01.js';
import case02 from './case02.js';
import case03 from './case03.js';
import case04 from './case04.js';
import case05 from './case05.js';
import case06 from './case06.js';
import case07 from './case07.js';
import case08 from './case08.js';
import case09 from './case09.js';
import case10 from './case10.js';
import case11 from './case11.js';
import case12 from './case12.js';
import case13 from './case13.js';
import case14 from './case14.js';
import case15 from './case15.js';
import case16 from './case16.js';
import case17 from './case17.js';
import case18 from './case18.js';
import case19 from './case19.js';
import case20 from './case20.js';
import case21 from './case21.js';
import case22 from './case22.js';
import case23 from './case23.js';
import case24 from './case24.js';
import case25 from './case25.js';
import case26 from './case26.js';
import case27 from './case27.js';
import caseD from './case-d.js';

type HandlerFn = (ctx: CommandContext) => Promise<boolean | void> | boolean | void;

const handlers: Record<string, { handler: HandlerFn }> = {
    '1': { handler: case01.handler },
    '2': { handler: case02.handler },
    '3': { handler: case03.handler },
    '4': { handler: case04.handler },
    '5': { handler: case05.handler },
    '6': { handler: case06.handler },
    '7': { handler: case07.handler },
    '8': { handler: case08.handler },
    '9': { handler: case09.handler },
    '10': { handler: case10.handler },
    '11': { handler: case11.handler },
    '12': { handler: case12.handler },
    '13': { handler: case13.handler },
    '14': { handler: case14.handler },
    '15': { handler: case15.handler },
    '16': { handler: case16.handler },
    '17': { handler: case17.handler },
    '18': { handler: case18.handler },
    '19': { handler: case19.handler },
    '20': { handler: case20.handler },
    '21': { handler: case21.handler },
    '22': { handler: case22.handler },
    '23': { handler: case23.handler },
    '24': { handler: case24.handler },
    '25': { handler: case25.handler },
    '26': { handler: case26.handler },
    '27': { handler: case27.handler },
    d: { handler: caseD.handler },
};

function getHandler(caseNumber: string): HandlerFn | null {
    const mod: unknown = Reflect.get(handlers, caseNumber);
    if (mod !== undefined && mod !== null && typeof mod === 'object' && 'handler' in mod) {
        return (mod as { handler: HandlerFn }).handler;
    }
    return null;
}

export { getHandler };
