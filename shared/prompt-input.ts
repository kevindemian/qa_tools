/** Barrel — re-exports all prompt-input functions and types from sub-modules.
 * @module Import from this file to maintain backward compatibility. */
export type { PromptOptions } from './prompt-input-base';
export { NAV_CMDS, isTTY, prompt, confirm } from './prompt-input-base';
export type { FilePathOptions } from './prompt-input-filepath';
export { filePathCompleter, askFilePath } from './prompt-input-filepath';
export type { SelectChoice, SelectOptions, SectionGroup } from './prompt-input-inquirer';
export {
    smartPrompt,
    ask,
    askConfirm,
    showSelect,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
} from './prompt-input-inquirer';
