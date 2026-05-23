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
};

function getHandler(caseNumber: string): HandlerFn | null {
    const mod = handlers[caseNumber];
    return mod ? mod.handler : null;
}

module.exports = { getHandler };
