/** Barrel — re-exports all prompt-input functions and types from sub-modules.
 * @module Import from this file to maintain backward compatibility. */
export { NAV_CMDS, isTTY, prompt, confirm } from './prompt-input-base.js';
export { filePathCompleter, askFilePath } from './prompt-input-filepath.js';
export {
    smartPrompt,
    ask,
    askConfirm,
    showSelect,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
} from './prompt-input-inquirer.js';
