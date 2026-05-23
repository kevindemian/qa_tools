import { box } from './box';
import { palette } from './palette';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- figlet is ESM-only
type DepCache = { figlet?: any; gradient?: any };

const _cache: DepCache = {};

async function ensureDeps(): Promise<void> {
    if (!_cache.figlet) _cache.figlet = await import('figlet');
    if (!_cache.gradient) _cache.gradient = await import('gradient-string');
}

export async function showSplash(statePath?: string): Promise<void> {
    try {
        await ensureDeps();
        const logo = _cache.figlet.textSync('QA TOOLS', { font: 'ANSI Shadow' }) as string;
        const grad = _cache.gradient.default as (colors: string[]) => { (text: string): string };
        const colored = grad(['#58a6ff', '#bc8cff'])(logo);
        const logoLines = colored.split('\n');

        const splash: string[] = [''];
        for (const line of logoLines) {
            if (line.trim()) splash.push('  ' + palette.muted(line));
        }
        splash.push('');
        splash.push(palette.muted('          Gestão de Testes & Automação de CI/CD'));
        splash.push('');
        if (statePath) {
            splash.push(palette.muted('  State: ' + statePath));
            splash.push('');
        }
        splash.push(palette.blue('  /help  Ajuda · d  Documentação'));
        splash.push('');
        console.log(box(splash, { border: 'double', padding: 1 }));
    } catch {
        // non-TTY fallback
    }
}
