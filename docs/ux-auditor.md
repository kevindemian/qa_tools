# UX Auditor

## Overview

UX Auditor detects UX anti-patterns and computes a friction score for the CLI.

## Categories

### 1. Noisy Journey (Jornada Ruidosa)

Detects:

- **Prompts without hints**: `ask()` calls missing a `hint:` option — user left guessing what to type
- **Submenu items without alias**: menu entries reachable only by navigating a submenu, no direct `/command` available
- **Handlers without HELP_TOPICS**: exported handlers with no documentation entry

### 2. Dead Utility

Detects exported functions called exclusively from test files, never from production code. These are either:

- True dead code (should be removed or marked `@internal`)
- Test-only utilities (should be in a `test-utils/` directory or marked `@internal`)

## UX Friction Score

Composite metric:

- **PR** = prompts without hint / total prompts
- **EX** = handlers without HELP_TOPICS / total handlers
- **AL** = submenu items without alias / total submenu items
- **DP** = max submenu nesting depth (1 or 2)
- **Score** = (PR + EX + AL) × DP, clamped to [0, 1]

## Usage

```bash
npx tsx scripts/ux-auditor.ts
```

Output: `.audit/ux-audit-<YYYY-MM-DD>.json`

## Two-Phase Workflow

1. **Audit** — generates report only, no code modification
2. **Review** — human reviews findings and decides per dead-utility finding:
    - `@internal` JSDoc tag — it's intentionally test-only
    - `__SKIP_AUDIT__` comment — false positive, suppress
    - Move to `test-utils/` directory
    - Remove export
