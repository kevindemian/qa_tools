import * as deps from './deps';

describe('deps — Dependency Wall', () => {
    it('re-exports chalk', () => {
        expect(typeof deps.chalk).toBe('function');
        expect(typeof deps.chalk.red).toBe('function');
    });

    it('re-exports axios', () => {
        expect(typeof deps.axios).toBe('function');
    });

    it('re-exports AdmZip', () => {
        expect(typeof deps.AdmZip).toBe('function');
    });

    it('re-exports cliProgress', () => {
        expect(deps.cliProgress).toBeDefined();
    });

    it('re-exports CliTable3', () => {
        expect(typeof deps.CliTable3).toBe('function');
    });

    it('re-exports csv', () => {
        expect(typeof deps.csv).toBe('function');
    });

    it('re-exports dotenv', () => {
        expect(typeof deps.dotenv.config).toBe('function');
    });

    it('re-exports figlet', () => {
        expect(typeof deps.figlet).toBe('function');
    });

    it('re-exports getGlob', () => {
        expect(typeof deps.getGlob).toBe('function');
    });

    it('re-exports globSync', () => {
        expect(typeof deps.globSync).toBe('function');
    });

    it('re-exports readlineSync', () => {
        expect(typeof deps.readlineSync).toBe('object');
        expect(typeof deps.readlineSync.question).toBe('function');
    });

    it('re-exports yaml', () => {
        expect(typeof deps.yaml).toBe('object');
        expect(typeof deps.yaml.parse).toBe('function');
    });

    it('re-exports Document from yaml', () => {
        expect(typeof deps.Document).toBe('function');
    });

    it('re-exports isMap from yaml', () => {
        expect(typeof deps.isMap).toBe('function');
    });

    it('re-exports zod', () => {
        expect(typeof deps.zod).toBe('object');
    });

    it('re-exports z from zod', () => {
        expect(typeof deps.z).toBe('object');
        expect(typeof deps.z.string).toBe('function');
    });
});
