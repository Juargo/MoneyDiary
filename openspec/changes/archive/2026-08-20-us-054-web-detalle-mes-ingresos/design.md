# Design: US-054 — Web: página Detalle MES-INGRESOS + drill-down real desde la leyenda

> Scope: HOW at architecture level. Every path/symbol below read on `main` (2026-08-19, merge fd5840e8). Binding inputs: `proposal.md`, `specs/web-app/spec.md` (WDI-01..08; MODIFIED WG5-03/06/12), `specs/ingresos-detalle-mes/spec.md` (MID-01..06 — backend untouched). Format mirrors `archive/2026-08-19-us-053-web-detalle-mes-bucket/design.md`. 3 PRs, web-only.

## 1. Overview + Design Principles

The US-047 interim — an inert Ingresos legend row (`LeyendaGasto.tsx` `FilaIngreso` :170-186) — becomes a navigation target to the new `/ingresos?periodo=` page, fed by the shipped US-052 endpoint (`GET /api/ingresos/mes`, MID-01..06): breadcrumb + `PeriodoSelector` + "N ingresos" tag + positive total + "Sin meta ni semáforo" note + the app's FIRST semantic `<table>` (Fecha / Descripción / Origen / Monto). The row's trigger comment ("none exists today") is removed — the endpoint exists.

Principles: (1) router-agnostic page body, route stays thin/untested (us-049/053 precedent); (2) pure view-model owns labels only — payload passes through verbatim, no re-sort (WDI-06, ADR-024); (3) the flip mirrors US-053 D-06's threaded-callback shape via a NEW `onSelectIngresos` callback — never a bucket value (`/api/buckets/Ingresos/detalle` rejects Ingresos, MBD-07); (4) no invalidation-matrix change (no mutation co-mounts with `/ingresos` — YAGNI, D-07); (5) e2e fixtures evolve with the contracts they stub (LIFO discipline).

## 2. Decisions

| # | Decision | Alternatives | Choice + rationale |
|---|----------|--------------|--------------------|
| D-01 | `periodoActual()` | Re-home `periodoActualUTC` to `periodo.ts` (churns ~6 consumers incl. `PeriodoSelector`); inline `periodoActualUTC(new Date())` at call sites (duplicates the concept) | Thin zero-arg helper in `domain/periodo.ts` delegating to `periodo-anual.ts`'s `periodoActualUTC(new Date())` (spec-pinned location, WDI-01). The module-drift is resolved by re-scoping `periodo.ts`'s docblock to the normalizers — the file gains the thin now-helper and no longer claims "pure validation only" (shadowing footgun risk in §9). Deterministic core stays injected-`ahora` in `periodo-anual.ts`; `periodoActual()` is the production convenience. |
| D-02 | `aFechaCorta` format | `DD/MM/YYYY` (CL convention — but NEW display convention vs the 3 existing ISO sites + deleted `aFechaLabel`; TZ-unsafe if via `Date` round-trip: Chile UTC-4 shifts midnight-UTC days); keep slicing inline (4th duplication) | **ISO `YYYY-MM-DD`** — `aFechaCorta(fechaIso) = fechaIso.slice(0, 10)`, guarded upstream by the DTO guard's `esFechaValida` (same division of labor as the original `esFechaValida` docblock). Consistent with the app's other sliced date displays (PreviewMuestra:87, SubirCartola:333, ListaIngestas:114, mobile preview-cartola:46, deleted `aFechaLabel`) — with ONE acknowledged exception: the US-053 twin bucket page renders raw ISO timestamps (`GrupoMovimientos.tsx:69`; its view-model refused the positional slice), a display-consistency debt registered in the migration note below. TZ-safe (pure string surgery on the UTC date part, no `Date` math); DRY rule-of-3 extraction, 4th strike. Migration trigger (instead of vague "later"): the 3 legacy slice sites (PreviewMuestra:87, SubirCartola:333, ListaIngestas:114) refactor to `aFechaCorta` **on their next touch** (per-file trigger, byte-identical output, out of scope here); the bucket page's raw-ISO display is a separate follow-up display-consistency item (renders `aFechaCorta`, NOT byte-identical). |
| D-03 | "N ingresos" copy | Always-plural `N ingresos` (wrong for 1 — spec pins singular/plural per WCTG-03); `ingreso(s)` (bad a11y copy) | `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\`` as view-model `conteoLabel` (BucketDetalleMesPage:148 `movimiento/movimientos` ternary precedent). `0` → `0 ingresos` (plural — WDI-04 pins it). |
| D-04 | Semantic table | `aria-label` on `<table>` (weaker vehicle; caption is the correct table accname); list-based rows (GrupoMovimientos pattern — rejected: spec CA-02/WDI-02 pins a semantic table, first in app); `<th>` without scope (fails the pin) | New `IngresosMesTable.tsx` (spec WDI-07 names it — warranted): `<table>` + `<caption className="sr-only">Ingresos de {mes}</caption>` + `<thead>` with 4 × `<th scope="col">` + `<tbody>` rows keyed by `tx.id` (UUID, unique per month). Origen cell = `<Badge variant="secondary">` (repo tag primitive, ListaIngestas precedent) with bank verbatim or `Manual` (MID-02); Monto = `formatearMontoConSigno(monto, '+')` (BigInt-exact, MID-05); row order verbatim (MID-01 authoritative, WDI-02/3). Empty month renders `Empty` INSTEAD of the table (WDI-04 "no table rows render" — bucket-page pattern). |
| D-05 | WG5-06 flip mechanics | Reuse `onSelectBucket('Ingresos')` (rejected: a bucket value implies the bucket-detail contract the backend rejects, MBD-07); keep the row inert (regression vs WG5-06) | `LeyendaGasto` gains `onSelectIngresos: () => void`; `filaParaItem` dispatcher routes `'ingreso'` → `FilaIngreso` becomes a `<button>` — same shell as `FilaClickeable` minus the color dot (name left · amount right · `ChevronRight aria-hidden`, LOCKED focus-visible outline + px-2/py-1 target classes; `{' '}` accname separators). Threaded: `ResumenScreen` → `ResumenPage` → `routes/_authenticated/index.tsx` wires `navigate({ to: '/ingresos', search: { periodo } })` (current `periodo` from `Route.useSearch()`, D-06 mirror). Interim comment removed. Pie + `IngresoCard` untouched (CA-04). |
| D-06 | Client plumbing | Duplicate guards inline (parsing drift) | `packages/api-client/src/index.ts`: `IngresosMesDto = S['IngresosMesResponse']` + nested `TransaccionIngresosMesDto` (type-only, **no regen** — schema shipped with us-052, types.gen.ts:1962). Web re-export in `types.ts` (ADR-008). `client.ts`: `esIngresosMesDto` (matrix §6) + `fetchIngresosMes(periodo?)`; 400 → `{tag:'invalid', message:'El período no es válido.'}` (fetchResumen precedent — periodo is the only invalid input). Hook `useIngresosMes` (use-detalle-bucket-mes shape), queryKey `['ingresos-mes', periodo ?? 'actual']`. |
| D-07 | Invalidation matrix | Add `['ingresos-mes']` to `categorias-invalidacion.ts` + `use-ingesta.ts` + `use-eliminar-ingesta.ts` (defensive — dead lines + 6 test assertions churned) | **Non-change, deliberate**: no mutation co-mounts with `/ingresos` — reclassify runs on the bucket page, ingesta on dashboard routes; TanStack Router unmounts page trees on navigation and `staleTime` defaults to 0, so a fresh mount refetches. US-053's matrix change was required because reclassify happens ON the bucket page. Distinct queryKey keeps a future one-line matrix addition open. |
| D-08 | a11y lint gate | App-wide error (absorbs pre-existing debt — rejected, WCFG-12 precedent) | New US-054 scoped block: `src/components/IngresosMesPage.tsx`, `src/components/IngresosMesTable.tsx`, `src/routes/_authenticated/ingresos*.tsx` (route PATTERN precedent, WDI-07/WG5-12). `LeyendaGasto`/`ResumenScreen` already gated by the US-047 block — not re-listed (US-053 precedent: transport-only `ResumenPage` wasn't re-listed either). WG5-12 keyboard proof = native `<button>` semantics (Enter/Space); `ResumenScreen.test.tsx` T14 (:479-513) flips to include the Ingresos button in the focusable set (title + assertions, §5). |
| D-09 | vitest-axe (WDI-07) | Install `vitest-axe` (new dep in a security-quarantined repo, zero prior usage anywhere) | **Repo precedent**: a11y proof = scoped `eslint-jsx-a11y` error gate + role/scope/accname assertions in the jsdom suites (`getByRole('table')`, `th scope`, caption name) + Playwright T2 geometry. **RESOLVED by spec update**: WDI-07 was amended to read "`vitest-axe` is not a dependency" (repo precedent, no new dep) — no spec-text deviation remains, no orchestrator gate. |
| D-10 | Back control a11y floor (WDI-01) | Text-only `Link` (US-053 `BucketDetalleMesPage.tsx:113-119` shell — `text-sm`, no explicit target sizing → <24 CSS px tall); redundant `aria-label` on a plain-text link | Adopt the `FilaClickeable` LOCKED target classes (`px-2 py-1` + `focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800`, `LeyendaGasto.tsx:110` — the D-05 shell) on the back `Link to="/" search={{ periodo }}`; the visible text "Volver al resumen" IS the non-empty accessible name (WCTM-04) and `py-1` + `text-sm` line-height clears the 24×24 CSS px floor (WDI-01). Pinned by an `IngresosMesPage.test.tsx` assertion (ledger §5). |

## 3. Architecture at a glance

```
routes/_authenticated/index.tsx  navigate({to:'/ingresos', search:{periodo}})          [PR3]
   └─ ResumenPage ─ onSelectIngresos ─▶ ResumenScreen ─▶ LeyendaGasto (FilaIngreso button)
routes/_authenticated/ingresos.tsx  (validateSearch: normalizarPeriodo, useNavigate; owns useIngresosMes(periodo), passes query prop — buckets.$bucket.tsx precedent)  [PR2]
   └─ IngresosMesPage (query switch, header, note, table|Empty)      query={query}
        ├─ PeriodoSelector (undefined → current month, WPER semantics)
        ├─ IngresosMesTable (semantic table, Origen Badge, +montos, caption)
        └─ ingresos-mes-view-model (labels only: conteoLabel, totalLabel, aFechaCorta — passthrough)
   client.ts: fetchIngresosMes ─▶ GET /api/ingresos/mes?periodo=  ─▶ MID-01..06 (US-052, untouched)
```

## 4. File ledger per PR

| PR | File | Action | Description |
|----|------|--------|-------------|
| 1 | `packages/api-client/src/index.ts` | Modify | 2 type aliases (D-06). |
| 1 | `apps/web/src/api/types.ts` | Modify | Re-export + why-note. |
| 1 | `apps/web/src/api/client.ts` | Modify | `esIngresosMesDto` + `fetchIngresosMes` (D-06). |
| 1 | `apps/web/src/api/use-ingresos-mes.ts` | Create | Hook, queryKey pin (D-06). |
| 1 | `apps/web/src/domain/periodo.ts` | Modify | `periodoActual()` (D-01) — module docblock re-scoped to the normalizers (file gains the thin now-helper, no longer "pure validation only"). |
| 1 | `apps/web/src/domain/fecha.ts` | Modify | `aFechaCorta` (D-02). |
| 1 | `apps/web/src/domain/ingresos-mes-view-model.ts` | Create | Labels: `mesLabel`, `conteoLabel` (D-03), `totalLabel`, `filas[].fechaLabel` (D-02)/`montoLabel`; origen + order passthrough verbatim (WDI-06). |
| 1 | `apps/web/src/domain/fecha.ts` + `apps/web/src/api/client.ts` | Modify | Stale-docblock cleanup (US-053 debt): `aFechaLabel` references at `fecha.ts:4` and `client.ts:457,462` reworded (the label was deleted in US-053; docblocks now describe the `aFechaCorta`/slice contract). |
| 2 | `apps/web/src/components/IngresosMesTable.tsx` | Create | Semantic table (D-04). |
| 2 | `apps/web/src/components/IngresosMesPage.tsx` | Create | Router-agnostic (receives `query` prop from the route): query switch, breadcrumb `nav aria-label="Ruta"` + back `Link to="/" search={{ periodo }}` "Volver al resumen" (D-09 US-053 precedent, NOT BotonVolver) carrying the D-10 LOCKED target classes (24×24 floor + accname, WDI-01), `h1 Ingresos`, PeriodoSelector, `{conteoLabel} · {totalLabel}` line, static note, `Empty` `Sin ingresos en {mes}` | table. NO catalog prefetch (WDI-06, simpler than BucketDetalleMesPage). |
| 2 | `apps/web/src/routes/_authenticated/ingresos.tsx` | Create | Thin route: `validateSearch` via `normalizarPeriodo`; owns `useIngresosMes(periodo)` and passes `query` to the page (buckets.$bucket.tsx precedent, §3); `onPeriodoChange` functional updater `search: (prev) => ({...prev, periodo})` (WDI-03, US-053 D-04). |
| 2 | `apps/web/eslint.config.js` | Modify | US-054 block (D-08). |
| 3 | `apps/web/src/components/LeyendaGasto.tsx` | Modify | `FilaIngreso` → button, `onSelectIngresos`, comment removal (D-05). |
| 3 | `apps/web/src/components/ResumenScreen.tsx` | Modify | Thread `onSelectIngresos` (no destacar logic — bucket-less). |
| 3 | `apps/web/src/components/ResumenPage.tsx` | Modify | Thread `onSelectIngresos`. |
| 3 | `apps/web/src/routes/_authenticated/index.tsx` | Modify | navigate wiring to `/ingresos` (D-05). |
| 3 | `apps/web/e2e/fixtures/api-stubs.ts` | Modify | `INGRESOS_MES_FIXTURE` (literal `IngresosMesDto`: 3 rows — BCI + Manual + a 2nd bank; handler echoes `?periodo=` and zeroes for a pinned empty month, e.g. `2026-05`) + `**/api/ingresos/mes*` route **registered after** the `**/api/resumen*` block (distinct prefix — no LIFO collision; ordering comment per WDI-08). |
| 3 | `apps/web/e2e/ingresos-mes.e2e.ts` | Create | 5 cases (§5). |

## 5. Test ledger (RED-first)

| Suite | Action | Cases | Notes |
|-------|--------|-------|-------|
| `client.test.ts` (116) | Modify | +13 | fetchIngresosMes: 200 ok; 400 invalid; 401; 5xx; network; non-JSON; `total` malformed; `monto` `"12.5"` → parse (money guard); `fecha` malformed; `origen` non-string → `{tag:'parse'}` (guard shape-reject, §6); `conteo` non-number; `transacciones` non-array; URL with/without periodo. |
| `use-ingresos-mes.test.tsx` | Create | 3 | URL with/without periodo; ApiError surfaces (use-detalle-bucket-mes shape). |
| `domain/periodo.test.ts` | Modify | +2 | `periodoActual()` = current UTC month (`vi.setSystemTime`); equals `periodoActualUTC(now)`. |
| `domain/fecha.test.ts` | Modify | +3 | `aFechaCorta` slices ISO; short input passthrough; non-ISO passthrough (defensive fallback, periodo-anual discipline). |
| `domain/ingresos-mes-view-model.test.ts` | Create | 10 | mesLabel from periodo; default = current month (setSystemTime); conteoLabel 1/2/0 (D-03); totalLabel `+`; montoLabel `+`; fechaLabel; origen verbatim BCI/Manual; row order verbatim (day-3 then day-15); empty month zeros; no re-sort. |
| `IngresosMesPage.test.tsx` | Create | 15 | loading (WDI-05); error + retry renders (WDI-05); retry refetches on activation (WDI-05); empty month: `$0`, `0 ingresos`, `Sin ingresos en julio 2026`, NO table (WDI-04); empty month keeps PeriodoSelector navigation operable (WDI-04); header all elements + note (WDI-01); deep link honours `?periodo=` (WDI-03); absent periodo → current month (WDI-03/MID-04); back link preserves periodo (WDI-01); back control ≥24×24 CSS px + non-empty accname (WDI-01, D-10); onPeriodoChange updates URL (WDI-03); one `h1` (WDI-01); only interactive controls = period nav/back/retry (WDI-06); table renders (WDI-02); table rows show Origen Badge (BCI/Manual) + `+`-montos in payload order, no re-sort (WDI-02/MID-01). |
| `IngresosMesTable.test.tsx` | Create | 7 | `table` role; `th scope="col"` ×4; caption accname; rows verbatim; Origen Badge BCI + Manual; `+`-monto; a11y assertions (D-09 form). |
| `LeyendaGasto.test.tsx` (13, post-US-053) | Modify | 1 rewritten | :77-86: Ingresos row IS a button, still no `%`, activation calls `onSelectIngresos`. |
| `ResumenScreen.test.tsx` (14, post-US-053) | Modify | 1 updated | :479-513 T14: Ingresos added to `controlesEsperados` (focusable); "never focusable" assertions at :496-503 removed (WG5-12) — the test TITLE is rewritten too, not just the assertions. |
| `ResumenPage.test.tsx` | Modify | +1 | `onSelectIngresos` threaded to ResumenScreen. |
| `e2e/ingresos-mes.e2e.ts` | Create | 5 | 1) deep link `?periodo=2026-07` header + table + Origen tags (escritorio); 2) prev arrow → URL `2026-06`, stays on `/ingresos`, refetches (escritorio, WDI-03); 3) empty month `2026-05` → `$0`, `0 ingresos`, Empty copy, arrows operable (escritorio, WDI-04); 4) legend row → `/ingresos?periodo=2026-07` (escritorio, CA-04); 5) tablet T2 header + table geometry (tablet 880px, rendered boxes — never className). |

Gate: additive rule — suites not listed stay byte-unchanged; `tsc` clean per PR.

## 6. Contracts

`esIngresosMesDto`: `conteo: number` · `total: string`+`esMontoStringValido` · `transacciones: array` → per tx: `id: string`, `fecha: string`+`esFechaValida`, `descripcion: string`, `origen: string` (bank verbatim | `'Manual'` — any non-empty string passes, MID-02), `monto: string`+`esMontoStringValido` (WG5-05 lesson). Fail-closed: any shape mismatch → `{tag:'parse'}`; 400 → `{tag:'invalid'}`.

`useIngresosMes(periodo?)` → `useQuery({ queryKey: ['ingresos-mes', periodo ?? 'actual'], ... })` — mirrors `useDetalleBucketMes`.

View-model: `aIngresosMesViewModel(dto, periodo)` → `{ mesLabel: mesCompletoLabel(periodo ?? periodoActual()), conteoLabel, totalLabel, filas: [{id, fechaLabel, descripcion, origen, montoLabel}] }` — labels/formatting only, `dto.transacciones` order verbatim (WDI-06).

## 7. Review Workload Forecast

- **Estimated changed lines**: ~1,400 across 3 PRs (PR1 ~450, PR2 ~500, PR3 ~400 incl. e2e).
- **Chained-PR**: Yes (3 sequential).
- **Budget risk**: PR1 (~450) and PR2 (~500) both exceed the 400-line budget — acknowledged: both ship additive-only (new client functions + new files behind the new route; no deletions), the same rationale as PR3's ~400; PR2 additionally carries the page + table + 22-case suites. Mitigation: page-only, no deletions. If the orchestrator wants every slice ≤400, the 4-PR fallback re-balances to match the ledger — PR1 splits into `plumbing (api-client aliases/types/guard/fetch/hook)` / `domain helpers (periodo/fecha + view-model + docblock cleanups)`, PR2 into `table` / `page+route` (the view-model stays in PR1).
- **Decisions**: D-01..D-10 pinned per spec/proposal — none pending; D-09 was resolved by the WDI-07 spec update (repo precedent), so no orchestrator sign-off gate remains.

## 8. Rollback / Compatibility

Type-only api-client aliases + new client functions (PR1) are additive. PR2 ships behind the new `/ingresos` route — no existing surface changes, independently revertible. PR3's flip is the only dashboard-touching step — revert restores the inert row + interim comment (git; spec delta reconciles WG5-03/06/12). Backend untouched in all PRs (endpoint stays deployed, harmless).

## 9. Risks

- **`periodoActual()` shadowing (D-01)**: `PeriodoSelector.tsx:43` declares a LOCAL `const periodoActual = periodoActualUTC(ahora)` — a module-level `periodoActual()` import in the same file would shadow/confuse; the selector's local is renamed (or the import aliased) when US-054 lands.
- **WG5-12 churn**: the T14 composed-screen test flips "Ingresos never focusable" → focusable — deliberate, spec-pinned.
- **LIFO**: `**/api/ingresos/mes*` prefix is distinct from `**/api/resumen*` (no collision — `*` doesn't cross `/`), but the stub still registers after broader dashboard stubs with the ordering comment (WDI-08).
- **First semantic table**: the app's first `<table>` — lint gate (D-08) + role/scope assertions + Playwright T2 geometry are the binding proofs; TZ-safety of `aFechaCorta` documented (D-02).