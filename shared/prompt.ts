/** Prompt/UI barrel — re-exports all user-facing functions from prompt-ui, prompt-input, and spinner.
 * @module Use `import { success, ask, withSpinner } from './prompt.js'` for convenience. */
export {
    __setConfig,
    isQuiet,
    badge,
    success,
    error,
    warn,
    info,
    helpLine,
    print,
    title,
    divider,
    humanizeError,
    extractErrorMessage,
    printError,
    printSummary,
    onError,
    tableView,
    CancelError,
} from './prompt-ui.js';

export { ProgressBar, withSpinner, __setOraDep } from './spinner.js';

export {
    prompt,
    confirm,
    smartPrompt,
    ask,
    askFilePath,
    askConfirm,
    showSelect,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
} from './prompt-input.js';
