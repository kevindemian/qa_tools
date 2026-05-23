# QA Tools — TUI Style Guide

## Design Philosophy

Terminal as canvas. No browser, no CSS, no runtime dependencies beyond npm.
What we lose in visual freedom we gain in **speed, simplicity, and zero setup**.
User types one command and gets an immersive experience in milliseconds.

Every visual element must work over SSH, in CI logs, and on 16-color terminals
(graceful degradation). Rich features (gradients, 256-color, box drawing)
auto-detect terminal capability via `chalk.level`.

---

## Stack

| Lib | Version | Purpose | Replaces |
|-----|---------|---------|----------|
| `chalk` | ^5.x | Colors with clean API, auto-detect support | `\x1b[32m` raw |
| `cli-table3` | ^0.6 | Tables with borders, alignment, word-wrap, colors | `console.table()` |
| `ora` | ^8.x | Spinners (20+ frames, colors, text color) | `-/|\\` custom |
| `cli-progress` | ^3.x | Progress bars (percent, ETA, colors, custom format) | `[====>]` custom |
| `boxen` | ^8.x | Boxes with borders (single/double/round), padding, title | `--- divider ---` |
| `gradient-string` | ^2.x | Gradient banners for branding | `== text ==` |
| `figlet` | ^1.x | ASCII art logo | Nothing (new) |
| `ansi-escapes` | ^7.x | Cursor control, line clearing | raw `process.stdout.write` |

**Total added weight:** ~600KB, zero native deps.

---

## Layout Primitives

All screens follow this structure:

```
╔══════════════════════════════════════════════════════╗
║  Header — title + context line                        ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║  Content — sections, cards, tables, forms             ║
║                                                       ║
║  Footer — input prompt or actions                     ║
╚══════════════════════════════════════════════════════╝
```

- **Header**: `boxen` with `round` border, bold title, right-aligned context
- **Content**: raw sections separated by `boxen` cards
- **Footer**: input line with `chalk.cyan('→')` prefix, or action bar `[R]etry [A]bort`

---

## Design Tokens

### Colors (256-color palette)

Chalk 5.x uses hex strings. Palette inspired by GitHub Dark:

| Token | Hex | Chalk | Usage |
|-------|-----|-------|-------|
| `text-primary` | `#c9d1d9` | `chalk.hex('#c9d1d9')` | Body text |
| `text-secondary` | `#8b949e` | `chalk.hex('#8b949e')` | Labels, hints, metadata |
| `text-muted` | `#484f58` | `chalk.hex('#484f58')` | Dividers, borders |
| `accent` | `#58a6ff` | `chalk.hex('#58a6ff')` | Titles, links, selection |
| `accent-dim` | `#1f6feb` | `chalk.hex('#1f6feb')` | Secondary accent |
| `success` | `#3fb950` | `chalk.hex('#3fb950')` | OK, pass, created |
| `error` | `#f85149` | `chalk.hex('#f85149')` | ERR, fail, critical |
| `warning` | `#d29922` | `chalk.hex('#d29922')` | WARN, partial, attention |
| `info` | `#58a6ff` | `chalk.hex('#58a6ff')` | Info, progress |
| `surface` | `#0d1117` | `chalk.bgHex('#0d1117')` | Box background |
| `surface-alt` | `#161b22` | `chalk.bgHex('#161b22')` | Alt row / card bg |
| `border` | `#30363d` | `chalk.hex('#30363d')` | boxen border color |

### Gradient (for banner)

`gradient-string` with:

```
['#58a6ff', '#bc8cff']
```

Applied to the `figlet` logo on welcome screen. Only renders if `chalk.level >= 2`.

### Typography

Terminal font is out of our control. Use spacing and borders for hierarchy.

- **Titles**: bold + accent color, with `boxen` title option
- **Body**: default weight, primary color
- **Metadata**: dim/secondary color
- **Code/Data**: no special treatment (already monospace in terminal)

### Spacing

No CSS units. Convention-based:

| Context | Rule |
|---------|------|
| Box padding | `{ padding: { left: 2, right: 2 } }` (boxen) |
| Between sections | 1 blank line |
| Before/after divider | 1 blank line |
| Table cell padding | `{ paddingLeft: 1, paddingRight: 1 }` (cli-table3) |

---

## Components

### Logo / Banner

Generated once at startup, stored in variable. `figlet` font: `ANSI Shadow` or `Standard`.

```
╔══════════════════════════════════════════════════════╗
║                                                     ║
║     ██████  ▄▄        ▄▄ ▄▄▄▄▄▄▄▄                  ║
║    ██▀▀▀▀██ ██        ██ ▀▀▀██▀▀▀                  ║
║    ██      ██ ██        ██    ██                     ║
║    ████████ ██        ██    ██                     ║
║    ██▀▀▀▀██ ██        ██    ██                     ║
║    ██      ██ ██        ██    ██                     ║
║    ██      ██ ██████████    ██                     ║
║     ▀▀      ▀▀        ▀▀    ▀▀                     ║
║                                                     ║
║    QA Automation Tools · v1.0.0                     ║
╚══════════════════════════════════════════════════════╝
```

```
const logo = gradient(['#58a6ff','#bc8cff'])(figlet.textSync('QA TOOLS', { font: 'ANSI Shadow' }));
```

Fallback: simple colored text if `figlet` font unavailable or `chalk.level < 2`.

```
🔧 QA Tools  v1.0.0
```

### Cards

Used for grouping menu sections, displaying results, showing forms.

```js
import boxen from 'boxen';

function card(title, content, options = {}) {
  return boxen(content, {
    title,
    titleAlignment: 'left',
    borderStyle: 'round',
    borderColor: '#30363d',
    padding: { left: 2, right: 2 },
    ...options,
  });
}
```

```
┌─ TESTES ──────────────────────────────────────────┐
│  1  Criar testes a partir de CSV                  │
│ 15  Importar testes de JSON                       │
└────────────────────────────────────────────────────┘
```

| Context | `borderStyle` | `borderColor` |
|---------|---------------|---------------|
| Menu section | `'round'` | `'#30363d'` |
| Form / data | `'single'` | `'#30363d'` |
| Error dialog | `'double'` | `'#f85149'` |
| Success summary | `'round'` | `'#3fb950'` |

### Tables

```js
import Table from 'cli-table3';

function tableView(headers, rows, options = {}) {
  const table = new Table({
    head: headers.map(h => chalk.hex('#8b949e')(h)),
    style: {
      border: ['#484f58'],
      head: [],
      body: [],
    },
    chars: {
      top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤',
      middle: '│',
    },
    ...options,
  });
  rows.forEach(r => table.push(r));
  return table.toString();
}
```

Example output:

```
┌──────┬──────────────────────────┬────────┬──────────┐
│ Test │ Title                    │ Status │ Issue    │
├──────┼──────────────────────────┼────────┼──────────┤
│ TC01 │ Login válido             │ ✓ pass │ TEST-123 │
│ TC02 │ Login inválido           │ ✓ pass │ TEST-124 │
│ TC03 │ Logout                   │ ✗ fail │ TEST-125 │
└──────┴──────────────────────────┴────────┴──────────┘
```

Color each row's status cell:

- `✓ pass` → `chalk.hex('#3fb950')('✓ pass')`
- `✗ fail` → `chalk.hex('#f85149')('✗ fail')`
- `- skip` → `chalk.hex('#8b949e')('- skip')`

### Spinners

```js
import ora from 'ora';

const spinner = ora({
  text: 'Buscando schedules...',
  color: 'cyan',
  spinner: 'dots',
}).start();

// ... async operation ...

spinner.succeed('3 schedules found');
// or
spinner.fail('Connection error');
```

Spinner types by context:

| Context | `spinner` | Color |
|---------|-----------|-------|
| Network | `'dots'` | `'cyan'` |
| Processing | `'bouncingBar'` | `'yellow'` |
| Long operation | `'earth'` | `'green'` |

Fallback for non-TTY: `ora` automatically prints the text without animation.

### Progress Bars

```js
import cliProgress from 'cli-progress';

const bar = new cliProgress.SingleBar({
  format: `{bar} {percentage}% | {value}/{total} | {duration_formatted}`,
  barCompleteChar: '█',
  barIncompleteChar: '░',
  hideCursor: true,
}, cliProgress.Presets.shades_classic);
```

Renders as:

```
████████████░░░░░░░░░░  60% | 12/20 | 15s
```

Style:

| Token | Value |
|-------|-------|
| Complete char | `'█'` (full block) |
| Incomplete char | `'░'` (shade) |
| Bar color | inherited from terminal |
| Format | `{bar} {percentage}% | {value}/{total} | {duration_formatted}` |

### Status Badges

Inline, no box function needed:

```js
function badge(label, status) {
  const colors = {
    ok:    chalk.hex('#3fb950'),
    error: chalk.hex('#f85149'),
    warn:  chalk.hex('#d29922'),
    info:  chalk.hex('#58a6ff'),
  };
  const icons = {
    ok:    '●',
    error: '●',
    warn:  '●',
    info:  '○',
  };
  const c = colors[status] || chalk.hex('#8b949e');
  return `${c(icons[status])} ${c(label)}`;
}
```

```
● 5 passed    ● 1 failed    ○ 2 skipped
```

### Dividers / Rules

```js
import chalk from 'chalk';

const divider = () => console.log(chalk.hex('#484f58')('─'.repeat(process.stdout.columns || 50)));
```

---

## Screens

### Welcome / Session Start

Full-screen banner. Runs once at startup.

```
╔══════════════════════════════════════════════════════╗
║                                                     ║
║     ██████  ▄▄        ▄▄ ▄▄▄▄▄▄▄▄                  ║
║    ██▀▀▀▀██ ██        ██ ▀▀▀██▀▀▀                  ║
║    ██      ██ ██        ██    ██                     ║
║    ████████ ██        ██    ██                     ║
║    ██▀▀▀▀██ ██        ██    ██                     ║
║    ██      ██ ██        ██    ██                     ║
║    ██      ██ ██████████    ██                     ║
║     ▀▀      ▀▀        ▀▀    ▀▀                     ║
║                                                     ║
║    QA Automation Tools · v1.0.0                     ║
╠══════════════════════════════════════════════════════╣
║                                                     ║
║     ● Projeto:  ECSPOL                              ║
║     ● Jira:     🟢 online  (230ms)                 ║
║     ● Token:    ✓ configured                        ║
║     ● Sessão:   iniciada                            ║
║                                                     ║
║    Digite /help a qualquer momento.                 ║
╚══════════════════════════════════════════════════════╝
```

### Main Menu

Each section is a `card()`. The whole menu is wrapped in a main `boxen` with header context.

```
╔══════════════════════════════════════════════════════╗
║  QA Tools · ECSPROJ         csv-import: 5/5  3✅ 1❌ ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║  ┌─ TESTES ──────────────────────────────────────┐   ║
║  │  1  Criar testes a partir de CSV              │   ║
║  │ 15  Importar testes de JSON                    │   ║
║  └────────────────────────────────────────────────┘   ║
║                                                       ║
║  ┌─ RELEASES ────────────────────────────────────┐   ║
║  │  2  Listar versoes de release                 │   ║
║  │  3  Criar nova versão                         │   ║
║  │  4  Atribuir fixVersion às tarefas            │   ║
║  │  5  Atualizar package.json + release notes    │   ║
║  │  6  Verificar status das tarefas              │   ║
║  │  7  Fechar tarefas automaticamente            │   ║
║  │  8  Publicar versão                           │   ║
║  └────────────────────────────────────────────────┘   ║
║                                                       ║
║  ┌─ CONFIGURACAO ────────────────────────────────┐   ║
║  │  9  Alterar projeto Jira      [ECSPROJ]       │   ║
║  │ 10  Alterar diretório git     [/repo/qa]      │   ║
║  │ 14  Alterar diretório Cypress [~/cypress]     │   ║
║  │ 16  Alterar diretório JSON    [~/json]        │   ║
║  └────────────────────────────────────────────────┘   ║
║                                                       ║
║  ┌─ UTILITARIOS ─────────────────────────────────┐   ║
║  │ 11  Gerar template CSV                        │   ║
║  │ 12  Diagnosticar conexão                      │   ║
║  │ 13  Criar Test Execution                     │   ║
║  └────────────────────────────────────────────────┘   ║
║                                                       ║
║  3 ✅ · 1 ❌    /h Help                               ║
║  Digite uma opção [1-15] ou /help:  █               ║
╚══════════════════════════════════════════════════════╝
```

### Command Form

```
╔══════════════════════════════════════════════════════╗
║  1 · Criar testes a partir de CSV                    ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║  Caminho do arquivo CSV                               ║
║  ┌──────────────────────────────────────────────────┐ ║
║  │ /home/user/tests/test_steps.csv                  │ ║
║  └──────────────────────────────────────────────────┘ ║
║                                                       ║
║  Labels Jira (separadas por vírgula)                  ║
║  ┌──────────────────────────────────────────────────┐ ║
║  │ regression, smoke, sprint-30                    │ ║
║  └──────────────────────────────────────────────────┘ ║
║                                                       ║
║  ┌─ Preview ──────────────────────────────────────┐   ║
║  │                                                 │   ║
║  │  TC01  Login válido          2 steps  PRE-001  │   ║
║  │  TC02  Login inválido        2 steps           │   ║
║  │                                                 │   ║
║  │  Total: 2 testes · 4 steps · 1 grupo           │   ║
║  └─────────────────────────────────────────────────┘   ║
║                                                       ║
║  [Enter] Confirmar    /back  Voltar                   ║
╚══════════════════════════════════════════════════════╝
```

### Progress View

Spinner or progress bar + list of operations.

```
  ┌─ Processamento ──────────────────────────────────┐
  │                                                   │
  │  ✅ TEST-123  Login válido             1.2s      │
  │  ✅ TEST-124  Login inválido           0.8s      │
  │  ⏳ TEST-125  Logout                   2.1s ...  │
  │                                                   │
  │  ████████████░░░░░░░░░░  60% | 12/20 | 15s      │
  │                                                   │
  │  • 12 created  • 0 failed  • 8 remaining        │
  └───────────────────────────────────────────────────┘
```

### Success Summary

```
╔══════════════════════════════════════════════════════╗
║  ✅  Operation Complete                               ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║    ✓ 5 passed                                         ║
║    ✗ 1 failed  → TEST-125: rate limit                ║
║                                                       ║
║    📊  83.3% pass rate                                ║
║    📎  Test Execution: TEST-130                       ║
║                                                       ║
║  [Enter] Back to Menu                                 ║
╚══════════════════════════════════════════════════════╝
```

### Error Dialog

```
╔══════════════════════════════════════════════════════╗
║  ✖  Connection Error                                 ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║  Failed to connect to Jira API                        ║
║                                                       ║
║  • URL:     https://jira.company.com/jira            ║
║  • Status:  0 (ECONNREFUSED)                         ║
║  • Time:    30.5s (timeout)                          ║
║                                                       ║
║  Suggestions:                                         ║
║  1. Check VPN connection                              ║
║  2. Verify JIRA_BASE_URL in .env                     ║
║  3. Run option 12 (Diagnostic)                       ║
║                                                       ║
║  [R]etry  [D]etails  [A]bort                         ║
╚══════════════════════════════════════════════════════╝
```

### Diagnostic Output

```
╔══════════════════════════════════════════════════════╗
║  12 · Diagnosticar Conexão                           ║
╠══════════════════════════════════════════════════════╣
║                                                       ║
║  ┌─ Endpoint ──────────┬─ Status ─┬─ Time ────┐     ║
║  │ Jira API            │ 200 🟢   │ 342ms     │     ║
║  │ Xray API            │ 403 🔴   │ 1.5s      │     ║
║  │ Projeto ECSPROJ     │ 200 🟢   │ 800ms     │     ║
║  └─────────────────────┴──────────┴───────────┘     ║
║                                                       ║
║  ● 2 ok  ● 1 error                                   ║
║                                                       ║
║  ✖ Xray API: 403 — token may be invalid             ║
║    → Check XRAY_BASE_URL and XRAY_TOKEN in .env     ║
║                                                       ║
║  [Enter] Voltar                                       ║
╚══════════════════════════════════════════════════════╝
```

---

## States

### Loading

Spinner only (ora). No box. Positioned on its own line.

```
⠋ Connecting to Jira API...
```

### Empty

Simple info line:

```
○ Nenhuma operação registrada ainda.
```

### Transition (between screens)

Clear screen, show next view. Use `console.clear()` for clean transitions.
Short-lived operations (under 2s) do NOT clear screen — output inline.

### Non-TTY / CI Mode

When `!process.stdout.isTTY` or `CI=true`:

| Component | Fallback |
|-----------|----------|
| `ora` | Prints text without animation |
| `boxen` | Raw text, no border drawing |
| `cli-progress` | `[====>]` percentage line, no ETA |
| `gradient-string` | Plain chalk color (leftmost gradient stop) |
| `figlet` | Skipped, use text logo |

All output remains valid and parsable. No visual regression in logs.

---

## Implementation Plan

### Phase 1 — Install deps + refactor prompt.js (1 day)

```
npm i chalk cli-table3 ora cli-progress boxen gradient-string figlet ansi-escapes
```

Replace raw ANSI in `shared/prompt.js` with `chalk` equivalents.
Keep function signatures identical — zero breakage for existing handlers.

### Phase 2 — Add boxen to menu and cards (1 day)

- Wrap sections in `card()` calls
- Add `boxen` main wrapper around menu
- Add context line to header

### Phase 3 — Tables, spinners, progress (1 day)

- Replace `console.table()` calls with `cli-table3`
- Replace custom spinner with `ora`
- Replace custom progress with `cli-progress`

### Phase 4 — Banner + polish (1 day)

- `figlet` + `gradient-string` for welcome screen
- Error dialogs with `boxen double` red border
- Diagnostic screen with table
- Non-TTY fallbacks

---

## Non-Goals

- Mouse interaction
- Images / graphics
- Hyperlinks (rarely supported in terminals)
- Animation beyond spinners and progress bars
- Responsive layout (terminal width is fixed by user)
