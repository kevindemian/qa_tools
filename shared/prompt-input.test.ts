/** Barrel re-export verification — imports from sub-modules are re-exported correctly. */
import {
    prompt,
    confirm,
    isTTY,
    NAV_CMDS,
    filePathCompleter,
    askFilePath,
    smartPrompt,
    ask,
    askConfirm,
    showSelect,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
} from './prompt-input.js';

describe('prompt-input barrel', () => {
    it('re-exports prompt', async () => {
        expect(typeof prompt).toBe('function');
    });

    it('re-exports confirm', async () => {
        expect(typeof confirm).toBe('function');
    });

    it('re-exports isTTY', async () => {
        expect(typeof isTTY).toBe('function');
    });

    it('re-exports NAV_CMDS', async () => {
        expect(Array.isArray(NAV_CMDS)).toBe(true);
    });

    it('re-exports filePathCompleter', async () => {
        expect(typeof filePathCompleter).toBe('function');
    });

    it('re-exports askFilePath', async () => {
        expect(typeof askFilePath).toBe('function');
    });

    it('re-exports smartPrompt', async () => {
        expect(typeof smartPrompt).toBe('function');
    });

    it('re-exports ask', async () => {
        expect(typeof ask).toBe('function');
    });

    it('re-exports askConfirm', async () => {
        expect(typeof askConfirm).toBe('function');
    });

    it('re-exports showSelect', async () => {
        expect(typeof showSelect).toBe('function');
    });

    it('re-exports __setSelectMod', async () => {
        expect(typeof __setSelectMod).toBe('function');
    });

    it('re-exports __setInputMod', async () => {
        expect(typeof __setInputMod).toBe('function');
    });

    it('re-exports __setConfirmMod', async () => {
        expect(typeof __setConfirmMod).toBe('function');
    });
});
