import type { CommandContext } from './context';
import { handler as handler01 } from './case01';
import { handler as handler02 } from './case02';
import { handler as handler03 } from './case03';
import { handler as handler04 } from './case04';
import { handler as handler05 } from './case05';
import { handler as handler06 } from './case06';
import { handler as handler07 } from './case07';
import { handler as handler08 } from './case08';
import { handler as handler09 } from './case09';
import { handler as handler10 } from './case10';
import { handler as handler11 } from './case11';
import { handler as handler12 } from './case12';
import { handler as handler13 } from './case13';
import { handler as handler14 } from './case14';
import { handler as handler15 } from './case15';
import { handler as handler16 } from './case16';

type HandlerFn = (ctx: CommandContext) => Promise<boolean | void> | boolean | void;

const handlers: Record<string, { handler: HandlerFn }> = {
    '1': { handler: handler01 },
    '2': { handler: handler02 },
    '3': { handler: handler03 },
    '4': { handler: handler04 },
    '5': { handler: handler05 },
    '6': { handler: handler06 },
    '7': { handler: handler07 },
    '8': { handler: handler08 },
    '9': { handler: handler09 },
    '10': { handler: handler10 },
    '11': { handler: handler11 },
    '12': { handler: handler12 },
    '13': { handler: handler13 },
    '14': { handler: handler14 },
    '15': { handler: handler15 },
    '16': { handler: handler16 },
};

function getHandler(caseNumber: string): HandlerFn | null {
    const mod = handlers[caseNumber];
    return mod ? mod.handler : null;
}

module.exports = { getHandler, handlers };
