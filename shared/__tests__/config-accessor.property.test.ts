/**
 * Property-Based Tests — Config Accessor (FT-01)
 *
 * Invariantes:
 * - Boolean coercion: env var "true"/"false" → boolean
 * - Number coercion: env var numeric string → number; NaN → default
 * - Override precedence: override > env > default
 * - getAllPrefixed: keys match prefix, no false positives
 */
import * as fc from 'fast-check';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import Config from '../config-accessor.js';

const _origEnv = process.env;

describe('Config Accessor.Property', () => {
    beforeEach(() => {
        process.env = { ..._origEnv };
        Config.reset();
    });

    afterEach(() => {
        process.env = { ..._origEnv };
        Config.reset();
    });

    afterAll(() => {
        process.env = _origEnv;
    });

    describe('Config.get boolean coercion — property-based', () => {
        it('aUTO_CONFIRM returns boolean for any env value', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.string({ minLength: 0, maxLength: 20 }), (val) => {
                    process.env['AUTO_CONFIRM'] = val;
                    const result = Config.get<boolean>('autoConfirm');

                    expect(typeof result).toBe('boolean');
                }),
                { numRuns: 100 },
            );
        });
    });

    describe('Config.get number coercion — property-based', () => {
        it('lOG_MAX_SIZE returns number for any env value', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.string({ minLength: 0, maxLength: 20 }), (val) => {
                    process.env['LOG_MAX_SIZE'] = val;
                    const result = Config.get<number>('logMaxSize');

                    expect(typeof result).toBe('number');
                }),
                { numRuns: 100 },
            );
        });
    });

    describe('Config.get override precedence — property-based', () => {
        it('override always beats env var', () => {expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 50 }),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (envVal, overrideVal) => {
                        process.env['JIRA_BASE_URL'] = envVal;
                        Config.set('jiraBaseUrl', overrideVal);

                        expect(Config.get('jiraBaseUrl')).toBe(overrideVal);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('config.create isolated instance does not affect default', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.boolean(), (customVal) => {
                    const before = Config.get<boolean>('autoConfirm');
                    const cfg = Config.create({ autoConfirm: customVal });

                    expect(cfg.get<boolean>('autoConfirm')).toBe(customVal);
                    expect(Config.get<boolean>('autoConfirm')).toBe(before);
                }),
                { numRuns: 50 },
            );
        });
    });

    describe('Config.getAllPrefixed — property-based', () => {
        beforeEach(() => {
            process.env['TEST_PREFIX_QA_KEY'] = 'qa-value';
            process.env['TEST_PREFIX_MODEL'] = 'gpt-4';
            process.env['OTHER_VAR'] = 'other';
        });

        it('returns only env vars matching prefix', () => {expect.hasAssertions();

            fc.assert(
                fc.property(fc.boolean(), fc.boolean(), () => {
                    const result = Config.getAllPrefixed('TEST_PREFIX_');

                    expect(result['TEST_PREFIX_QA_KEY']).toBe('qa-value');
                    expect(result['TEST_PREFIX_MODEL']).toBe('gpt-4');
                    expect(result['OTHER_VAR']).toBeUndefined();
                }),
                { numRuns: 20 },
            );
        });
    });

    describe('Config.validateRequiredEnv — property-based', () => {
        it('does not throw when all required env vars are present', () => {expect.hasAssertions();

            fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 50 }),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (baseUrl, token, xrayUrl) => {
                        process.env['JIRA_BASE_URL'] = baseUrl;
                        process.env['JIRA_PERSONAL_TOKEN'] = token;
                        process.env['XRAY_BASE_URL'] = xrayUrl;

                        expect(() => Config.validateRequiredEnv()).not.toThrow();
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

});
