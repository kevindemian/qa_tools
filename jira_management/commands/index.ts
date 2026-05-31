/** Command registry — maps case IDs (01-23 + exit) to handler modules. */
import type { CommandContext } from './context';
import case01 from './case01';
import case02 from './case02';
import case03 from './case03';
import case04 from './case04';
import case05 from './case05';
import case06 from './case06';
import case07 from './case07';
import case08 from './case08';
import case09 from './case09';
import case10 from './case10';
import case11 from './case11';
import case12 from './case12';
import case13 from './case13';
import case14 from './case14';
import case15 from './case15';
import case16 from './case16';
import case17 from './case17';
import case18 from './case18';
import case19 from './case19';
import case20 from './case20';
import case21 from './case21';
import case22 from './case22';
import case23 from './case23';
import case24 from './case24';

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
};

function getHandler(caseNumber: string): HandlerFn | null {
    const mod = handlers[caseNumber];
    return mod ? mod.handler : null;
}

export { getHandler };
