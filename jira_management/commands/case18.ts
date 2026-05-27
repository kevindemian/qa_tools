import fs from 'fs';
import path from 'path';
import { ask, warn, info, printError, title, divider } from '../../shared/prompt';
import { llmPrompt } from '../../shared/llm-client';
import { sanitizeForLlm } from '../../shared/sanitize';
import { rootLogger } from '../../shared/logger';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const userStory = await ask('História do usuário (user story)', {
        hint: 'descreva brevemente a funcionalidade',
    });
    if (!userStory.trim()) {
        warn('História vazia. Operação cancelada.');
        return;
    }

    const acceptanceCriteria = await ask('Critérios de aceitação', {
        hint: 'liste os cenários esperados',
    });

    const templatePath = path.join(__dirname, '../../shared/prompts/user-story-to-tests.md');
    let system: string;
    try {
        system = fs.readFileSync(templatePath, 'utf8');
    } catch (err: unknown) {
        printError('Erro ao ler template de prompt', err);
        return;
    }

    const userMsg = 'User Story:\n' + userStory + '\n\nAcceptance Criteria:\n' + acceptanceCriteria;
    const safeUserMsg = sanitizeForLlm(userMsg);

    function validateTestCases(raw: string): boolean {
        try {
            const cases = JSON.parse(raw);
            if (!Array.isArray(cases) || cases.length === 0) return false;
            for (const tc of cases) {
                if (typeof tc.title !== 'string' || tc.title.length < 5) return false;
                if (!Array.isArray(tc.steps) || tc.steps.length === 0) return false;
                if (typeof tc.expectedResult !== 'string' || tc.expectedResult.length < 10) return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    title('Gerando testes com IA...');
    let result: string;
    try {
        result = await llmPrompt('fast', system, safeUserMsg, 'case18');
        if (!validateTestCases(result)) {
            rootLogger.warn('case18: LLM returned invalid test content, retrying');
            result = await llmPrompt(
                'fast',
                system +
                    '\n\nIMPORTANTE: Retorne APENAS um array JSON válido. Cada objeto deve ter title (>5 chars), steps (array não vazio) e expectedResult (>10 chars).',
                safeUserMsg,
                'case18-retry',
            );
        }
    } catch (err: unknown) {
        printError('Erro na chamada LLM', err);
        return;
    }

    divider();
    info('Testes gerados:');
    divider();
    info(result);
    divider();

    c.pushHistory('ai-generate-tests', `user story: ${userStory.slice(0, 60)}`, 'ok');
}

export default { handler };
