# Visual Validation Checklist

**Purpose:** Manual visual validation checklist for all HTML dashboards and PR report outputs.
**Created:** R5.3 — 2026-07-27
**Status:** Executed at least once per dashboard + PR report output before release.

---

## Checklist

| # | Check | Command/Action | Expected Result |
|---|-------|----------------|-----------------|
| 1 | Dark mode | Open each dashboard HTML, add class `html.dark` to root element | Colors preserved, WCAG AA contrast maintained |
| 2 | Mobile (320px) | Resize browser to 320px width or use devtools responsive mode | Layout responsive, tables horizontally scrollable |
| 3 | Tablet (768px) | Resize browser to 768px width | Layout adjusted, no overflow |
| 4 | Desktop (1200px+) | Resize browser to 1200px+ width | Full layout displayed correctly |
| 5 | Print (Ctrl+P) | Print each dashboard via browser print dialog | Print styles applied, no overflow, readable |
| 6 | Screen reader | Use NVDA (Windows) or VoiceOver (macOS) | All `data-component` roles announced correctly |
| 7 | Keyboard navigation | Tab through all interactive elements | Focus indicators visible on all interactive elements |
| 8 | Zero Unicode symbols in source | `grep -P '[✓✗⏭◷▶↻Σ]' shared/pr-report-core.ts` | 0 matches in output markdown |
| 9 | Zero emojis in source shortcodes | `grep -P '[\x{1F300}-\x{1FAFF}]' shared/pr-report-core.ts` | 0 matches (shortcodes are text only) |
| 10 | Zero inline styles | `grep 'style="' reports/*.html` | 0 matches (except dynamic column widths) |

---

## Dashboard Inventory

| Dashboard | File | Checked |
|-----------|------|---------|
| ai-effectiveness | `reports/ai-effectiveness.html` | [ ] |
| ai-comparison | `reports/ai-comparison.html` | [ ] |
| incident-report | `reports/incident-report.html` | [ ] |
| impact-alert | `reports/impact-alert.html` | [ ] |
| traceability | `reports/traceability.html` | [ ] |
| flakiness | `reports/flakiness.html` | [ ] |
| backlog-health | `reports/backlog-health.html` | [ ] |
| release-score | `reports/release-score.html` | [ ] |
| silent-regression | `reports/silent-regression.html` | [ ] |
| defect-trend | `reports/defect-trend.html` | [ ] |
| defect-seasonality | `reports/defect-seasonality.html` | [ ] |
| developer-profile | `reports/developer-profile.html` | [ ] |
| pipeline-cost | `reports/pipeline-cost.html` | [ ] |
| suite-optimization | `reports/suite-optimization.html` | [ ] |
| cross-squad-benchmark | `reports/cross-squad-benchmark.html` | [ ] |
| requirement-score | `reports/requirement-score.html` | [ ] |
| coverage-report | `reports/coverage-gap.html` | [ ] |
| test-report | `reports/pr-report.html` | [ ] |
| pipeline-health | `reports/pipeline-health.html` | [ ] |
| weekly-quality-report | `reports/weekly-quality-report.html` | [ ] |
| quality-gate | `reports/quality-gate.html` | [ ] |

---

## PR Report Outputs

| Output | Location | Checked |
|--------|----------|---------|
| PR Comment Markdown | GitHub PR comment | [ ] |
| GitHub Job Summary | `$GITHUB_STEP_SUMMARY` | [ ] |
| HTML Report Artifact | `reports/pr-report.html` | [ ] |

---

## Execution Log

| Date | Dashboard | Checker | Result | Notes |
|------|-----------|---------|--------|-------|
| | | | | |

---

## Notes

- This checklist is a **manual** validation step — not automated
- Execute before each major release or when HTML/CSS primitives change
- Document any visual regressions found during execution
- Cross-reference with `HTML-CSS-HOOKS-AUDIT.md` for attribute completeness
