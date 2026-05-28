/** Generate test stories from a user-story description via LLM. */
import fs from 'fs';
import path from 'path';
import { ask, warn, info, printError, title, divider } from '../../shared/prompt';
import { llmPrompt } from '../../shared/llm-client';
import { sanitizeForLlm, sanitizeTerminal } from '../../shared/sanitize';
import type { CommandContext } from './context';
import { TestCaseArraySchema } from './case18.schema';

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

    title('Gerando testes com IA...');
    let result: string;
    try {
        const testCases = await llmPrompt('fast', system, safeUserMsg, 'case18', undefined, TestCaseArraySchema);
        result = JSON.stringify(testCases, null, 2);
    } catch (err: unknown) {
        printError('Falha ao gerar casos de teste com IA', err);
        return;
    }

    divider();
    info('Testes gerados:');
    divider();
    info(sanitizeTerminal(result));
    divider();

    c.pushHistory('ai-generate-tests', `user story: ${userStory.slice(0, 60)}`, 'ok');
}

export default { handler };
