# Style Guide: TUI & Reports (qa_tools)

Esta é a "Fonte da Verdade" visual para o projeto `qa_tools`. O objetivo é garantir uma experiência **Minimalista**, **Profissional** e **Consistente** entre a CLI (TUI) e os Relatórios HTML (Stakeholders).

---

## 1. Paleta de Cores (Semântica)

Devemos usar as cores definidas em `shared/palette.ts` para garantir consistência.

| Uso | Cor (Hex) | Semântica |
| :--- | :--- | :--- |
| **Success** | `#3fb950` | Operações concluídas com sucesso. |
| **Error** | `#f85149` | Falhas, interrupções, erros críticos. |
| **Warn** | `#d29922` | Avisos, estados parciais ou atenção. |
| **Info** | `#58a6ff` | Informação, links, comandos ativos. |
| **Muted** | `#8b949e` | Metadados, labels, textos secundários. |
| **Border** | `#30363d` | Bordas de boxes e tabelas. |

> **Regra de ouro**: Cores são para **feedback de estado**, não para decoração. Se o texto for informativo, prefira `fg` (default) ou `muted`.

---

## 2. Tipografia

### TUI (Terminal)
*   **Fonte**: Monospaced (padrão do terminal).
*   **Hierarquia**:
    *   **Títulos**: Bold + Cor de destaque (Info).
    *   **Labels**: Muted (sublinhado ou não).
    *   **Valores**: Bold + Branco/Default.

### Relatórios (HTML)
*   **Fonte**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
*   **Hierarquia**:
    *   **Título (h1)**: 1.5rem, Bold, `text-gray-900`.
    *   **Labels (cards)**: 0.75rem, Uppercase, `text-gray-500`, Letter-spacing: 0.05em.
    *   **Valores (cards)**: 1.5rem, Bold.

---

## 3. Espaçamento e Layout

### TUI (Box/UI)
*   **Padding**:
    *   Padrão: `1` espaço horizontal, `0` vertical (dentro de boxes).
    *   Respiro: Linha vazia (`\n`) entre seções distintas.
*   **Bordas**: Minimalistas (usar `single` ou `none` se possível).

### Relatórios (HTML)
*   **Cards (Resumo)**: `16px 20px`, `border-radius: 8px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`.
*   **Tabelas**: `padding: 8px 12px` (cells), `background: #fff`.
*   **Espaçamento**: Manter um `margin-bottom: 20px` entre seções (`summary`, `chart-box`, `table`).

---

## 4. Componentes

*   **Badges de Status**:
    *   Formato: `inline-block`, `padding: 2px 8px`, `border-radius: 9999px`.
    *   Cores: Versões leves (background suave) das cores da paleta para fundo, com texto contrastante escuro.
*   **Tabelas**:
    *   Cabeçalho cinza suave (`#f3f4f6`).
    *   Hover effect (`#f9fafb`) para leitura facilitada.

---
*Este guia deve ser seguido em toda refatoração de UI (TUI ou Relatórios).*
