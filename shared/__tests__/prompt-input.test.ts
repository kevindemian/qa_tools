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
} from '../prompt-input.js';

describe('Prompt-input barrel', () => {
    it('re-exports prompt', () => {
        expect(typeof prompt).toBe('function');
    });

    it('re-exports confirm', () => {
        expect(typeof confirm).toBe('function');
    });

    it('re-exports isTTY', () => {
        expect(typeof isTTY).toBe('function');
    });

    it('re-exports NAV_CMDS', () => {
        expect(Array.isArray(NAV_CMDS)).toBeTruthy();
    });

    it('re-exports filePathCompleter', () => {
        expect(typeof filePathCompleter).toBe('function');
    });

    it('re-exports askFilePath', () => {
        expect(typeof askFilePath).toBe('function');
    });

    it('re-exports smartPrompt', () => {
        expect(typeof smartPrompt).toBe('function');
    });

    it('re-exports ask', () => {
        expect(typeof ask).toBe('function');
    });

    it('re-exports askConfirm', () => {
        expect(typeof askConfirm).toBe('function');
    });

    it('re-exports showSelect', () => {
        expect(typeof showSelect).toBe('function');
    });

    it('re-exports __setSelectMod', () => {
        expect(typeof __setSelectMod).toBe('function');
    });

    it('re-exports __setInputMod', () => {
        expect(typeof __setInputMod).toBe('function');
    });

    it('re-exports __setConfirmMod', () => {
        expect(typeof __setConfirmMod).toBe('function');
    });
});
