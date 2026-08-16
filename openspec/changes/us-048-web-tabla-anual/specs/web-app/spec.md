# Delta for web-app

Source: `openspec/changes/us-048-web-tabla-anual/proposal.md` (US-048, issue #282). New requirements use
fresh family **`WTA-*`** (Web Tabla Anual) — the annual grid (`ResumenAnual`) has no requirements of its
own today. `WTA-*` REFERENCES, never restates, the families below.

Labels: **(jsdom)** = DOM/text/accessible-name/pure-function truth, verifiable by Vitest/jsdom.
**(Playwright)** = truth depends on rendered geometry at a real viewport; jsdom cannot verify it.

| Referenced | Governs |
|---|---|
| `WG5-01`/`WG5-13` | 4-item ring apportionment; Sin categoría dilutes the 3 spend shares |
| `WG5-07`/`WG5-08`/`WG5-09` | Semáforo tag is a navigable link; `null` estado → "Sin datos", still live; `/semaforo` stub |
| `WG5-10` | Rendered-geometry verification, never className presence alone |
| `WPER-*`/`WMYP-*` | Period-navigation plumbing (reused unchanged) |
| `WDS-04` | Capability `web-dashboard-shell`, defined only in the **un-archived** change `openspec/changes/web-dashboard-redesign-mobile/specs/web-dashboard-shell/spec.md` — its own verify-report records this grid's `2/3/4`-column layout as an **accepted-but-unratified deviation** (⚠️ PARTIAL/SUGGESTION), not a locked living requirement. What IS locked and green is the code-level `ResumenAnual.test.tsx` grid-columns test; this change does not re-litigate that test |

## ADDED Requirements

### Requirement: WTA-01 — Each mini renders the same 4-item ring reading as the main chart, apportioned over its own month's totals (CA-01)

Every month cell's mini ring MUST call `calcularDistribucionGasto` with no bucket-set override, yielding the
`WG5-01` 4-wedge reading (Necesidades, Deseos, Ahorro, Sin categoría) apportioned from THAT month's own
`buckets` totals (`WG5-13` dilution applies per-mini). The `BUCKETS_5030` override and its interim comment
MUST NOT exist after this change.

#### Scenario: A mini renders 4 wedges from its own month's totals (jsdom)

- GIVEN 12 months of `buckets` data, one with a nonzero Sin categoría total
- WHEN the grid renders
- THEN every mini shows 4 wedges in fixed order, proportioned from that month's own totals

#### Scenario: No 3-slice override remains (jsdom)

- GIVEN the grid's source
- WHEN a mini's ring data is computed
- THEN `calcularDistribucionGasto` is called with no bucket-set override argument

### Requirement: WTA-02 — The month driving the main chart is a distinct "selected" marker, coexisting with the pre-existing "today" marker (CA-02, D-1)

The cell whose `periodo` equals `viewModel.periodo` (prop-derived, never locally tracked clicks) MUST render
a distinct "selected" marker (larger, accent-filled), separate from the pre-existing "today" marker (`✓` +
`aria-current="date"`, keyed to the real calendar month only). Both MUST render simultaneously when they
differ; `aria-current` MUST stay reserved for today and MUST NOT be repurposed for "selected".

#### Scenario: Viewing a month other than today shows both markers on their own cells (jsdom)

- GIVEN the viewed period is March and today is August
- WHEN the grid renders
- THEN March shows the selected marker only; August shows `✓`/`aria-current="date"` only

#### Scenario: Viewing today's month shows both markers on the same cell (jsdom)

- GIVEN the viewed period equals the current calendar month
- WHEN the grid renders
- THEN that cell shows both the selected marker and `✓`/`aria-current="date"` together

### Requirement: WTA-03 — Existing data-month navigation survives the DOM restructure (regression, CA-03)

*(Verification-only. `MesCelda` click → `onSelectPeriodo` → `WPER-*`/`WMYP-*` plumbing already switches the
main chart, no reload, preserving drill-down/bucket-reset. This change restructures `MesCelda`'s DOM
(`WTA-05`); this requirement pins that behavior against regression — no wiring is rebuilt.)*

A data-month click/keyboard-activation MUST switch the viewed period and re-render the main chart with no
reload, preserving existing drill-down and bucket-selection reset.

#### Scenario: Clicking a data month switches the main chart without reload (jsdom)

- GIVEN a month cell with data, not selected
- WHEN the user clicks or keyboard-activates it
- THEN the main chart re-renders for that month, no reload, drill-down resets as before

### Requirement: WTA-04 — Existing disabled-cell semantics survive the DOM restructure (regression, CA-04)

*(Verification-only. `sinIngreso` cells already render `aria-disabled`, no `tabIndex`/`onClick`. This change
restructures `MesCelda`'s DOM (`WTA-05`); this requirement pins that behavior against regression — no
behavior is rebuilt.)*

An empty/future cell MUST stay visually muted, `aria-disabled="true"`, and non-responsive to click/keyboard.

#### Scenario: An empty/future cell stays non-navigable (jsdom)

- GIVEN a month cell with no data
- WHEN the user clicks it or tabs to it and presses Enter/Space
- THEN no navigation occurs, `aria-disabled="true"` is present, and it is excluded from Tab order

### Requirement: WTA-05 — Every month carries an independently clickable semáforo tag, including empty/future months (CA-05, D-2, D-3, D-4)

Each cell MUST carry a compact semáforo tag, top-right, navigating to `/semaforo?periodo={mes.periodo}` on
click/keyboard — the `WG5-07` transversal rule applied here. It MUST render and stay navigable for EVERY
month, including empty/future ones (`WTA-04`'s disabled state governs only the month control) and for a
`null` `estadoGlobal` (`WG5-08`'s "Sin datos", still a live link). Its accessible name MUST identify the
month. The month control and the tag MUST be SIBLING interactive elements — never nested — with a stated
tab order. Its rendered hit area MUST be ≥24×24 CSS px, verified by rendered geometry at a real viewport
(`WG5-10`), never by className presence — the exact anti-pattern that shipped `WCTG-14` false.

#### Scenario: An empty/future month's tag stays clickable while the cell stays disabled (jsdom)

- GIVEN a future cell with `estadoGlobal: null`
- WHEN the grid renders
- THEN the month control is `aria-disabled`; that cell's tag shows "Sin datos" and navigates on activation

#### Scenario: The month control and the tag are siblings, never nested (jsdom)

- GIVEN any rendered cell
- WHEN the accessible tree is inspected
- THEN the month button and the semáforo link are independent elements, each separately Tab-reachable

#### Scenario: The tag's rendered hit area meets the 24×24 CSS px floor at a real viewport (Playwright, anti-pattern named)

- GIVEN a cell's semáforo tag at a representative viewport
- WHEN its bounding box is measured
- THEN width and height are each ≥24 CSS px, asserted against rendered geometry — never a sizing className
  alone, the `WCTG-14` gap

### Requirement: WTA-06 — Section header and caption carry the approved literal Spanish copy, the caption naming the actually selected month (CA-06)

The section header (`<h2>`, also the region's accessible name) MUST render the literal text
`Año {anio} — vista macro por mes` (e.g. `Año 2026 — vista macro por mes`).

The grid MUST render a caption below it, associated with the section, using the literal template `Toca un
mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo {mes año}.` —
the `{mes año}` fragment MUST be derived from `viewModel.periodo` (the CURRENTLY selected month), never
hardcoded.

#### Scenario: The section header renders the approved literal (jsdom)

- GIVEN the grid is rendered for `anio = 2026`
- WHEN the header renders
- THEN it reads exactly `Año 2026 — vista macro por mes`

#### Scenario: The caption names the actually selected month (jsdom)

- GIVEN the viewed period is `2026-03`
- WHEN the caption renders
- THEN it reads exactly `Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de
  siempre. Estás viendo marzo 2026.` and updates when the viewed period changes
