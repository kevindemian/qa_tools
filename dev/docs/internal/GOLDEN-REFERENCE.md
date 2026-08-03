# Golden Reference — QA Tools Visual Design

**Purpose:** Single-approval visual reference for all HTML dashboards, PR report output, and
job summaries. Every appearance decision is auditable here or in `ARTIFACT-VALIDATION.md` §10.
**Created:** F5-T6 — 2026-08-03
**Status:** F5 completed (T1–T6, 2026-08-02/03)

Any change to tokens, typography, spacing, charts, icons, or Markdown symbols MUST be validated
against this document. A deviation without a documented decision here or in §10 is a defect.

---

## 1. Design Mandate

> "modern professional" — **not** Spartan, **not** carnival.
> Aparência = tokens `theme-tokens.ts` + WCAG AA contrast + accessibility + golden reference
> (single approval). — `ARTIFACT-VALIDATION.md` C3

Non-negotiable properties of every artifact:

1. Token-driven — no hardcoded color/typography/spacing values.
2. WCAG AA text contrast (≥ 4.5:1 for body, ≥ 3:1 for large text) in light AND dark.
3. Accessible — skip-link, visible focus, reduced-motion, tabular numbers for data.
4. Data-dense — decoration must not add noise; empty states are explicit.
5. Emoji-free in reports — Unicode emoji and GitHub emoji shortcodes are forbidden.

---

## 2. Reference Hierarchy

| Rank | Reference | Role | Status |
|------|-----------|------|--------|
| 1 | **Primer** (GitHub) | Primary color system + typography | APPROVED |
| 2 | **Carbon** (IBM) | Secondary reference, data-visualization | APPROVED |
| 3 | **USWDS** | Accessibility ruler (contrast, focus, a11y) | APPROVED |
| 4 | **Linear** | UX benchmark (clarity, density, focus rings) | APPROVED |
| 5 | **OmniRoute** (`diegosouzapw/OmniRoute`) | Aesthetic reference for the golden reference | APPROVED (scoped) |
| 6 | **Lucide** | Icon set (enriched usage, kept) | APPROVED |
| — | Grid wallpapers (OmniRoute decorative grids) | Background decoration | **REJECTED** — noise in data-dense reports |

### OmniRoute — approved aspects (2026-08-02, §10 ②)
- Card-based layout with clear hierarchy between titles, body, and call-to-action.
- Muted text for secondary metadata; strong contrast reserved for primary content.
- Generous but consistent spacing; single accent color per section.

### OmniRoute — rejected aspects
- Decorative grid wallpaper background. Rationale: adds visual noise to data-dense
  QA reports; competes with chart bars and tables for attention.

---

## 3. Color System (Primer, AA-corrected)

Decisão §10 ① (2026-08-02): the original plan presets (`#16a34a`, `#d97706`) fail WCAG AA text
contrast when measured via relative luminance. Corrected at origin to Primer values, all ≥ 4.5:1
on white.

| Token | Light value | Contrast (white) | Usage |
|-------|-------------|------------------|-------|
| `color.semantic.success` | `#1a7f37` | 5.08:1 | Success / pass |
| `color.semantic.error` | `#d1242f` | 5.24:1 | Error / fail |
| `color.semantic.warn` | `#9a6700` | 4.87:1 | Warning |
| `color.semantic.info` | `#0969da` | 5.19:1 | Info / link / focus |
| `color.brand.jira` | `#0052cc` | — (accent only) | Jira brand accent — border/accent ONLY, never text in dark (§10) |

Dark mode is Primer-exact (`#0d1117` bg / `#161b22` card / `#8b949e` muted / `#c9d1d9` fg) and
already passes AA (6–11:1).

Chart tokens map to the same Primer scale (`tokens.color.chart.{pass,skip,fail}`).

---

## 4. Typography, Spacing, Shape

- System font stack; tabular numbers on all data (`font-variant-numeric: tabular-nums`).
- Radius and spacing come exclusively from tokens (`tokens.borderRadius`, `tokens.spacing`).
- Focus ring: 2px `var(--color-info)` with 2px offset (USWDS pattern).

---

## 5. Icons

- **Lucide** via `shared/icons.ts` — kept and enriched (26 icons, incl. `link`).
- Icons render with `role="img"` and `data-component="icon"` (screen-reader announcable).
- Emoji are forbidden as icon substitutes.

---

## 6. Markdown Symbols (job summary / PR comment)

GitHub emoji shortcodes (`:white_check_mark:`, `:x:`, …) are forbidden — they render as emojis.
Use ASCII symbols from `MARKDOWN_SYMBOLS` (single source of truth in `shared/pr-report-core.ts`):

| Status | Symbol |
|--------|--------|
| pass | `[PASS]` |
| fail | `[FAIL]` |
| warn | `[WARN]` |
| skip | `[SKIP]` |
| time | `[TIME]` |
| total | `[TOTAL]` |
| rate | `[RATE]` |
| changed | `[CHANGED]` |
| unknown | `[UNKNOWN]` |
| quarantined | `[QUARANTINED]` |
| info | `[INFO]` |
| arrow | `->` |

---

## 7. Enforcement / Acceptance

Automated acceptance gates (also in `ARTIFACT-VALIDATION.md` F5):

- `rg` — zero hex colors outside `theme-tokens.ts`.
- Zero emoji codepoints in report/PR/job-summary output.
- Zero static inline `style=` (only dynamic data geometry via `--custom-property` is allowed,
  per B17 — e.g. `--bar-width`, `--bar-h`, `--bar-color`).
- WCAG AA text contrast for every token pair used for text.

Manual gates: `dev/docs/internal/visual-validation-checklist.md` items 1–10.

---

## 8. Related Documents

- `ARTIFACT-VALIDATION.md` — plan, B15–B18 rows, F5 decisions §10.
- `visual-validation-checklist.md` — manual visual checks.
- `HTML-CSS-HOOKS.md` / `HTML-CSS-HOOKS-AUDIT.md` — attribute/component completeness.
