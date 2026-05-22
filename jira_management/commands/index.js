// @ts-check

const handlers = {
    '1': require('./case01'),
    '2': require('./case02'),
    '3': require('./case03'),
    '4': require('./case04'),
    '5': require('./case05'),
    '6': require('./case06'),
    '7': require('./case07'),
    '8': require('./case08'),
    '9': require('./case09'),
    '10': require('./case10'),
    '11': require('./case11'),
    '12': require('./case12'),
    '13': require('./case13'),
    '14': require('./case14'),
    '15': require('./case15'),
    '16': require('./case16'),
};

/**
 * @param {string} caseNumber
 * @returns {((ctx: import('./context').CommandContext) => Promise<boolean|void>|boolean|void) | null}
 */
function getHandler(caseNumber) {
    const mod = handlers[caseNumber];
    return mod ? mod.handler : null;
}

module.exports = { getHandler, handlers };
