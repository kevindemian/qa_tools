import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { globSync } from 'glob';
import { showSelect, print, error, printError } from './prompt';
import { box } from './box';

interface Tool {
    name: string;
    mainPath: string;
    displayName: string;
}

const SCRIPT_DIR = dirname(__dirname);
const CACHE_FILE = join(tmpdir(), 'qa_tools_last_choice.txt');

function discoverTools(): Tool[] {
    const exclude = new Set(['node_modules', 'config', 'shared', '.git', '.github', 'e2e']);
    const files = globSync('*/main.ts', { cwd: SCRIPT_DIR });
    const tools: Tool[] = [];

    for (const file of files) {
        const dir = dirname(file);
        if (!exclude.has(dir)) {
            tools.push({
                name: dir,
                mainPath: join(SCRIPT_DIR, file),
                displayName: dir.replace(/_/g, ' '),
            });
        }
    }

    return tools.sort((a, b) => a.name.localeCompare(b.name));
}

function loadLastChoice(): number {
    try {
        const val = readFileSync(CACHE_FILE, 'utf8').trim();
        return parseInt(val, 10);
    } catch {
        return -1;
    }
}

function saveLastChoice(idx: number): void {
    try {
        writeFileSync(CACHE_FILE, String(idx), 'utf8');
    } catch {
        // ignore
    }
}

function runTool(tool: Tool, args: string[]): void {
    const result = spawnSync('npx', ['tsx', tool.mainPath, ...args], {
        stdio: 'inherit',
        cwd: SCRIPT_DIR,
    });
    if (result.status !== 0) {
        print('');
        print('  Erro ao executar. Pressione Enter para continuar.');
        spawnSync('bash', ['-c', 'read -r'], { stdio: 'inherit' });
    }
}

async function showMenu(tools: Tool[]): Promise<void> {
    let lastIdx = loadLastChoice();

    while (true) {
        console.clear();
        print(box([], { border: 'double', padding: 1, title: 'QA Tools', width: 78 }));

        const choices: Array<Record<string, unknown>> = tools.map((t, i) => ({
            name: '      ' + t.displayName,
            value: String(i + 1),
        }));
        choices.push({ type: 'separator' as const, line: '        ' }, { name: '      Voltar', value: 'exit' });

        const answer = await showSelect('      Selecione uma ferramenta', choices, {
            default: lastIdx >= 0 ? String(lastIdx + 1) : undefined,
            pageSize: (process.stdout.rows || 24) - 4,
        });

        if (answer === 'exit' || answer === '0') {
            print('  Até logo!');
            return;
        }

        const idx = parseInt(answer, 10) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < tools.length) {
            lastIdx = idx;
            saveLastChoice(idx);
            runTool(tools[idx], []);
        }
    }
}

async function main(): Promise<void> {
    const tools = discoverTools();

    if (tools.length === 0) {
        error('Nenhuma ferramenta encontrada.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    if (args.length > 0) {
        const firstArg = args[0];
        const idx = parseInt(firstArg, 10);
        if (!isNaN(idx) && idx >= 0 && idx < tools.length) {
            runTool(tools[idx], args.slice(1));
            return;
        }
        const matched = tools.find((t) => t.name === firstArg);
        if (matched) {
            runTool(matched, args.slice(1));
            return;
        }
        error('Ferramenta não encontrada: ' + firstArg);
        process.exit(1);
    }

    await showMenu(tools);
}

main().catch((err) => {
    printError('Erro inesperado', err);
    process.exit(1);
});

export { discoverTools };
