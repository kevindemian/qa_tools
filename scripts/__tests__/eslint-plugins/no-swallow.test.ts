import { RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('../../eslint-plugins/no-swallow.cjs') as { rules: { 'no-swallow': Rule.RuleModule } };
const rule = plugin.rules['no-swallow'];

const ruleTester = new RuleTester({
    languageOptions: {
        parser,
        parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
        },
    },
});

ruleTester.run('no-swallow', rule, {
    valid: [
        {
            name: 'relanca o erro',
            code: `try { doThing(); } catch (err) { throw err; }`,
        },
        {
            name: 'envolve em ExternalError e relanca',
            code: `try { doThing(); } catch (err) { throw new ExternalError(String(err)); }`,
        },
        {
            name: 'loga erro e retorna sentinela 404 explicita',
            code: `try { doThing(); } catch (err) { rootLogger.warn(String(err)); if (status === 404) return null; throw err; }`,
        },
        {
            name: 'loga com rootLogger.error e retorna sentinela documentada',
            code: `try { doThing(); } catch (err) { rootLogger.error('falhou', err); return null; }`,
        },
        {
            name: 'catch vazio e permitido por no-empty? (a regra so reporta swallow com retorno default)',
            code: `try { doThing(); } catch (err) { rootLogger.error(String(err)); }`,
        },
    ],
    invalid: [
        {
            name: 'retorna {} silenciosamente',
            code: `try { doThing(); } catch (err) { return {}; }`,
            errors: [{ messageId: 'swallow' }],
        },
        {
            name: 'retorna [] silenciosamente',
            code: `try { doThing(); } catch (err) { return []; }`,
            errors: [{ messageId: 'swallow' }],
        },
        {
            name: 'retorna null silenciosamente sem log',
            code: `try { doThing(); } catch (err) { return null; }`,
            errors: [{ messageId: 'swallow' }],
        },
        {
            name: 'catch vazio',
            code: `try { doThing(); } catch (err) {}`,
            errors: [{ messageId: 'swallow' }],
        },
    ],
});
