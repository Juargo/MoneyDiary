# Delta for web-app

Source: `openspec/changes/us-049-semaforo-detalle/proposal.md` (US-049, issue #283). Every
requirement below traces to a CA-0N from the proposal (verbatim where quoted) or to a specific
proposal decision named in its own text. New requirements use a fresh family, **`WSEM-*`** (Web
Semáforo detail) — the proposal's own suggested `/semaforo` scope — rather than extending
`WG5-*` (dashboard main chart) or `WCAT-*` (bucket drill-down), because `/semaforo` is a
standalone detail page, not a modification to the dashboard's chart, legend, or panel.

Two scenario labels are used below, per the precedent this repo already established (`WCTG-14`,
`WCTM-01..06`, `WG5-*`):

- **(jsdom)** — the scenario's truth is DOM structure, text content, an accessible name/role, or a
  pure function's return value — verifiable by the existing Vitest/jsdom suite.
- **(Playwright)** — the scenario's truth depends on rendered geometry (layout variant, position)
  at a real viewport. `pnpm web test` (jsdom) CANNOT verify these.

This change scopes no new responsive/tablet layout work — a mobile version of `/semaforo` is
explicitly out of scope (per the proposal). Every scenario below is (jsdom)-labeled; a future
change introducing a mobile `/semaforo` layout would add its own (Playwright) scenarios then, not
here.

**Reused, unchanged families (not restated here):**

- `WG5-07`/`WG5-08` (the dashboard's clickable semáforo tag navigating to `/semaforo`, including
  its "Sin datos" null-state handling) are unchanged by this change — `/semaforo` is the
  navigation *target*, not the tag itself.
- The `_authenticated` session guard is reused unchanged (previously asserted by `WG5-09`, now
  asserted by `WSEM-07` below).

## ADDED Requirements

### Requirement: WSEM-01 — Header renders the month, a static semáforo badge, and the diagnosis, adopting `SemaforoBadge` (CA-01, CA-02)

The `/semaforo` page header MUST render: the viewed month (reusing the existing month-label
convention already governed by `WPER-01`/`WMYP-*`), a STATIC (non-clickable) semáforo badge
showing `estadoGlobal` — reusing the existing `SemaforoBadge` component, adopting it for genuine
reuse (closing issue #382) rather than building a new header treatment — and the diagnosis
sentence from `GET /api/resumen/semaforo` (`resumen-semaforo` SEM-01) rendered verbatim as page
copy, with no client-side re-derivation or templating.

#### Scenario: Header shows the month, a static badge, and the exact diagnosis text (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns `estadoGlobal='amarillo'` and a diagnosis sentence
- WHEN `/semaforo` renders
- THEN the header shows the viewed month, `SemaforoBadge` in the Amarillo state, and the diagnosis
  sentence verbatim

#### Scenario: The header badge is a static indicator, not a navigable link (jsdom)

- GIVEN `/semaforo` has rendered
- WHEN the header badge is inspected
- THEN it exposes no interactive/link role — unlike the dashboard's clickable semáforo tag
  (`WG5-07`), the badge here is a static status indicator, since the user is already on `WG5-07`'s
  navigation destination

### Requirement: WSEM-02 — Page states explicitly that the global state is the worst of the 3 spend buckets (CA-03)

The page MUST render a short, static explanation stating that the global semáforo state is
determined by whichever of Necesidades/Deseos/Ahorro is in the worst state. This copy is static
UI text describing the rule, distinct from the per-period diagnosis sentence (`WSEM-01`).

#### Scenario: The worst-of-3 explanation is present regardless of state (jsdom)

- GIVEN any `estadoGlobal` value
- WHEN `/semaforo` renders
- THEN a visible sentence explains that the global state reflects the worst of the 3 spend buckets

### Requirement: WSEM-03 — Each spend bucket renders a row with a zone bar whose bands come from the wire, never a client-side constant (CA-04)

For each of Necesidades, Deseos, Ahorro, the page MUST render a row showing: the bucket's
percentage against its target, its own `estadoSemaforo`, and a zone bar visualizing where the
bucket's `porcentajeBp` falls relative to the Verde/Amarillo/Rojo bands. The zone bar's band
positions and widths MUST be computed from the band-edge values `GET /api/resumen/semaforo`
returns (`resumen-semaforo` SEM-02) — the component MUST NOT hardcode Necesidades' 50/60, Deseos'
30/40, or Ahorro's 20/40/10/50 as literal threshold numbers anywhere in the web codebase.

#### Scenario: Each bucket row shows its own percentage, estado, and zone bar (jsdom)

- GIVEN a `GET /api/resumen/semaforo` response with Necesidades at 5500bp (Amarillo)
- WHEN `/semaforo` renders
- THEN the Necesidades row shows its percentage, an "Amarillo" state, and a zone bar

#### Scenario: Zone bar band positions come from the wire, not a hardcoded constant (jsdom)

- GIVEN a test double response where Necesidades' band edges differ from the domain's real
  constants (e.g. `verdeMax=5500`/`amarMax=6500` instead of `5000`/`6000`)
- WHEN `/semaforo` renders
- THEN the rendered zone bar reflects the response's band edges, not `5000`/`6000` — proving the
  values are read from the wire, not from a client-side constant

#### Scenario: No zone-bar or bucket-row source contains a hardcoded threshold literal (jsdom)

- GIVEN the web codebase's zone-bar and bucket-row component source
- WHEN it is inspected (e.g. by a source-scanning test asserting the literals' absence)
- THEN none of the 8 domain threshold basis-point values (`5000`, `6000`, `3000`, `4000`, `2000`,
  `1000`) appears as a classification constant used to compute the bar's geometry or estado

### Requirement: WSEM-04 — Every Amarillo/Rojo bucket shows a CLP advice row with the correct framing; Ahorro covers both sides (CA-05)

When a bucket's `estadoSemaforo` is Amarillo or Rojo, its row MUST render the advice sentence the
API returns verbatim (`resumen-semaforo` SEM-03's `mensaje`, per `resumen-semaforo` SEM-10's
mensaje contract), with the client substituting the single `{monto}` placeholder with the
CLP-formatted amount. Two framings exist, both tuteo: an imperative reduce/increase framing for
Necesidades, Deseos, and Ahorro's low side —
`Para volver a Verde, {reduce|aumenta} {monto} en {bucket} este mes.` — and an informational
framing for Ahorro's high side —
`Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.` A Verde
bucket MUST NOT render an advice row.

#### Scenario: An over-target Necesidades shows the imperative reduce-framed advice row (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Necesidades with `estadoSemaforo='rojo'` and a
  `mensaje` of `Para volver a Verde, reduce {monto} en Necesidades este mes.`
- WHEN `/semaforo` renders
- THEN the Necesidades row shows `Para volver a Verde, reduce {monto} en Necesidades este mes.`
  with `{monto}` substituted by the CLP-formatted amount

#### Scenario: A below-band Ahorro shows the imperative increase framing (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Ahorro with `estadoSemaforo='amarillo'` and a
  `mensaje` of `Para volver a Verde, aumenta {monto} en Ahorro este mes.`
- WHEN `/semaforo` renders
- THEN the Ahorro row shows `Para volver a Verde, aumenta {monto} en Ahorro este mes.` with
  `{monto}` substituted by the CLP-formatted amount, not the informational framing

#### Scenario: An above-band Ahorro shows the informational framing (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Ahorro with `estadoSemaforo='amarillo'` and a
  `mensaje` of `Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en
  Verde.` (the above-band case, not Necesidades/Deseos' unilateral reduce)
- WHEN `/semaforo` renders
- THEN the Ahorro row shows `Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y
  quedar en Verde.` with `{monto}` substituted by the CLP-formatted amount, not the imperative
  framing

#### Scenario: A Verde bucket shows no advice row (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns Deseos with `estadoSemaforo='verde'`
- WHEN `/semaforo` renders
- THEN the Deseos row shows no advice sentence

### Requirement: WSEM-05 — Sin categoría warning shows count and total, and links to its bucket detail (CA-06)

The page MUST render a Sin categoría warning showing its transaction count and total (from
`resumen-semaforo` SEM-05) and a link navigating to `/buckets/SinCategoria` (the existing
bucket-detail route, `WCAT-*`). The warning MUST be softened or omitted when the count is zero,
consistent with the app's existing zero-impact softening precedent (`WCTG-08`).

#### Scenario: A nonzero Sin categoría count renders the warning with a working link (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns a nonzero Sin categoría count and total on the wire
- WHEN `/semaforo` renders
- THEN a warning shows the count and total, with a link that navigates to
  `/buckets/SinCategoria`

#### Scenario: A zero Sin categoría count is softened or omitted (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns a Sin categoría count of zero on the wire
- WHEN `/semaforo` renders
- THEN the warning is not shown in its full alarming form (softened or omitted)

### Requirement: WSEM-06 — A no-income month renders a self-explanatory state instead of empty percentages (CA-07)

WHEN the response's `sinIngreso` (or equivalent) is true, the page MUST render an explanation of
the no-income state — using the backend's no-income diagnosis (`resumen-semaforo` SEM-06) —
instead of rendering bucket rows with empty or null percentages, zone bars, or advice rows.

#### Scenario: A no-income period renders the no-income explanation, not empty bucket rows (jsdom)

- GIVEN `GET /api/resumen/semaforo` returns `sinIngreso=true`
- WHEN `/semaforo` renders
- THEN the no-income diagnosis renders, and no bucket row renders an empty percentage, zone bar,
  or advice row

### Requirement: WSEM-07 — Deep link honours `periodo`, and "Volver" returns to the dashboard preserving it (CA-08)

`/semaforo` MUST resolve its data for the `periodo` carried in its URL search param — unchanged
arrival behavior, already covered by `semaforo-route.test.tsx`'s existing arrival assertion — and
MUST remain session-protected like every other `_authenticated` route (unchanged guard, previously
asserted by the now-superseded `WG5-09`). The page's "Volver" control MUST navigate back to `/`
carrying the SAME `periodo` forward as a search param (`Link search={{ periodo }}`) — fixing the
existing stub's bug, where the return link dropped `periodo` and silently reset the dashboard to
the current month.

#### Scenario: Volver preserves the periodo that was being viewed (jsdom)

- GIVEN `/semaforo` was opened with `periodo=2026-03`
- WHEN the user activates "Volver"
- THEN the URL becomes `/` with `periodo=2026-03` preserved, not the current month

#### Scenario: Arrival still honours a deep-linked periodo (regression guard, jsdom)

- GIVEN a deep link to `/semaforo?periodo=2026-03`
- WHEN the page loads
- THEN the data shown corresponds to `periodo=2026-03`, unchanged from the existing stub's arrival
  behavior

#### Scenario: `/semaforo` remains session-protected (regression guard, jsdom)

- GIVEN no active session
- WHEN the browser navigates to `/semaforo`
- THEN it redirects to `/login?redirect=/semaforo`, via the existing `_authenticated` guard — no
  new guard code is introduced

### Requirement: WSEM-08 — The zone bar conveys state through text, never color alone (ADR-018, WCAG 2.2 AA)

The zone bar's visual fill MUST be `aria-hidden` (decorative), and every piece of information it
conveys — the bucket's `porcentajeBp`, the band edges, and the resulting estado — MUST also be
present as visible/accessible text near the bar. This mirrors the existing
`SemaforoBadge`/`SemaforoTag`/`MiniSemaforoTag` precedent, which never conveys state via color
alone.

#### Scenario: Zone bar state is available as text, not only as a colored fill (jsdom)

- GIVEN a bucket row with its zone bar rendered
- WHEN the row's accessible text content is inspected with the zone bar's decorative fill excluded
- THEN the bucket's percentage, band edges, and estado are all present as text/accessible content

#### Scenario: The zone bar's visual fill is excluded from the accessibility tree (jsdom)

- GIVEN a bucket row's zone bar
- WHEN its DOM is inspected
- THEN the decorative fill element carries `aria-hidden="true"`, so assistive tech relies on the
  adjacent text, not the visual bar

## REMOVED Requirements

### Requirement: WG5-09 — The `/semaforo` stub route renders an explicit "under construction" state, never blank or a 404 (CA-03 risk mitigation)

(Reason: US-049 fills `/semaforo` with real content — header, worst-of-3 explanation, per-bucket
rows, advice rows, a Sin categoría warning, a no-income state, and a period-preserving back-link.
The stub's "en construcción" placeholder and its two scenarios no longer describe the shipped
route; they are fully superseded by `WSEM-01..08` above.)

(Migration: the route itself, its position in the `_authenticated` route tree, and its
session-protection guard are UNCHANGED — only the rendered content changes. `WSEM-07` re-asserts
the session-guard regression explicitly so that guarantee is not silently dropped along with the
stub text. No URL or routing behavior is retired, only the placeholder content. Archiving this
change MUST ALSO update the canonical spec's cross-reference summary row
(`openspec/specs/web-app/spec.md` ~line 1440, the `WG5-07`/`WG5-08`/`WG5-09` row) — its
`/semaforo` stub mention becomes stale once `WG5-09` is removed and `WSEM-01..08` ship; either
replace that mention with a reference to the shipped `WSEM-*` page, or split the row so
`WG5-07`/`WG5-08` keep their own summary text and the `WG5-09` stub clause is dropped. This is not
satisfied by removing the requirement block above alone.)
