import fs from 'fs';
import path from 'path';
import { ask, warn, info, printError, title, divider } from '../../shared/prompt';
import { llmPrompt } from '../../shared/llm-client';
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

    title('Gerando testes com IA...');
    let result: string;
    try {
        result = await llmPrompt('main', system, userMsg);
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
