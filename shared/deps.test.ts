import * as deps from './deps.js';

describe('deps — Dependency Wall', () => {
    it('re-exports chalk', async () => {
        expect(typeof deps.chalk).toBe('function');
        expect(typeof deps.chalk.red).toBe('function');
    });

    it('re-exports axios', async () => {
        expect(typeof deps.axios).toBe('function');
    });

    it('re-exports AdmZip', async () => {
        expect(typeof deps.AdmZip).toBe('function');
    });

    it('re-exports cliProgress', async () => {
        expect(deps.cliProgress).toBeDefined();
    });

    it('re-exports CliTable3', async () => {
        expect(typeof deps.CliTable3).toBe('function');
    });

    it('re-exports csv', async () => {
        expect(typeof deps.csv).toBe('function');
    });

    it('re-exports dotenv', async () => {
        expect(typeof deps.dotenv.config).toBe('function');
    });

    it('re-exports figlet', async () => {
        expect(typeof deps.figlet).toBe('function');
    });

    it('re-exports getGlob', async () => {
        expect(typeof deps.getGlob).toBe('function');
    });

    it('re-exports globSync', async () => {
        expect(typeof deps.globSync).toBe('function');
    });

    it('re-exports readlineSync', async () => {
        expect(typeof deps.readlineSync).toBe('object');
        expect(typeof deps.readlineSync.question).toBe('function');
    });

    it('re-exports yaml', async () => {
        expect(typeof deps.yaml).toBe('object');
        expect(typeof deps.yaml.parse).toBe('function');
    });

    it('re-exports Document from yaml', async () => {
        expect(typeof deps.Document).toBe('function');
    });

    it('re-exports isMap from yaml', async () => {
        expect(typeof deps.isMap).toBe('function');
    });

    it('re-exports zod', async () => {
        expect(typeof deps.zod).toBe('object');
    });

    it('re-exports z from zod', async () => {
        expect(typeof deps.z).toBe('object');
        expect(typeof deps.z.string).toBe('function');
    });
});
