# Tasks: US-043 — Web Configuración, Categorías section

- **Change**: `us-043-web-configuracion-categorias`
- **Inputs**: `design.md` (mechanism, authoritative), `specs/web-app/spec.md` (`WCTG-01..14` +
  deltas on `WCFG-01/11/12`, `WCAT-02/04`), `specs/catalogo-clasificacion-ownership/spec.md`
  (housekeeping only), `proposal.md` (binding decisions), `wireframes-extracted.md`
- **Delivery**: `delivery_strategy: ask-on-risk` · `chain_strategy: feature-branch-chain` — PR #1a
  targets the tracker branch; every later PR targets the immediately previous PR's branch. Only the
  tracker merges to `main`.
- **Strict TDD is ACTIVE.** Every task below is marked `RED:`, `RED+GREEN:`, or `GREEN:`. `GREEN:`
  is used only where design's own TDD exception applies (route files — `tsr generate` must run
  before a route's types exist, §5) or where the work is mechanical (renames, config, deletions,
  manual verification) and there is nothing meaningful to red-first.

## Re-slicing note (departure from the proposal's/design's 6-PR sketch, both of which say
`sdd-tasks` owns the binding version)

Design's §6 gives 6 conceptual slices and explicitly assigns sizing to this phase. Applying the
proposal's calibration (size production code, multiply by ≥2.4; treat any slice under 250
production lines with suspicion) to each of the 6 conceptual slices puts **PR #1 and PR #3 each
past 1500 total lines** — larger than either of US-042's `size:exception` PRs. Per
`chained-pr`/`work-unit-commits`, a >400-line PR is a **candidate for further splitting**, not an
automatic exception. This document therefore ships **9 chained PRs**, splitting the two oversized
conceptual slices, while preserving every ordering rule design states:

- **PR #1 → PR #1a (shell) + #1b (data layer, the wire) + #1c (data layer, cache + copy)** — the
  shell restructure (layout, tabs, directory split, route scaffolding, eslint glob) and the data
  layer are independently reviewable work units with no ordering dependency between their
  *internals* — the shell doesn't call the data layer yet.
  **Maintainer decision, 2026-08-14**: the data layer was split again because its single-PR form
  (~1715 lines) rivalled `#3b`, which **cannot** be split (non-negotiable #3 forbids separating the
  bucket-change confirmation from its `PATCH`). Keeping `#3b` as the sole oversized PR concentrates
  reviewer attention on the one operation that rewrites closed months. Seam: `#1b` is *how we talk
  to the API* (DTOs, constants, drift guard, the 7 calls + runtime guards + typed errors); `#1c` is
  *how we cache it and what we say* (query hook, both invalidation profiles, the message table).
- **PR #3 → PR #3a (create) + #3b (identity edit + bucket-change confirm + delete-from-edit)** —
  `NuevaCategoriaForm` (creation) has no dependency on the edit screen's identity form. **Non-negotiable
  #3 is preserved**: the bucket-change confirmation and the `PATCH` that can trigger it both ship in
  PR #3b, never split across PRs.
- **PR #2, #4, #5, #6 keep design's boundaries exactly** — each was already a coherent, independently
  reviewable unit and splitting further would fragment things that must land together (e.g. PR #4's
  pattern mutations and their invalidation-exclusion test).

This is a re-slicing of PR *boundaries*, not of *ordering* or *content* — every file still lands in
the same relative sequence design specifies (shell before data before list before create before
edit before patterns before second-delete-entry-point before the reclassify repair).

---

## Traceability legend

Every task cites the exact `WCTG-*`/`WCFG-*`/`WCAT-*` requirement id(s) it satisfies, from the
**frozen spec** (`specs/web-app/spec.md`) — not from design §4's hand-off table, whose suggested
numbers predate spec-freeze and no longer match (e.g. design's table calls the list "WCTG-03"; the
frozen spec assigns the list `WCTG-02`). This document follows the frozen spec's numbering
throughout.

---

## PR #1a — Shell: routes, layout, directory split

*No data layer yet — `CategoriasPanel`/`EditarCategoria` render stub placeholders. Depends on
nothing. Targets the tracker branch.*

- [x] 1. **GREEN** — Widen the a11y `error`-tier glob in `apps/web/eslint.config.js` from the single file
   `src/routes/_authenticated/configuracion.tsx` to the pattern
   `src/routes/_authenticated/configuracion*.tsx`. **Lands first, before any new route file is
   authored** (D-10) — otherwise the new route files are ungated while being written.
   *Requirement*: `WCFG-12` (delta — glob widens).
   *Files*: `apps/web/eslint.config.js`.

- [x] 2. **GREEN** *(TDD exception — route files cannot be red-first per design §5; `tsr generate` must
   run before their types exist)* — Create the four route files: modify
   `configuracion.tsx` to become a layout (`<ConfiguracionLayout><Outlet/></ConfiguracionLayout>`,
   `validateSearch` unchanged in place — Q1c); create `configuracion.index.tsx`,
   `configuracion.categorias.tsx`, and `configuracion_.categorias.$categoriaId.tsx` as thin
   containers rendering minimal stub panels (`<p>Cargando…</p>` placeholders — `CategoriasPanel`/
   `EditarCategoria` are built in PR #2/#3b). Run `pnpm web typecheck` immediately after creation so
   `routeTree.gen.ts` exists before task 4 (`<Link to="/configuracion/categorias">`) is authored.
   *Requirement*: `WCTG-01` (route hierarchy, trailing-underscore escape verified against the
   installed generator per Q1b), `WCFG-01` (delta — nested routes inherit `_authenticated`'s guard
   with no new guard code: confirm with a redirect test on the new deep route,
   `/configuracion/categorias/abc123` → `/login?redirect=...`, reusing the existing
   `_authenticated` test idiom).
   *Files*: `apps/web/src/routes/_authenticated/configuracion.tsx` (modify),
   `configuracion.index.tsx`, `configuracion.categorias.tsx`,
   `configuracion_.categorias.$categoriaId.tsx` (new).

- [x] 3. **RED, GREEN** — `ConfiguracionLayout.tsx` (+ test): `Configuración` h1 (A2), the fluid
   `grid-cols-1 lg:grid-cols-[200px_1fr]` grid (reproducing `ConfiguracionPage.tsx`'s shipped grid),
   `<ConfiguracionTabs/>` + `<Outlet/>`, and — **the 360px floor ships with this component, not
   later** — `min-w-0` on the content-track grid item (Q10a mechanism 1, the fix truncation below
   depends on).
   *Requirement*: `WCFG-11` (delta — shared layout grid, T1 proportions preserved, columns stack
   below `lg`), `WCTG-13` (mobile floor guarantee 1, mechanism 1 of 2 — the other, `truncate`,
   lands per-component in later PRs).
   *Files*: `apps/web/src/components/configuracion/ConfiguracionLayout.tsx` (+ test).

- [x] 4. **RED, GREEN** — `ConfiguracionTabs.tsx` (modify + test): `Categorías` becomes a real `<Link
   to="/configuracion/categorias">` with `aria-current="page"` on its own route, replacing the
   disabled placeholder `<button>`.
   *Requirement*: `WCTG-01` (scenario: "The Categorías tab is a real, active link").
   *Files*: `apps/web/src/components/configuracion/ConfiguracionTabs.tsx` (+ test).

- [x] 5. **GREEN** — Directory split: move the 8 US-042 files (`PerfilForm`, `GoogleVinculoSection`,
   `ConfirmarPasswordDialog`, `mensajes.ts` + their 4 tests) into
   `src/components/configuracion/perfil/`, fixing only import lines. Pure rename — no behavioural
   change, GitHub collapses the diff. `CampoTexto.tsx` **stays** at the shared `configuracion/`
   level (D-09 — `categorias/` uses it too).
   *Requirement*: none directly (housekeeping, D-09). Guards that no test content changed.
   *Files*: `apps/web/src/components/configuracion/perfil/**` (moved).

- [x] 6. **RED+GREEN** — `PerfilPanel.tsx` (rename+edit of `ConfiguracionPage.tsx`, moved into `perfil/`):
   drop the h1/grid/tabs it no longer owns (now `ConfiguracionLayout`'s job); update its test
   accordingly. This is **not** a pure rename (D-09's correction) — the component's rendered output
   changes.
   *Requirement*: `WCFG-11` (delta — Perfil renders inside the shared layout, not its own grid).
   *Files*: `apps/web/src/components/configuracion/perfil/PerfilPanel.tsx` (+ test, renamed+edited
   from `ConfiguracionPage.tsx`/`.test.tsx`).

- [x] 7. **RED+GREEN** — `configuracion.index.tsx`: move the `?google=` `useState` capture, the cleanup
   effect, and `markSkipNextAuthRefetch()` verbatim from `configuracion.tsx` into this leaf, reading
   the search param via `useSearch({ from: '/_authenticated/configuracion' })` (Q1c). Render
   `PerfilPanel`.
   *Requirement*: `WCFG-01`/`WCFG-05` (delta — `?google=` still works after the route split).
   *Files*: `apps/web/src/routes/_authenticated/configuracion.index.tsx` (implement, replacing
   task 2's stub); `configuracion.tsx` (modify — drop the moved effect, keep `validateSearch`).

- [x] 8. **GREEN** — Verify zero files touched under `apps/api/**` and `apps/mobile/**` so far:
   `git diff --stat main... -- apps/api apps/mobile` must be empty. **Repeat this exact check as the
   last task of every subsequent PR** (referenced, not re-numbered, in each phase's gate list below)
   — non-negotiable #8.
   *Requirement*: none (proposal's Affected Areas table + Success Criteria — "Zero files changed
   under `apps/api/` and `apps/mobile/`").
   *Files*: none (verification only).

**Gates**: `pnpm web typecheck` (mandatory — `tsr generate && tsc -b`, the only typecheck) ·
`pnpm web test` (does NOT typecheck) · `pnpm web lint` (the widened glob from task 1 must be
already active) · task 8's zero-API-diff check.

---

## PR #1b — Data layer, part 1: the wire

*Depends on PR #1a merging first (targets its branch). No UI consumes this yet — inert until PR #2.*

> **Split from the original single `#1b` (~1715 lines) by maintainer decision, 2026-08-14.** The seam
> is transport-vs-state: `#1b` is *how we talk to the API* (DTOs, constants, drift guard, the seven
> calls and their runtime guards, typed errors); `#1c` is *how we cache it and what we say*
> (query hook, both invalidation profiles, the Spanish message table). Rationale: `#3b` cannot be
> split — separating the bucket-change confirmation from its `PATCH` is prohibited (non-negotiable
> #3) — so it stays the one oversized PR, and reviewer attention is concentrated there rather than
> spread across two 1700-line diffs.

- [x] 9. **GREEN** — Add `CategoriaDto`, `PatronDto`, `CatalogoDto` to `apps/web/src/api/types.ts`
   (hand-written, ADR-008 exception, matching the deployed `categorias`/`patrones` routes' response
   shapes). Type-only; verified by task 12's runtime guards, not by a standalone test.
   *Requirement*: supports `WCTG-02/04/07/08/09/12` (the wire contract every later task depends on).
   *Files*: `apps/web/src/api/types.ts` (modify).

- [x] 10. **RED, GREEN** — `catalogo-constantes.ts` (+ test): `BUCKETS_ASIGNABLES = ['Necesidades',
    'Deseos', 'Ahorro']`, `MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX']` (Q4a).
    *Requirement*: `WCTG-02` (group order), `WCTG-04`/`WCTG-07` (bucket dropdown values), housekeeping
    D-06.
    *Files*: `apps/web/src/api/catalogo-constantes.ts` (+ test).

- [x] 11. **RED, GREEN** — `catalogo-constantes.mirror.spec.ts`: the source-text drift guard reading the
    four backend files as plain text (never imported — ADR-008 holds because it's a test), asserting
    (a) web `BUCKETS_ASIGNABLES` equals each backend copy in order, (b) web `MATCH_TYPES` equals each
    backend copy in order, (c) the two backend `BUCKETS_ASIGNABLES` copies equal each other, (d) the
    two backend `MATCH_TYPES` copies equal each other (Q4b — retiring `categoria.mirror.spec.ts`'s
    8-name pin is done in PR #6, §7, when its subject actually disappears).
    *Requirement*: housekeeping, D-06 (recorded follow-up: a backend shared export is the strictly
    better fix, out of scope here).
    *Files*: `apps/web/src/api/catalogo-constantes.mirror.spec.ts`.

- [x] 12. **RED, GREEN** — `categorias.ts` (+ test): the 7 calls (`fetchCatalogo`, `postCategoria`,
    `patchCategoria`, `deleteCategoria`, `postPatron`, `patchPatron`, `deletePatron`), the 3 runtime
    guards (`esPatronDto`, `esCategoriaDto`, `esCatalogoDto` — `transaccionesCount` guarded as
    `number`, `matchType`/`bucket` guarded as plain strings per Q2b), the shared `enviarMutacion`
    fetch/401/non-2xx mapper with `body.code` lifted into `ApiError`. Mutation success bodies are
    discarded (only `fetchCatalogo` reads and guards, Q2a). No `409` branch exists for
    `deleteCategoria` — and none should be written (decision 5) — assert this explicitly with a test
    that inspects the function's handling of a `409` response and confirms it falls through to the
    generic non-2xx path, not a dedicated branch.
    *Requirement*: `WCTG-02/04/07/08/09/12` (the data layer every UI task in PR #2+ consumes),
    `WCTG-08` (scenario: "No 409 handling exists to find").
    *Files*: `apps/web/src/api/categorias.ts` (+ test).

**Gates (PR #1b)**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · repeat PR #1a task 8's
zero-API-diff check.

---

## PR #1c — Data layer, part 2: the cache and the copy

*Depends on PR #1b merging first (targets its branch). Still inert — no UI consumes it until PR #2.
Carries non-negotiable #4: the invalidation **exclusion** is task 14, its own task.*

- [x] 13. **RED, GREEN** — `use-categorias.ts` (+ test): `CATEGORIAS_QUERY_KEY = ['categorias']`,
    `categoriasQueryOptions()`, `useCategorias()`. One key serving list, edit screen, and (PR #6)
    the reclassify dropdown.
    *Requirement*: `WCTG-02` (list data source), `WCTG-10` (single query resolves the edit route by
    id, no `GET /api/categorias/:id`).
    *Files*: `apps/web/src/api/use-categorias.ts` (+ test).

- [x] 14. **RED, GREEN** — `categorias-invalidacion.ts` (+ test) — **the invalidation exclusion is its own
    dedicated task, not an assertion folded into another task** (non-negotiable #4): `invalidarCatalogo`
    (profile A) and `invalidarCatalogoYDashboard` (profile B), both exported and independently unit
    tested against a spied `QueryClient.invalidateQueries`, with **exact array equality** in both
    directions — profile A's test asserts `claves()` equals `[['categorias']]` (a **third** key would
    fail this, unlike a weaker `not.toHaveBeenCalledWith`), profile B's test asserts `claves()` equals
    `[['categorias'], ['resumen'], ['resumen-anual'], ['detalle-bucket']]` in order.
    *Requirement*: `WCTG-09` (both scenarios: "A pattern mutation invalidates only the catalog" AND
    "does NOT invalidate the dashboard" — the exclusion).
    *Files*: `apps/web/src/api/categorias-invalidacion.ts` (+ test).

- [x] 15. **RED, GREEN** — `mensajes-catalogo.ts`, error-table portion: `CodigoCatalogo` (the 12-member
    closed union), `COPY: Record<CodigoCatalogo, string>` (totality by `Record`, not `switch`+`never`
    — Q8b's correction), `mensajeDeErrorCatalogo` (keyed by `code` alone per Q8a — `aCatalogoHttpError`
    is one-class-one-status-one-code), `MENSAJE_DEMO_CATALOGO` (Q6c's correction — a **new** sibling
    constant, not `MENSAJE_DEMO_SOLO_LECTURA` reused verbatim, because that string names "tu perfil").
    `it.each` over all 12 codes + network + unknown-code + no-code.
    *Requirement*: `WCTG-12` (all 4 scenarios: the 11-code table + `BODY_INVALIDO`, the compile-error
    guard via the closed `Record`), `WCTG-11` (demo copy source).
    *Files*: `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts` (+ test) — new
    file, extended in PR #3b with the dialog-payload translator.

**Gates (PR #1c)**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · repeat PR #1a task 8's
zero-API-diff check.

---

## PR #2 — CA-01: the read-only list

*Depends on PR #1a (routes/layout) and PR #1b + #1c (data layer). Targets #1c's branch. First
visible value; zero mutation risk except the demo-disabled delete icon.*

- [x] 16. **RED, GREEN** — `plural.ts` (+ test): `etiquetaPatrones(n)` (0 → `sin patrones`, 1 → `1
    patrón`, n≥2 → `N patrones`) and `etiquetaTransacciones(n)` (1 → `1 transacción`, n≥2 → `N
    transacciones`), `it.each` at 0/1/2/11. Two named helpers, not one generic pluraliser (Q7a — the
    zero form is a different *word*, not `0 patrones`).
    *Requirement*: `WCTG-03` (all 3 scenarios).
    *Files*: `apps/web/src/components/configuracion/categorias/plural.ts` (+ test).

- [x] 17. **RED, GREEN** — `estilos.ts` (+ test): `CLASE_BOTON_ICONO` (`size-6` = 24×24 CSS px, WCAG 2.2 AA
    SC 2.5.8). Pure unit test: `expect(CLASE_BOTON_ICONO).toContain('size-6')`. First of its three
    usages (list-row edit, list-row delete here; pattern-row delete in PR #4 — `dry`'s 3-strike rule
    satisfied on first write per Q10c).
    *Requirement*: `WCTG-13` (guarantee 3, layer 1 of 3 — class-constant pin; layers 2/3 are the RTL
    usage checks below and PR #5's manual pass).
    *Files*: `apps/web/src/components/configuracion/categorias/estilos.ts` (+ test).

- [x] 18. **RED, GREEN** — `agrupar-categorias-por-bucket.ts` (+ test): `agruparPorBucket(categorias)` —
    pure, the three assignable-bucket groups in fixed order, empty groups dropped, an `otros`
    fallback group for any bucket outside `BUCKETS_ASIGNABLES` (unreachable through the deployed API
    today, exists so an unexpected bucket lists rather than vanishing, Q4c). *Inferred file
    location*: design's Q4c gives the function but not its path; placed beside its sibling
    `agrupar-detalle-por-categoria.ts` (same pure-grouping shape, no React) rather than under
    `categorias/`, because PR #6 (§7) reuses it from `ReclasificarCategoriaControl`, which sits
    outside `components/configuracion/` — a `domain/` import avoids a cross-feature-directory import
    that would misstate ownership.
    *Requirement*: `WCTG-02` (scenario: "Groups render in fixed bucket order with the display
    label"), the `otros` fallback and empty-group-dropping.
    *Files*: `apps/web/src/domain/agrupar-categorias-por-bucket.ts` (+ test).

- [x] 19. **RED, GREEN** — `CategoriaFila.tsx` (+ test): one list row — name in a `min-w-0 truncate` cell
    inside a `flex flex-wrap items-center gap-2` row (Q10a mechanism 2), the pattern-count tag
    (`plural.ts`), edit + delete icon buttons both carrying `CLASE_BOTON_ICONO` and a disambiguated
    `aria-label` including the category name (`Editar categoría {nombre}` / `Eliminar categoría
    {nombre}` — the `EliminarIngestaControl:122` precedent: a list of identical icon buttons is
    unusable by screen reader without per-row names). The delete icon is **proactively disabled** for
    a demo session with no dialog wired yet (wiring lands in PR #5, task 47) — for now it is inert.
    *Requirement*: `WCTG-02` (row content), `WCTG-03` (tag), `WCTG-11` (demo-disabled delete icon),
    `WCTG-13` (guarantee 1's `truncate` half, guarantee 3's two icon buttons — usages 1/3 and 2/3 of
    `CLASE_BOTON_ICONO`).
    *Files*: `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx` (+ test).

- [x] 20. **RED, GREEN** — `CategoriasPanel.tsx` (+ test): `useCategorias()` → `agruparPorBucket` → group
    headings via `ETIQUETA_BUCKET` (A1 — `Deseos` sent, `Gustos` displayed), rows via `CategoriaFila`;
    query-pending and query-error states; the empty-catalog state; the responsive footer sentence
    (A4 — `lg` and up vs. below `lg`, reusing the shell's existing `lg` breakpoint, no new tier); the
    demo `role="note"` banner (read path still renders normally per `WCTG-11`'s second scenario). The
    **`Nueva categoría` button is intentionally NOT in this task** — see PR #3a task 23, which adds it
    together with its form so no dead button ships.
    *Requirement*: `WCTG-02` (scenarios: "Groups render in fixed bucket order", "A deleted-all
    user sees the empty state"), `WCTG-11` (scenarios: "demo sees disabled controls" partial — the
    banner; "a demo user's catalog still reads normally"), `WCTG-13` (guarantee 1 at panel level).
    *Files*: `apps/web/src/components/configuracion/categorias/CategoriasPanel.tsx` (+ test).

- [x] 21. **GREEN** *(TDD exception — route file)* — Wire the real `CategoriasPanel` into
    `configuracion.categorias.tsx`, replacing PR #1a task 2's stub.
    *Requirement*: `WCTG-01` (the list leaf renders its real content).
    *Files*: `apps/web/src/routes/_authenticated/configuracion.categorias.tsx` (modify).

- [x] 22. **GREEN** — Repeat the zero-API-diff check (PR #1a task 8).

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · task 22.

---

## PR #3a — Create flow

*Depends on PR #2 (extends `CategoriasPanel`). Independent of PR #3b — creation doesn't touch the
edit screen.*

- [x] 23. **RED, GREEN** — `CampoSelect.tsx` (+ test): the Bucket `<select>` — `configuracion/` has no
    `<select>` today (D-08). `<label>`-associated, options from `BUCKETS_ASIGNABLES` displayed via
    `ETIQUETA_BUCKET` (A1, one lookup, list and this component share it).
    *Requirement*: `WCTG-02` (feeds `NuevaCategoriaForm`), `WCFG-12` (delta — `getByLabelText`
    reachable).
    *Files*: `apps/web/src/components/configuracion/categorias/CampoSelect.tsx` (+ test).

- [x] 24. **RED, GREEN** — `use-crear-categoria.ts` (+ test): `POST /api/categorias`, profile B
    invalidation (`invalidarCatalogoYDashboard`), asserted with the exact-array pattern from PR #1b
    task 14 at the hook level: `claves()` equals `[['categorias'], ['resumen'], ['resumen-anual'],
    ['detalle-bucket']]`.
    *Requirement*: `WCTG-02` (creation), `WCTG-09` (inclusion, category-mutation profile).
    *Files*: `apps/web/src/api/use-crear-categoria.ts` (+ test).

- [x] 25. **RED, GREEN** — `NuevaCategoriaForm.tsx` (+ test): `Nombre` + `Bucket (obligatorio)` +
    `Crear`/`Cancelar`, toggled open by the (new, task 26) `Nueva categoría` button, closes on `201`.
    Proactively `disabled` for demo with `role="note"` (Q6c's `MENSAJE_DEMO_CATALOGO`, PR #1b task 15).
    *Requirement*: `WCTG-02` (creation), `WCTG-11` (demo-disabled `Crear`).
    *Files*: `apps/web/src/components/configuracion/categorias/NuevaCategoriaForm.tsx` (+ test).

- [x] 26. **RED, GREEN** — Wire the `Nueva categoría` button (page-level, beside the title; `Nueva`
    below `lg`, `Nueva categoría` at `lg` and up, per §8c's responsive-label mechanism — `aria-label`
    stable, visible text shortens) into `CategoriasPanel`, mounting `NuevaCategoriaForm` on click.
    This closes `WCTG-02`'s button clause, deliberately deferred from PR #2 (task 20) so the button
    and its form ship together.
    *Requirement*: `WCTG-02` (scenario coverage for the `Nueva categoría` button, closed here).
    *Files*: `apps/web/src/components/configuracion/categorias/CategoriasPanel.tsx` (modify + test
    update).

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint`.

---

## PR #3b — Identity edit + the bucket-change impact confirmation + delete-from-edit-screen

*Depends on PR #3a merging first (branch chain), and reuses PR #1a/#1b/#2's foundations. **The
highest-risk slice, isolated on purpose** (design §6): money moving across all periods is one
reviewer's whole job. Non-negotiable #3 is enforced structurally by this PR's own boundary — the
bucket-change confirmation (task 30) and the `PATCH` that can change the bucket (task 30, same task)
never split across PRs.*

- [x] 27. **RED, GREEN** — `mensajes-catalogo.ts`, dialog-payload extension: `ImpactoCatalogo`
    (discriminated union — `eliminar` | `cambiar-bucket`) and `fraseDeImpacto` (pure translator,
    closes with `const _exhaustive: never = i`), covering all 4 payload rows verbatim from design
    Q6b's table (delete n≥1, delete n=0, bucket-change n≥1, bucket-change n=0 — the zero case
    **softens, never skips**).
    *Requirement*: `WCTG-07` (dialog copy states both count and all-periods scope), `WCTG-08` (dialog
    copy, zero case softened).
    *Files*: `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts` (modify + test).

- [x] 28. **RED, GREEN** — `ConfirmarImpactoDialog.tsx` (+ test): the `EliminarIngestaControl` shape —
    `role="alertdialog"`, `aria-modal="false"`, focus to confirm on open, Escape cancels **and
    restores focus to the trigger**, `role="alert"` inline error, **dialog does not close on
    failure**. Takes rendered copy (`titulo`, `lineas`, `textoConfirmar`) — knows nothing about what
    it's confirming (D-03, US-042 D-02 precedent).
    *Requirement*: `WCTG-07` (scenario: "Escape cancels and preserves the dirty draft"), `WCTG-08`
    (dialog mechanics shared with delete).
    *Files*: `apps/web/src/components/configuracion/categorias/ConfirmarImpactoDialog.tsx` (+ test).

- [x] 29. **RED, GREEN** — `use-actualizar-categoria.ts` (+ test): `PATCH /api/categorias/:id`, profile B
    invalidation. Includes the **belt-and-braces rename-only case** from Q5c: a rename-only `PATCH`
    (bucket unchanged) still produces the full profile-B invalidation list — the assertion that would
    fail if someone later "optimises" the rename path.
    *Requirement*: `WCTG-09` (inclusion, plus the rename-only regression guard for Q5b's resolved
    open question).
    *Files*: `apps/web/src/api/use-actualizar-categoria.ts` (+ test).

- [x] 30. **RED, GREEN** — `use-eliminar-categoria.ts` (+ test): `DELETE /api/categorias/:id`, always
    `204` (decision 5 — no `409` branch exists, asserted explicitly as its own case, mirroring PR
    #1b task 12's client-level assertion at the hook level), profile B invalidation.
    *Requirement*: `WCTG-08` (scenario: "Confirming delete succeeds unconditionally"; scenario: "No
    409 handling exists to find" — hook-level), `WCTG-09` (inclusion).
    *Files*: `apps/web/src/api/use-eliminar-categoria.ts` (+ test).

- [x] 31. **RED, GREEN** — `EditarCategoria.tsx`, resolution states: resolve the category by `id` out of
    `['categorias']` (no `GET /:id` exists); the four reachable states (pending `role="status"`,
    error `role="alert"` + `mensajeDeErrorCatalogo` + `Volver a Categorías` link, ok, **id absent**
    `role="status"` + `Esa categoría ya no existe.` + link); the in-flight-delete guard (`if
    (eliminacion.isSuccess) return null` — pinned by a test: delete succeeds → `Esa categoría ya no
    existe.` never appears in the document). **Correction (judgment-day, 2026-08-14):** the guard MUST
    check `isSuccess` ONLY, never `isPending` — the originally prescribed `isPending || isSuccess`
    contradicted task 28's "dialog does not close on failure" by unmounting the whole subtree
    (including an open `ConfirmarImpactoDialog`) for the full delete round-trip, so a failed delete
    remounted fresh with the dialog and its inline error gone. The breadcrumb (`Configuración /
    Categorías / {nombre}`, `aria-current="page"` on the leaf).
    *Requirement*: `WCTG-01` (Q1d — the edit screen's own h1/breadcrumb, no tab list), `WCTG-10`
    (scenario: "A stale or deleted id renders a not-found state" + the in-flight-delete guard test).
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (+ test, new).

- [x] 32. **RED, GREEN** — `EditarCategoria.tsx`, identity form: `Nombre` + `CampoSelect` inside
    `<form id="form-identidad">`; footer `Cancelar`/`Guardar` associated via the HTML `form`
    attribute (not nesting), disambiguated `aria-label`s (`Cancelar cambios de nombre y bucket`).
    Driven in tests with `fireEvent.submit(form)` (the `PerfilForm` idiom — jsdom's `form=`-attribute
    submit-button activation is not something to bet a suite on; a real-browser click path is
    verified once manually, not "fixed" with a double-firing `onClick`, per design's explicit jsdom
    note). Assert `getByRole('button', {name:'Guardar'})` has `form="form-identidad"`; a clean submit
    issues **exactly** `['PATCH /api/categorias/:id']`.
    *Requirement*: `WCTG-04` (scenario: "Guardar sends exactly one PATCH for identity, never
    touching patterns"), `WCTG-05` (the `form=` mechanism carrying the two-commit honesty that the
    frames' single footer row removed).
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 33. **RED, GREEN** — `EditarCategoria.tsx`, the bucket-change impact confirmation — **ships in this
    same task as the `PATCH` that can trigger it (non-negotiable #3)**: when `Bucket` is dirty
    relative to the loaded value, `Guardar`'s submit handler opens `ConfirmarImpactoDialog` with
    `fraseDeImpacto({tipo:'cambiar-bucket', ...})` instead of calling `useActualizarCategoria`
    directly; confirming calls the mutation; Escape closes the dialog, restores focus to `Guardar`,
    and leaves `Bucket` dirty on screen with **no** request sent; a failed confirm keeps the dialog
    open with the inline error.
    *Requirement*: `WCTG-07` (both scenarios: "A dirty Bucket cannot save without confirming",
    "Escape cancels and preserves the dirty draft").
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 34. **RED, GREEN** — `EditarCategoria.tsx`, delete from the edit screen (first of the two entry
    points, Q6d — the second, from the list row, is PR #5): the footer's red `Eliminar categoría`
    button (disambiguated `aria-label="Eliminar categoría {nombre}"`, `border-t` + `justify-between`
    separation from `Guardar`/`Cancelar` per Q3b mechanism 4) opens `ConfirmarImpactoDialog` with
    `fraseDeImpacto({tipo:'eliminar', ...})`, sourced from the already-loaded `transaccionesCount`
    (decision 3 — never a fresh fetch); confirming calls `useEliminarCategoria` and, on success,
    navigates back to `/configuracion/categorias`.
    *Requirement*: `WCTG-05` (scenario: "Delete sits in the same row as Cancelar/Guardar"; scenario:
    "No copy implies Cancelar undoes a pattern edit"), `WCTG-08` (scenario: "Confirming delete
    succeeds unconditionally and returns to the list"; scenario: "Zero impact is softened").
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 35. **RED, GREEN** — `EditarCategoria.tsx`, demo: proactively disable `Guardar`, `Crear`-adjacent n/a
    here, and both dialogs' confirm buttons for a demo session with a `role="note"` explanation
    (`MENSAJE_DEMO_CATALOGO`); assert the defensive `403 DEMO_SOLO_LECTURA` mapping on the translator
    directly (not only through a disabled button, per Q6c/D-05); assert the read path (edit-by-id
    from the list) still renders normally for a demo session.
    *Requirement*: `WCTG-11` (all 3 scenarios, for this screen's controls).
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 36. **GREEN** *(TDD exception — route file)* — Wire the real `EditarCategoria` into
    `configuracion_.categorias.$categoriaId.tsx`, replacing PR #1a task 2's stub.
    *Requirement*: `WCTG-01` (the edit leaf renders its real content).
    *Files*: `apps/web/src/routes/_authenticated/configuracion_.categorias.$categoriaId.tsx`
    (modify).

- [x] 37. **GREEN** — Repeat the zero-API-diff check (PR #1a task 8).

### Two maintainer-approved departures recorded during apply, 2026-08-14

- **Task 27's "verbatim" is amended for the `n = 1` case.** Design Q6b's table
  (`design.md:614`) gives the `eliminar, n ≥ 1` row written in the plural —
  `{n} transacciones quedan en Sin categoría…` — and never specifies the singular.
  Interpolating `etiquetaTransacciones(1)` into it produced `1 transacción **quedan**
  en Sin categoría`, broken agreement in the delete-confirmation dialog. The verb now
  agrees (`queda`/`quedan`). Task 16's `plural.ts` exists precisely because this
  feature treats the three count forms as real copy, so an unspecified singular is a
  gap in the template, not a design ruling to reproduce.
- **The `WCTG-12` divergence deferred from PR #2 is resolved here, in favour of
  reconciling.** `CategoriasPanel` rendered `<ErrorState error={query.error}/>`
  (raw `error.message`) while `EditarCategoria` renders `mensajeDeErrorCatalogo`.
  `ErrorState` gains an optional `mensaje` override; the panel passes the catalog
  message at both of its call sites. `error` stays required, so the a11y contract and
  the retry affordance are unchanged, and the four other callers (`ResumenPage`,
  `BucketDetailList`, `ListaIngestas`, `ResumenAnual`) keep the default by omitting
  the prop. The distinguishing case is `tag: 'parse'` — for `network` and for a
  code-less `500` the two tables coincide by accident, so only the `parse` test is
  non-vacuous.

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · task 37.

---

## PR #4 — Patterns CRUD (profile A)

*Depends on PR #3b (`EditarCategoria` exists to host `PatronesSection`). Independent surface,
independent endpoints, independent invalidation profile — decision 2's second mutation surface.*

- [x] 38. **RED, GREEN** — `use-crear-patron.ts`, `use-actualizar-patron.ts`, `use-eliminar-patron.ts`
    (+ tests): `POST`/`PATCH`/`DELETE /api/patrones`, each invalidating **only**
    `invalidarCatalogo` (profile A). `prioridad` is never sent (omitted from every payload → API
    default 100, per the proposal's out-of-scope decision).
    *Requirement*: `WCTG-04` (pattern commits are immediate, independent of `Guardar`), `WCTG-09`
    (profile A, inclusion half — `['categorias']` invalidated).
    *Files*: `apps/web/src/api/use-crear-patron.ts`, `use-actualizar-patron.ts`,
    `use-eliminar-patron.ts` (+ tests).

- [x] 39. **RED, GREEN** — **Dedicated exclusion task** (non-negotiable #4, integration level — PR #1b task
    14 covers the pure-function level): for each of the three pattern-mutation hooks, assert with
    **exact array equality** that the captured `invalidateQueries` calls equal exactly
    `[['categorias']]` — a stray `['resumen']` call fails this. This is the assertion design calls "the
    load-bearing half" of the invalidation matrix (§0.3): a pattern mutation invalidating the
    dashboard is waste; **not** invalidating a category mutation's dashboard keys silently breaks the
    50/30/20 split — this task pins the former, PR #3a/#3b's hook tests pin the latter.
    *Requirement*: `WCTG-09` (scenario: "A pattern mutation does NOT invalidate the dashboard (the
    exclusion)").
    *Files*: `apps/web/src/api/use-crear-patron.test.ts`, `use-actualizar-patron.test.ts`,
    `use-eliminar-patron.test.ts` (extends task 38's test files with the exclusion assertion — listed
    as its own task per the non-negotiable, not folded silently into task 38's commit message).

- [x] 40. **RED, GREEN** — `PatronFila.tsx` (+ test): `matchType` `<select>` (`MATCH_TYPES` →
    `ETIQUETA_MATCH_TYPE`) + value `<input>`, both `<label>`-associated, immediate per-row commits.
    **Corrected 2026-08-14 (judgment-day redesign, after three fix rounds)**: an EXISTING row
    commits on blur-or-Enter, as originally written here — but a NOT-YET-CREATED row commits ONLY on
    an EXPLICIT confirm (Enter, or picking `matchType` once the value already has text); `blur` never
    commits it. The original "commits on blur-or-Enter" wording below did not distinguish the two
    cases, which is what three consecutive fix rounds tried to patch around instead of correcting —
    see `PatronFila.tsx`'s docblock for the full account. This does not amend the frozen spec: WCTG-04
    only requires patterns to commit "the moment each row action is confirmed", which never said
    `blur`; REGEX pre-validation is a **hint, not a gate** (`try { new RegExp(v) }
    catch` → inline `role="status"`, save control stays enabled — the browser's regex engine is not
    guaranteed to match the server's, ADR-024); per-row `aria-live="polite"` commit announcement
    (`Patrón guardado.`, the `ReclasificarCategoriaControl:152-156` idiom); delete icon (third and
    final usage of `CLASE_BOTON_ICONO`, PR #2 task 17's 3-strike rule) fires `DELETE` with **no**
    dialog (a pattern carries no impact — CAT038-04 does not apply); proactively disabled for demo.
    *Requirement*: `WCTG-04` (per-row commit + announcement), `WCTG-11` (demo-disabled pattern
    controls), `WCTG-13` (guarantee 3, usage 3/3).
    *Files*: `apps/web/src/components/configuracion/categorias/PatronFila.tsx` (+ test).

- [x] 41. **RED, GREEN** — `PatronesSection.tsx` (+ test): the pattern-row list, `Agregar patrón` (appends
    a blank row whose first commit is a `POST`), and — **always rendered, not a zero-state**
    (decision 9) — the `Sin patrones, la categoría solo se puede asignar manualmente.` note below the
    list, preceded by an `aria-hidden` info icon, in the same position regardless of pattern count.
    *Requirement*: `WCTG-06` (both scenarios: renders under zero patterns AND under several).
    *Files*: `apps/web/src/components/configuracion/categorias/PatronesSection.tsx` (+ test).

- [x] 42. **RED, GREEN** — Wire `PatronesSection` into `EditarCategoria`, **outside**
    `#form-identidad` (the DOM boundary that states the mechanism — Q3b), plus the cross-cutting
    integration test: adding a pattern (commits immediately) then editing `Nombre` without saving
    then activating `Cancelar` — the identity edit is discarded, the user returns to the list, and
    the pattern is present when the category is reopened. Also assert: `Cancelar` after a pattern
    edit issues **zero** further calls.
    *Requirement*: `WCTG-04` (scenario: "A pattern edit survives Cancelar"), `WCTG-05` (scenario:
    "No copy implies Cancelar undoes a pattern edit").
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [x] 43. **GREEN** — Repeat the zero-API-diff check.

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · task 43.

---

## PR #5 — CA-04's second delete entry point + tablet + the recorded manual 360px pass

*Depends on PR #3b (reuses its dialog + hook) and PR #4 (patterns must be stable before the final
visual pass). Small — mostly wiring and verification.*

- [x] 44. **RED, GREEN** — Wire `CategoriaFila.tsx`'s delete icon (built inert in PR #2 task 19) to
    `ConfirmarImpactoDialog` with `fraseDeImpacto({tipo:'eliminar', ...})` and
    `useEliminarCategoria()` — the second of the two delete entry points (Q6d), reusing exactly the
    dialog and hook PR #3b built for the first. On success, the row's own dialog just closes (the row
    disappears via invalidation) — **no** navigation, unlike the edit screen's version.
    *Requirement*: `WCTG-08` (both entry points reach the same confirmed outcome).
    *Files*: `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx` (modify + test).

- [x] 45. **RED, GREEN** — Confirm/adjust `EditarCategoria`'s `Nombre`/`Bucket` field grid:
    `grid-cols-1 sm:grid-cols-[1fr_220px]` (Q10b — stock Tailwind `sm`, no new tier; at 360 they
    stack, at T3/880 they render `356+200` within the fluid band). Unit test asserts the className
    carries both the mobile (`grid-cols-1`) and the `sm:` variant.
    *Requirement*: `WCTG-13` (scenario: "Nombre and Bucket stack at 360px"), `WCTG-14` (scenario:
    "Nombre and Bucket stay side by side at tablet width").
    *Files*: `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` (modify + test).

- [ ] 46. **GREEN** *(manual — the honest limit named by design Q10c: jsdom performs no layout, so neither
    the ≥24×24 tap target nor "no horizontal overflow" is machine-assertable)* — **Recorded manual
    verification pass**, required before this PR opens (non-negotiable #2): open both screens
    (`/configuracion/categorias`, `/configuracion/categorias/:id`) in browser devtools at exactly
    **360px** and at **880px** (T2/T3), and confirm, writing the result into this PR's description
    verbatim:
    - [ ] No horizontal scrollbar appears on either screen at 360px.
    - [ ] `Nombre`/`Bucket` render stacked at 360px and side by side at 880px.
    - [ ] Every `CLASE_BOTON_ICONO` button (list-row edit, list-row delete, pattern-row delete) and
          every footer/tab-link control measures ≥24×24 CSS px via devtools' element inspector at
          360px.
    - [ ] The desktop structure is otherwise preserved at 360px: vertical tabs, two row icons,
          breadcrumb (no M2/M3 restructure — that's US-063/#332, explicitly out of scope).
    - [ ] **A long category name truncates with an ellipsis on the SAME line as its tag and both
          icon buttons — the row must not wrap to a second line.** Test with a deliberately long
          name (e.g. `Suscripción streaming internacional`). *Added 2026-08-14 from a judgment-day
          finding on PR #336*: `CategoriaFila`'s row is `flex flex-wrap` and the name span is
          `min-w-0 flex-1 truncate`. `truncate` implies `white-space: nowrap`, so per CSS Flexbox
          §9.3 the line-breaking pass sizes that item from its **max-content** width — the full
          untruncated name — BEFORE any shrinking is resolved. `min-w-0` relaxes the minimum used
          when shrinking *within* a line; it does not affect whether the line wraps in the first
          place. So a long enough name can push the tag and icons onto a second line instead of
          ellipsing. Design Q10a's mechanism 2 is faithfully implemented — this checks whether the
          mechanism actually holds, which is precisely what jsdom cannot tell us.

    This checklist result — pass/fail per line, dated, with the browser used — is what closes
    `WCTG-13`'s three scenarios; the automated layers (task 17's class-constant test, task 19/40's
    "every usage carries `CLASE_BOTON_ICONO`" RTL tests) only prove the *code* was not shrunk, never
    the *rendered geometry*. If any line fails, this PR does not merge until it is fixed and the pass
    is re-run.
    *Requirement*: `WCTG-13` (all 3 scenarios — the only slice that closes them), `WCTG-14`
    (scenario: "Tablet width reuses the existing fluid grid, no new tier" — visually confirmed here,
    already unit-tested for the class names in earlier PRs).
    *Files*: none (verification; the PR description is the artifact).

    > **DEFERRED — skipped by maintainer decision, 2026-08-14.** Task 46 is a recorded manual
    > browser verification pass. The maintainer has explicitly decided to skip it for this PR; it was
    > NOT simulated or approximated by any automated substitute.
    >
    > **Consequence: `WCTG-13`'s three scenarios are NOT closed by this change.** The automated
    > layers (task 17's `CLASE_BOTON_ICONO` class-constant test, task 19/40's "every usage carries the
    > class" RTL assertions) prove only that the *code* was not shrunk — never the *rendered
    > geometry*. jsdom performs no layout, so neither the ≥24×24 tap target nor "no horizontal
    > overflow at 360px" is machine-assertable.
    >
    > The full checklist above survives verbatim as this debt's definition of done, including these
    > two items that came from judgment-day findings and cannot be tested in jsdom:
    > 1. A long category name (e.g. `Suscripción streaming internacional`) must truncate with an
    >    ellipsis on the SAME line as its tag and both icon buttons. `CategoriaFila`'s row is `flex
    >    flex-wrap` and the name span is `min-w-0 flex-1 truncate`; `truncate` implies
    >    `white-space: nowrap`, so per CSS Flexbox §9.3 the line-breaking pass sizes that item from
    >    its **max-content** width BEFORE any shrinking is resolved — so a long enough name can push
    >    the tag and icons onto a second line instead of ellipsing.
    > 2. On a **touch device**, tapping `PatronFila`'s delete button: browsers commonly dispatch the
    >    synthetic `mousedown`/`click` pair AFTER the touch-driven focus change (touchstart →
    >    touchend → focus/blur → mousedown → click). If that ordering holds, the blur-commit could
    >    fire a spurious `PATCH` before `clicEliminarEnCursoRef` is set, defeating the pointer-intent
    >    mechanism. Deferred from PR #4's judgment-day round 4.

- [x] 47. **GREEN** — Repeat the zero-API-diff check.

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · task 46's recorded checklist ·
task 47.

---

## PR #6 — Reclassify repair (§7) — the only slice touching shipped dashboard surfaces

*Depends on PR #1b (`useCategorias`, `agruparPorBucket`). Independent of PR #2–#5's UI — this PR
repairs a **different, already-shipped** surface (the dashboard's reclassify control), which is why
design isolates it last: the regression risk must be reviewed unmixed from new-feature noise.
**The PR body must explicitly tell the reviewer to read `WCAT-02`'s and `WCAT-04`'s spec deltas
together with the code** — the ordering rule now reads "alphabetical, Sin categoría last" instead of
"canonical order", and that prose change is only meaningful next to the diff (non-negotiable #5).*

- [x] 48. **RED, GREEN** — `agrupar-detalle-por-categoria.ts`: replace `ordinal()` (which reads the
    about-to-be-deleted `ORDEN_CATEGORIAS`) with `compararGrupos` — alphabetical `es-CL` locale
    comparison (`localeCompare(b, 'es-CL')`, locale **explicit**: unpinned collation depends on the
    runtime's ICU and differs between Node and browser), `Sin categoría` always last regardless of
    count. Test: `['Ñandú','Zapatos','Ahorro','Sin categoría']` → `['Ahorro','Ñandú','Zapatos','Sin
    categoría']` — the case that fails under a naive `<` comparison, pinning why the locale matters.
    *Requirement*: `WCAT-02` (delta — scenarios: "A newly created categoría sorts alphabetically with
    no code change", "Sin categoría group always renders last").
    *Files*: `apps/web/src/domain/agrupar-detalle-por-categoria.ts` (+ test, modify).

- [x] 49. **RED, GREEN** — `ReclasificarCategoriaControl.tsx`: drop both `@/domain/categoria` imports;
    derive `grupos` from `useCategorias()` + `agruparPorBucket` (PR #1b/#2's shared function, Q4c);
    derive the destination bucket from the chosen categoría's own `bucket` field in the DTO (`data
    ?.categorias.find((c) => c.nombre === nombre)?.bucket`), replacing the static `CATEGORIA_BUCKET`
    lookup; while `data` is undefined the `<select>` renders `disabled` with only its current value
    — **never** an empty select on a shipped dashboard surface.
    *Requirement*: `WCAT-04` (delta — all 4 new/modified scenarios: "A just-created categoría is
    offered immediately", "A deleted categoría is no longer offered", "A re-bucketed categoría
    triggers the confirmation correctly", plus the pre-existing within-bucket/cross-bucket/cancel/
    failure scenarios must stay green unmodified).
    *Files*: `apps/web/src/components/ReclasificarCategoriaControl.tsx` (+ test, modify).

- [x] 50. **RED, GREEN** — `apps/web/src/lib/category-icons.test.ts`: replace its `ORDEN_CATEGORIAS`
    import with a local 8-name fixture array. `category-icons.ts` itself is **unchanged**
    (`iconoDeCategoria` already falls back to `Receipt` for an unrecognised name).
    *Requirement*: housekeeping (D-07's compile-error enumeration — this is one of the sites `tsc`
    flags when `domain/categoria.ts` is deleted in task 51).
    *Files*: `apps/web/src/lib/category-icons.test.ts` (modify).

- [x] 51. **GREEN** — Delete `src/domain/categoria.ts`, `categoria.test.ts`, and `categoria.mirror.spec.ts`.
    Run `pnpm web exec tsc --noEmit` (or the full `pnpm web typecheck`) and confirm it enumerates
    exactly the sites named in design D-07's table (all already handled by tasks 48–50) — **do not
    hunt for call sites by grep**, let the compiler enumerate them.
    *Requirement*: housekeeping — D-06 (the 8-template-name drift pin retires because its subject
    disappears), D-07.
    *Files*: `apps/web/src/domain/categoria.ts`, `categoria.test.ts`, `categoria.mirror.spec.ts`
    (removed).

- [x] 52. **GREEN** — Regression pass: run the full `web-app` spec's pre-existing `WCAT-02`/`WCAT-04`
    scenario suite (from US-013, unmodified beyond the deltas above) and confirm every scenario not
    touched by this PR is still green — the reviewer net design calls out explicitly for this, the
    only slice touching a shipped surface.
    *Requirement*: `WCAT-02`, `WCAT-04` (regression net).
    *Files*: none (verification against existing test files already covered by tasks 48–49).

- [x] 53. **GREEN** — Repeat the zero-API-diff check (final).

**Gates**: `pnpm web typecheck` · `pnpm web test` · `pnpm web lint` · task 52 · task 53. **PR body
requirement**: must link `specs/web-app/spec.md`'s `WCAT-02`/`WCAT-04` deltas and instruct the
reviewer to read them alongside the diff (non-negotiable #5).

### One downstream file surfaced by task 48, not in its own file list — recorded during apply, 2026-08-14

`BucketDetailList.test.tsx`'s own `WCAT-02` test asserted the retired canonical
order (`Supermercado` before `Farmacia`) — a **runtime test-assertion**
consequence of the ordering delta, not a compile error, so it doesn't appear
in design D-07's table (which only enumerates what `tsc` flags after deleting
`domain/categoria.ts`). Updated to the new alphabetical order (`Farmacia`
before `Supermercado`) alongside task 48, and its `mockFetchOnce` helper
(shared by every test in that file, since it renders one
`ReclasificarCategoriaControl` per row) gained URL-aware routing so
`GET /api/categorias` (introduced by task 49) resolves a minimal live catalog
instead of the caller's own `/api/detalle-bucket` fixture, which failed
`esCatalogoDto`'s guard and left the reclassify select disabled forever.
Neither file is in tasks 48/49's own `*Files*` line, but both are direct,
necessary consequences of implementing those tasks as specified — not scope
creep.

---

## Review Workload Forecast

Calibration applied per the proposal: size production code, multiply by ≥2.4 for the total: treat
any slice under 250 production lines with suspicion. US-042 comparison: `~4600` production+test
lines across 3 chained PRs, two needing `size:exception`. Estimates below are **diff line counts**
(additions; PR #6 also carries large deletions, called out separately).

| PR | Production (est.) | Test (est.) | Total | >400? | `size:exception`? |
|---|---:|---:|---:|---|---|
| **#1a** — shell | ~310 | ~460 | **~770** | Yes | Likely — restructuring a shipped route (US-042's own PR #1a precedent) |
| **#1b** — data layer, the wire (tasks 9-12) | ~365 | ~485 | **~850** | Yes | Likely — DTOs, constants, drift guard, the 7 calls + runtime guards + typed errors |
| **#1c** — data layer, cache + copy (tasks 13-15) | ~360 | ~505 | **~865** | Yes | Likely — query hook, both invalidation profiles incl. the exclusion, the 12-code message table |
| **#2** — list | ~315 | ~485 | **~800** | Yes | Likely |
| **#3a** — create | ~250 | ~340 | **~590** | Yes | Likely |
| **#3b** — identity edit + bucket confirm + delete-from-edit | ~630 | ~985 | **~1615** | Yes | Yes — deliberately isolated per design despite size: this is the single most dangerous operation in the change (non-negotiable #3), and splitting it further would separate the `PATCH` from its confirmation, which is prohibited |
| **#4** — patterns CRUD | ~370 | ~620 | **~990** | Yes | Likely |
| **#5** — 2nd delete entry point + tablet + 360 pass | ~30 | ~70 | **~100** | **No** | No — the only slice under budget; mostly wiring + a manual, non-code verification pass |
| **#6** — reclassify repair | ~90 add / ~235 delete | ~200 add / ~170 delete | **~695** (mixed) | Yes | Likely — but ~405 of the ~695 changed lines are pure deletion of already-superseded code (`domain/categoria.ts` + its two test files), not new logic to review; flag this in the PR description so the reviewer doesn't budget it as 695 lines of new logic |

**Total across all 9 PRs: ≈ 7275 changed lines** (the `#1b` split redistributes lines, it does not
add them). **Exactly one PR now exceeds 1000 lines — `#3b` — and it is unsplittable by design.** Production-only total ≈ 2720, ×2.4 ≈ 6528 —
consistent with the full total once test lines and PR #6's deletions are included, and larger than
US-042's ~4600 as the proposal's calibration predicted (seven endpoints vs. four, two screens vs.
one, two destructive confirmations, an invalidation matrix, a shipped-surface repair).

**Decision needed before apply**: Yes, per the proposal's Delivery Forecast — already resolved by
the orchestrator as `delivery_strategy: ask-on-risk`, `chain_strategy: feature-branch-chain`, both
cached for this session and reflected in every PR's chain-target instruction above.
