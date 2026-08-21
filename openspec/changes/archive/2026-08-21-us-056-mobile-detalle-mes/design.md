# Design: US-056 — Mobile: páginas de detalle MES con paridad

Issue [#290](https://github.com/Juargo/MoneyDiary/issues/290) — final US of Sprint-14. This design is the HOW (architecture) for the proposal's PINNED decisions D-01..D-09. It resolves everything the proposal left open as numbered decisions **D-10..D-22**, then pins the §4 file ledger (verified against disk), §5 test ledger, and §7 PR/commit order.

Client-only change (`apps/mobile`). No backend, contract, or migration edit (proposal Out of scope). All three endpoints and their DTOs are shipped and already aliased in `@moneydiary/api-client` (`packages/api-client/src/index.ts:40-61` — `DetalleBucketMesDto`, `IngresosMesDto`, `ReclasificarCategoriaDto` + the nested group/tx row aliases). Verified on disk this session.

> **Endpoint-path correction carried into D-15/A7:** the proposal §Why-now names `/api/detalle/bucket/:bucket` and `/api/ingresos`. The DEPLOYED contract paths are `GET /api/buckets/{bucket}/detalle` and `GET /api/ingresos/mes` (`packages/api-client/src/types.gen.ts:487/949`), reclassify `PATCH /api/transacciones/{id}/categoria` (`:1708`). This design pins the contract paths.

## §0 — Context anchors (verified on disk)

Mobile precedents this design ports/reuses (file:line, read this session):

- **Per-screen state machine + own fetch**: `apps/mobile/app/index.tsx:32-65` (the `Estado` discriminated union `loading|error|data`, `cargar()` on mount + on `periodo` change) and `apps/mobile/app/categoria/[id].tsx:16-62` (route-level 4-phase machine, `useLocalSearchParams`, `router.back()`, fetch-on-mount with the "route unmounts on nav away, no `useFocusEffect`" comment at :55-58).
- **Route registration**: `apps/mobile/app/_layout.tsx:41-52` — `<Stack.Protected guard={authenticated}>` block listing `index`/`subir`/`configuracion`/`categoria/[id]`.
- **Never-throw GET fetcher skeleton**: `apps/mobile/src/api/client.ts:177-214` (`fetchResumen`) and `apps/mobile/src/api/categorias.ts:96-130` (`fetchCatalogo` — the exact skeleton the two new fetchers copy: `API_BASE_URL` guard → `network`; `try/catch fetch` → `network`; `401` → `unauthorized`; `!res.ok` → `http`; `res.json()` try → `parse`; shape-guard → `parse`).
- **Write transport**: `apps/mobile/src/api/mutacion.ts:50-85` (`enviarMutacion(url, method, body?)` → `ApiResult<Response>`, never-throw; `errorConCodigo` extracts `{code}` for the `http` tag at :25-38).
- **Dashboard refresh pub/sub**: `apps/mobile/src/api/resumen-refresh.ts:22-35` (`solicitarRecargaResumen()` fires every registered `cargar`; `registrarRecargaResumen` returns an unregister fn — `index.tsx:73-75` subscribes).
- **Alert.alert guard (the us-044 case law)**: `apps/mobile/src/components/configuracion/EditarCategoria.tsx:96` (`mostrandoAlerta = useRef(false)`), :133-171 (set `true` before `Alert.alert`, cleared in EVERY `onPress`, `{ cancelable: false }` with the "Android backdrop dismiss fires no callback → dead buttons" comment at :146-148/:246-249).
- **Legend rows (to be made pressable)**: `apps/mobile/src/components/LeyendaGasto.tsx:18-112` — `FilaLeyenda` dispatches on `item.kind` (`'gasto'|'sinCategoria'|'ingreso'`); every row already carries `testID="leyenda-fila"` (NOT unique — see D-10). `ResumenScreen.tsx:47-50` renders `<LeyendaGasto principales complemento>`.
- **Money-safe formatters**: `apps/mobile/src/domain/formatear-monto.ts:36-75` (`formatearMontoCLP`, `formatearMontoConSigno`, `esMontoStringValido`) — throw on malformed; never `Number()`/`parseFloat`.
- **Period helpers already on mobile**: `apps/mobile/src/domain/periodo-anual.ts:45-80` (`mesAbreviado`, `mesCompletoLabel`, `anioDePeriodo`, `periodoActualUTC`). **Missing on mobile**: `mesAnterior`, `mesSiguiente`, `esMesActual` (present on web at `apps/web/src/domain/periodo-anual.ts:128-162` — to be ported, D-13).
- **Grouping helper already on mobile**: `apps/mobile/src/domain/agrupar-categorias-por-bucket.ts:31-46` (`agruparPorBucket`, `Otros` fallback) — reused verbatim by the reclassify picker (D-16).
- **Bucket labels**: `apps/mobile/src/theme/colors.ts:57-62` (`ETIQUETA_BUCKET`: `Deseos→'Gustos'`, `SinCategoria→'Sin categoría'`) and `:46-51` (`COLOR_BUCKET`).
- **Assignable buckets**: `apps/mobile/src/domain/catalogo-constantes.ts:17` (`BUCKETS_ASIGNABLES = ['Necesidades','Deseos','Ahorro']`).

Web references being ported (file:line):

- `apps/web/src/domain/detalle-bucket-mes-view-model.ts:95-112` (`aDetalleBucketMesViewModel`) + its VM interfaces :9-47 and `clampBp` :49-52.
- `apps/web/src/domain/ingresos-mes-view-model.ts:50-60` (`aIngresosMesViewModel`) + interfaces :7-27.
- `apps/web/src/domain/fecha.ts:34-36` (`aFechaCorta` — `.slice(0,10)`, TZ-safe) — to be ported as its own mobile helper (D-14).
- `apps/web/src/domain/porcentaje.ts:12-25` (`SIN_PORCENTAJE_LABEL`, `aPorcentajeLabel`) — mobile already has both privately inside `resumen-view-model.ts:19/96`; D-14 promotes them to a shared module.
- `apps/web/src/components/BucketDetalleMesPage.tsx:54-207` (header shape, groups map keyed by `periodo-categoriaId`, page-owned `anuncio` region :77-113, `alMovida` at :84-85).
- `apps/web/src/components/GrupoMovimientos.tsx:23-108` (`FILAS_VISIBLES_POR_DEFECTO = 3`, `slice(0,3)`, "ver N más…"/"Ver menos" toggle :95-104, `destacar` highlight :49-59).
- `apps/web/src/components/ReclasificarCategoriaControl.tsx:69-292` (the `<select>`+`<optgroup>` cascade → RN `Modal`; `commit(nombre, onSuccess)` with settled `onMovida` at :127-141/:174-186 — the settled-announcement precedent).
- `apps/web/src/components/IngresosMesPage.tsx:26-84` (M2 header + static note copy :68-71) and `IngresosMesTable.tsx:18-64` (4-col rows, Origen `<Badge>`).
- `apps/web/src/components/PeriodoSelector.tsx:33-105` (arrow semantics: `mesAnterior` always enabled, `mesSiguiente`/`Hoy` disabled when `esMesActual`).
- `apps/web/src/api/use-reclasificar-categoria.ts:43-71` (the 4-key invalidation set: `['resumen',clave]`, `['detalle-bucket-mes',bucket,clave]`, `['resumen-anual']`, `['ingresos-mes']` — the D-06 refresh-contract source of truth).

---

## §1 — Numbered decisions (D-10..D-22)

### D-10 — Legend navigation wiring: rows become `Pressable` with route-level `router.push`, unique per-row `testID`, `periodo` threaded as a prop. NO optional callback.

**Decision.** Reverse `LeyendaGasto`'s US-050 binding-decision 2 (the inert-`View` docstring at `LeyendaGasto.tsx:6-16`) **for this US only**. Each `FilaLeyenda` becomes a `Pressable` (`accessibilityRole="button"`, Spanish `accessibilityLabel`, unique `testID`) that navigates via `router.push`. The target is computed from `item.kind`/`item.bucket`:

| Row (`item.kind` / `item.bucket`) | Pushed path | testID |
|---|---|---|
| `'gasto'` bucket = `Necesidades`/`Deseos`/`Ahorro` | `/bucket/${item.bucket}?periodo=${periodo}` | `leyenda-fila-${item.bucket}` |
| `'sinCategoria'` (`item.bucket` = `SinCategoria`) | `/bucket/SinCategoria?destacar=sin-categoria&periodo=${periodo}` | `leyenda-fila-SinCategoria` |
| `'ingreso'` | `/ingresos?periodo=${periodo}` | `leyenda-fila-ingreso` |

`periodo` is passed **as a query param only when defined** (`periodo` may be `undefined` = "backend resolves current month", per `index.tsx:42`); when `undefined` the param is omitted and the detail screen resolves the same `undefined→current` default itself (D-12). The path is a template literal built with `periodo` interpolated via `encodeURIComponent`, mirroring `client.ts:185`'s query construction.

**Wiring the `periodo` down (the us-044 PR7 case law).** `LeyendaGasto` gets a new REQUIRED prop `periodo: string | undefined` and a REQUIRED prop `onNavegar: (path: string) => void`. **No optional callback with a silent no-op default** — the us-044 PR7 gate rejected `onCatalogoChange?` defaulting to `() => undefined` in production paths (`EditarCategoria.tsx:65/292` accepts it ONLY because tests that don't exercise pattern mutations omit it; the route ALWAYS passes it). Here navigation is the whole feature, so the callback is non-optional and its absence is a `tsc` error, not a runtime dead-end.

Thread order (verified against `ResumenScreen.tsx` → `index.tsx`):
1. `app/index.tsx` already holds `periodo` state (`:42`) and derives `periodoVista` (`:107`). It renders `<ResumenScreen viewModel={…} />` inside `renderEstado` (`:162`).
2. `ResumenScreen` (`ResumenScreen.tsx:23`) gains two props `periodo` + `onNavegar` and forwards them to `<LeyendaGasto periodo onNavegar … />` (`:47`). `index.tsx` passes `periodo={periodoVista}` (the RESOLVED month the dashboard shows, so a tap opens the same month — proposal R7) and `onNavegar={(path) => router.push(path)}` (`useRouter()` already imported at `index.tsx:4/39`).
3. `LeyendaGasto` builds each row's path and calls `onNavegar(path)` in `Pressable.onPress`.

The path is built in `LeyendaGasto` (the component that owns `item.kind`/`item.bucket`), `router.push` is invoked at the route (`index.tsx`), keeping the navigation contract testable at both layers: `LeyendaGasto` tests assert `onNavegar` was called with the exact path string; `index.tsx` (or a thin integration test) asserts `router.push` receives it.

**Back behavior.** Native stack back (Expo Router `Stack`) returns to the dashboard automatically — no `router.replace`, matching `categoria/[id].tsx:70`'s `router.back()` idiom. Detail screens also render an on-screen «‹ Volver al resumen» `Pressable` (D-12) because `_layout.tsx` hides the native header (`:41` `headerShown: false`).

*Why.* The proposal's D-01 pins the legend row (not the donut `Path`) as the nav target; per-slice hit-testing on RN SVG is unreliable/unlabelable. Unique `testID` per row is the us-044 repeated-component idiom (today all rows share `testID="leyenda-fila"` at `LeyendaGasto.tsx:55/77/97` — RNTL `getByTestId` would throw on duplicates once we need to tap a SPECIFIC row). *Rejected:* per-`Path` `onPress` (D-01); a single shared `testID` (breaks per-row `getByTestId`); `onNavegar?` optional (us-044 PR7 dropped-callback class).

### D-11 — Legend still renders `LeyendaGasto`, not a forked "interactive legend". `Punto`/label/amount inner layout unchanged; only the row wrapper changes `View`→`Pressable`.

**Decision.** Modify `FilaLeyenda` in place. The three `return`s (`ingreso` :52, `sinCategoria` :75, `gasto` :95) swap their root `<View testID="leyenda-fila" …>` for `<Pressable testID={derivado} accessibilityRole="button" accessibilityLabel={…} onPress={() => onNavegar(path)} …>`. The `sinCategoria` row's existing `accessibilityLabel` spell-out (`:71-74`) is preserved and reused as the button's accessible name (it already reads "Sin categoría · N transacciones sin categorizar · $X"). The `gasto` and `ingreso` rows gain an explicit `accessibilityLabel` (e.g. `Ver detalle de Necesidades`, `Ver detalle de ingresos`) since their visible text alone ("Necesidades", "Ingresos") is a weaker button name.

*Why.* `dry` — three docstrings/Maestro anchors reference `LeyendaGasto`/`ResumenScreen` by name (`ResumenScreen.tsx:8-21`); forking would orphan them. The row's internal composition (dot + label + %/amount) is unchanged presentation. *Rejected:* a new `LeyendaNavegable` wrapper (duplicates the `item.kind` dispatch for no gain).

### D-12 — Both detail routes: route-level 4-phase state machine (`loading|error|empty|data`), own fetch, `useLocalSearchParams`, on-screen back. Mirrors `categoria/[id].tsx`.

**Decision.** `app/bucket/[bucket].tsx` and `app/ingresos.tsx` are thin route wrappers that:
- Read params via `useLocalSearchParams<{ bucket?: string; destacar?: string; periodo?: string }>()` (M1) / `<{ periodo?: string }>()` (M2). `bucket` and `destacar`/`periodo` are plain `string | undefined` (D-15 read discipline — server is the authority).
- Own `periodo` as `useState<string | undefined>(paramPeriodo)` seeded from the query param (so arrows can step it, D-13). `undefined` → the fetcher omits the query param and the backend resolves current month (`fetchResumen` precedent `client.ts:185`).
- Run the discriminated-union machine exactly like `index.tsx:32-35`:
  - M1: `{ fase:'loading' } | { fase:'error'; error:ApiError } | { fase:'data'; dto: DetalleBucketMesDto }`. `empty` is a **data outcome** decided after success (`viewModel.grupos.length === 0`), NOT a fifth tag — same as `index.tsx:159` deciding `sinIngreso` after `data`. Mirrors web `BucketDetalleMesPage.tsx:182` (`grupos.length === 0` → `<Empty>`).
  - M2: same three tags with `IngresosMesDto`; empty = `viewModel.filas.length === 0` (web `IngresosMesPage.tsx:74`).
- `cargar` is a `useCallback([periodo])` that sets `loading` then calls the fetcher; a `useEffect([cargar])` fires it on mount and whenever `periodo` changes (verbatim `index.tsx:45-65` shape, including the `eslint-disable-next-line react-hooks/set-state-in-effect` at :63).
- **Refetch mechanism**: `cargar` itself is the refetch. It re-runs on (a) mount, (b) `periodo` change (arrow tap, D-13), and (c) M1 reclassify success (D-17 calls `cargar` directly via a passed `onReclasificado`). **No `useFocusEffect` for the initial load** (route unmounts on nav-away, `categoria/[id].tsx:55-58` reasoning). See D-18 for the ONE `useFocusEffect` (M2 stale-guard).
- On-screen back: a `Pressable` «‹ Volver al resumen» (`accessibilityRole="button"`, `accessibilityLabel="Volver al resumen"`, `onPress={router.back}`), mirroring `categoria/[id].tsx:76-85`.

**Route registration.** `_layout.tsx`'s authenticated block (`:42-47`) gains two `<Stack.Screen>` entries: `name="bucket/[bucket]"` and `name="ingresos"`. This is the ONLY `_layout.tsx` edit.

*Why.* Mobile has no TanStack Query (D-03); the per-screen machine is the established idiom (2 precedents). `empty`-as-data-outcome avoids a spurious 4th tag and matches web. *Rejected:* TanStack Query (D-03, `yagni`); a shared `useDetalle` hook abstraction (2 screens, `yagni` — copy the 30-line machine).

### D-13 — `SelectorPeriodoMes`: `{ periodo, onChange }`, `‹ mesLabel ›`, prev always enabled, next/no "Hoy" button, next disabled at current month. Ports web's `mesAnterior/mesSiguiente/esMesActual`.

**Decision.** New component `apps/mobile/src/components/SelectorPeriodoMes.tsx` (~70 LOC). Props verbatim from web's `PeriodoSelector` (`PeriodoSelector.tsx:33-39`): `{ periodo: string | undefined; onChange: (periodo: string) => void }`. Layout: a `‹` arrow `Pressable`, the `mesCompletoLabel(efectivo)` `Text` (NOT a pressable — mobile has no month/year popover, D-13 rejects it), a `›` arrow `Pressable`.

Arrow semantics (mirror web `PeriodoSelector.tsx:40-92`):
- `efectivo = periodo ?? periodoActualUTC(new Date())` (`:41`).
- Prev (`‹`): `onChange(mesAnterior(efectivo))` — **always enabled** (any past month reachable, web `:55` has no `disabled`).
- Next (`›`): `onChange(mesSiguiente(efectivo))`, **`disabled={esMesActual(efectivo, ahora)}`** — the user CANNOT go into the future (web `:88` `disabled={enMesActual}`).
- **No "Hoy" button** (`yagni` — web's `:94-103` "Hoy" shortcut is a nice-to-have; mobile's next-disabled-at-current already bounds the range, and the dashboard is one back-tap away). Documented as a deliberate scope trim vs web.

a11y: `accessibilityRole="button"` on both arrows; `accessibilityLabel="Mes anterior"` / `"Mes siguiente"` (web `:53/:87`); the disabled next arrow carries `accessibilityState={{ disabled: true }}` (RN a11y idiom, `EditarCategoria.tsx:300` precedent) and `disabled` so touch is inert. The label `Text` gets `accessibilityRole="header"` so the screen reader announces the current month as a heading (the label is not interactive).

**Port `mesAnterior`/`mesSiguiente`/`esMesActual` into mobile's `periodo-anual.ts`** (D-14): mobile's file (`apps/mobile/src/domain/periodo-anual.ts`) currently stops at `periodoActualUTC` (:76-80) — the web file (`apps/web/src/domain/periodo-anual.ts:128-162`) has the three missing helpers plus the private `partesDePeriodo`/`formatearPeriodo` (:85-97). Port them verbatim. **When M7 lands, the mobile `periodo-anual.ts` file docstring or any "out of scope for mobile" / "mobile uses only X helpers" comment MUST be updated** to reflect that `mesAnterior`, `mesSiguiente`, and `esMesActual` are now also available and in use on mobile — a comment claiming these helpers are web-only or out-of-scope for mobile becomes false and violates the truthful-comments rule.

Reuse: `SelectorPeriodoMes` is consumed by BOTH M1 (`bucket/[bucket].tsx`) and M2 (`ingresos.tsx`) headers — one component, two call sites (`dry`, proposal D-02).

*Why.* Web parity on arrow rules (no-future is a hard product rule mirrored from `PeriodoSelector.tsx:88`); pure integer month math is TZ-safe (`periodo-anual.ts:122-137` comment). *Rejected:* a native month picker / popover (no RN parity, `yagni` for ±1 stepping); porting the "Hoy" button (deliberate trim).

### D-14 — Shared pure helpers: port `aFechaCorta` to mobile; promote `SIN_PORCENTAJE_LABEL`/`aPorcentajeLabel` out of `resumen-view-model.ts` into a `porcentaje.ts` module.

**Decision.**
- **`aFechaCorta`**: new `apps/mobile/src/domain/fecha-corta.ts` — verbatim port of `apps/web/src/domain/fecha.ts:34-36` (`fechaIso.slice(0, 10)`). Mobile does NOT port `esFechaValida` (web uses it as a money-safety guard upstream `fecha.ts:13`; mobile's ingresos fetcher shape-guard covers the same ground per D-15 — a malformed `fecha` still slices to garbage but never crashes, acceptable for a read-only display field; the money fields are the guarded ones).
- **`porcentaje.ts`**: mobile ALREADY has `SIN_PORCENTAJE_LABEL` (exported, `resumen-view-model.ts:19`) and a PRIVATE `aPorcentajeLabel` (`:96`). The M1 header (D-04's `porcentajeLabel`/`metaLabel`) needs `aPorcentajeLabel` too. Extract both into `apps/mobile/src/domain/porcentaje.ts` (mirroring web's `apps/web/src/domain/porcentaje.ts`), have `resumen-view-model.ts` re-export `SIN_PORCENTAJE_LABEL` and import `aPorcentajeLabel` from it (zero call-site churn — same move web made per `porcentaje.ts:5-11`).

*Why.* The two ported view-models (D-04) depend on `aFechaCorta` and `aPorcentajeLabel`; DRY says extract before the second consumer. *Rejected:* inlining `.slice(0,10)` in the ingresos VM (4th occurrence — web's `fecha.ts:34` "regla de 3" already fired; a named helper pins it for the label test).

### D-15 — Two new fetchers copy `fetchCatalogo`'s never-throw skeleton; shape guards keep `bucket`/`origen` as plain `string`; money fields validated with `esMontoStringValido`.

**⚠️ Endpoint-path correction (verified against `packages/api-client/src/types.gen.ts:487/949/1708`).** The proposal §Why-now names the paths `/api/detalle/bucket/:bucket` and `/api/ingresos`. **Those are WRONG.** The DEPLOYED operation paths in the OpenAPI contract are `GET /api/buckets/{bucket}/detalle` (`types.gen.ts:487-530`, `periodo?` query, path `bucket`) and `GET /api/ingresos/mes` (`:949`). Reclassify is `PATCH /api/transacciones/{id}/categoria` (`:1708`). This design pins the CONTRACT paths, not the proposal's mistaken ones. (Web already consumes these exact paths — `apps/web` `use-detalle-bucket-mes`/`use-ingresos-mes`.)

**Decision.** Add to `apps/mobile/src/api/client.ts` (the GET-fetcher home, alongside `fetchResumen`):
- `fetchDetalleBucketMes(bucket: string, periodo?: string): Promise<ApiResult<DetalleBucketMesDto>>` — URL `${API_BASE_URL}/api/buckets/${encodeURIComponent(bucket)}/detalle${periodo ? '?periodo='+encodeURIComponent(periodo) : ''}` (`bucket` a path segment, `periodo` a query param — contract `types.gen.ts:500-508`). Skeleton verbatim from `fetchResumen` (`client.ts:177-214`): `API_BASE_URL` guard → `network`; `try/catch` → `network`; `401` → `unauthorized`; `!res.ok` → `http`; `res.json()` catch → `parse`; `!esDetalleBucketMesDto(body)` → `parse`.
- `fetchIngresosMes(periodo?: string): Promise<ApiResult<IngresosMesDto>>` — URL `${API_BASE_URL}/api/ingresos/mes${periodo ? '?periodo='+encodeURIComponent(periodo) : ''}`. Same skeleton.

**Shape guards** (new, in `client.ts`, following the `esResumenMesDto`/`esBucketResumenDto` two-level pattern `client.ts:47-78`):
- `esDetalleBucketMesDto`: object non-null; `typeof bucket === 'string'` (**plain string** — server is authority, an unrecognized bucket must render not fail, `catalogo-constantes` D-07 discipline `categorias.ts:44-51`); `periodo` string; `total` string **AND `esMontoStringValido(total)`** (money-safety, the `client.ts:52-54` idiom — `formatearMontoCLP` throws on malformed and there's no ErrorBoundary, `client.ts:57-66`); `metaBp`/`porcentajeBp` are `number | null`; `totalCategorias`/`totalTransacciones` numbers; `grupos` array where each element passes `esGrupoDetalleDto` (`categoriaId: string | null`, `nombre` string, `conteo` number, `subtotal` string + `esMontoStringValido`, `transacciones` array each with `id`/`descripcion`/`fecha` string + `monto` string + `esMontoStringValido`).
- `esIngresosMesDto`: `conteo` number; `total` string + `esMontoStringValido`; `transacciones` array each `{id, descripcion, fecha, origen}` strings + `monto` string + `esMontoStringValido`. `origen` stays **plain string** (bank name verbatim, api-client `types.gen.ts:1974`).

Field shapes verified against `packages/api-client/src/types.gen.ts:1839-1871` (`BucketDetalleMesResponse`) and `:1962-1976` (`IngresosMesResponse`).

*Why.* Never-throw `ApiResult<T>` is the MOB-02 contract; the money guards are load-bearing (a malformed 2xx `monto` would crash `formatearMontoCLP` on render). `bucket`/`origen` as plain string mirrors the ADR-024/037 "server is authority" discipline already pinned in `categorias.ts:44-51`. *Rejected:* validating `bucket` against `BUCKETS_ASIGNABLES` (would reject `SinCategoria` and any server-unknown bucket — D-07 anti-pattern); a shared generic guard factory (`yagni`).

### D-16 — Reclassify wrapper `reclasificarCategoria` over `enviarMutacion`; picker sources categorías via `fetchCatalogo` + `agruparPorBucket` filtered to `BUCKETS_ASIGNABLES`.

**Decision.** Add `reclasificarCategoria(transaccionId: string, categoria: string): Promise<ApiResult<ReclasificarCategoriaDto>>` to `apps/mobile/src/api/categorias.ts` (next to the existing mutations). Body sends ONLY `{ categoria }` (never a bucket — the backend derives the destination bucket, web `client.ts:752-753`/`use-reclasificar-categoria` precedent). It wraps `enviarMutacion` then reads+guards the response body:

```
const r = await enviarMutacion(`/api/transacciones/${encodeURIComponent(transaccionId)}/categoria`, 'PATCH', { categoria });
if (!r.ok) return r;
// enviarMutacion returns the raw Response (mutacion.ts:84); reclassify NEEDS the body
// (bucket + categoria echo) to drive the cross-bucket announcement, so read+guard it here.
let body: unknown; try { body = await r.value.json(); } catch { return { ok:false, error:{tag:'parse'} }; }
if (!esReclasificarDto(body)) return { ok:false, error:{tag:'parse'} };
return { ok:true, value: body };
```

This is the one mutation whose success body IS read (contrast `categorias.ts:22-24` "success bodies DISCARDED" — those don't need the echo; this one does, for the destination bucket label). `esReclasificarDto` guards `{ id:string, bucket:string, categoria:{id:string, nombre:string} }` (api-client `types.gen.ts:2121-2129`).

**Picker data source.** The `Modal` body sources categorías from `fetchCatalogo` (`categorias.ts:96` — already exists), grouped with `agruparPorBucket` (`agrupar-categorias-por-bucket.ts:31` — already exists), then **filtered to `BUCKETS_ASIGNABLES`** the same way web does (`ReclasificarCategoriaControl.tsx:107-109`): `.filter(g => (BUCKETS_ASIGNABLES as readonly string[]).includes(g.bucket))` — drops the `Otros`/Ingresos catch-all so the user cannot cross-classify into a non-spend bucket (proposal D-05/Out-of-scope "cross-type reclassify").

*Why.* `enviarMutacion` is the shared write transport (`mutacion.ts` D-06); wrapping it (not a second copy) is the exact judgment-day finding it closed (`categorias.ts:16-19`). `fetchCatalogo`+`agruparPorBucket` already exist — zero new grouping logic (`dry`). *Rejected:* a bespoke reclassify transport (duplicates `enviarMutacion`); reading the body inside `enviarMutacion` (breaks its "success path never reads body" contract `mutacion.ts:15-23`).

### D-17 — RN reclassify control = `Modal` + grouped `ScrollView` list; per-row trigger `Pressable`; `Alert.alert` cross-bucket confirm with the us-044 guard; settled `announceForAccessibility` on PATCH success.

**Decision.** New `apps/mobile/src/components/detalle/ReclasificarMobileControl.tsx`. Anatomy (ports web `ReclasificarCategoriaControl.tsx` semantics to RN primitives):

1. **Trigger**: one `Pressable` per movement row inside `GrupoMovimientosMobile` (D-19), `accessibilityRole="button"`, `accessibilityLabel={`Cambiar categoría de ${descripcion}`}` (web `:197`), unique `testID={`reclasificar-trigger-${tx.id}`}` (D-19 uniqueness). Tapping sets local `modalAbierto = true`.
2. **`Modal`** (`react-native` `Modal`, `transparent` bottom-sheet style, `onRequestClose` = cancel): body is a `ScrollView` of **bucket sections** (`BUCKETS_ASIGNABLES` order via the filtered `agruparPorBucket`, D-16). Each section = a header `Text` (`ETIQUETA_BUCKET[bucket]` → "Necesidades"/"Gustos"/"Ahorro") + that bucket's categorías as row `Pressable`s. The current categoría (matched by `categoriaActual` name) is marked (a check/"● actual" `Text` + `accessibilityState={{ selected: true }}`). A «Cancelar» `Pressable` closes the modal with no mutation (`cancel path`). Each category row: `testID={`reclasificar-opcion-${categoria.nombre}`}` (D-19). While the catalog is loading (`data === undefined`), the modal shows a `Loading` and offers no rows (never an empty pick surface — web `:39/208-218`).
3. **Selecting a categoría**: derive `bucketNuevo = data.categorias.find(c => c.nombre === nombre)?.bucket`. If `undefined` → set an error message, do nothing (defensive, web `:154-166`). If `bucketNuevo === bucketActual` → `commit(nombre)` directly (same-bucket, no confirm). Else → `Alert.alert` cross-bucket confirm (below).
4. **Cross-bucket confirm = `Alert.alert` with the us-044 guard** (verbatim pattern from `EditarCategoria.tsx:96/133-171`):
   - `mostrandoAlerta = useRef(false)`; at handler entry `if (mostrandoAlerta.current) return; mostrandoAlerta.current = true;`.
   - `Alert.alert(titulo, mensaje, [cancel, destructive], { cancelable: false })` — `{ cancelable: false }` for the Android-backdrop dead-button reason (`EditarCategoria.tsx:146-148`).
   - Message copy = money-move line, ported from web `ReclasificarCategoriaControl.tsx:266-268`: title `"Confirmar cambio de categoría"`; body `Esto mueve ${montoLabel} de ${ETIQUETA_BUCKET[bucketActual]} a ${ETIQUETA_BUCKET[bucketNuevo]}.` (`montoLabel` already formatted by the VM; `ETIQUETA_BUCKET` maps `Deseos→Gustos`, `colors.ts:57`).
   - **Every `onPress` clears `mostrandoAlerta.current = false`** (both Cancelar and Confirmar) — the dropped-clear class the us-044 guard exists to prevent (`EditarCategoria.tsx:157/163`).
   - Confirmar's `onPress` → `commit(nombre, bucketNuevo)`.
5. **`commit(nombre, bucketNuevo?)`** = call `reclasificarCategoria(transaccionId, nombre)` (D-16). On `ok`: close modal, call `onReclasificado()` (D-17→D-18 refresh contract), **and ONLY THEN**, if it was a cross-bucket move, call the screen-passed `onMovida(ETIQUETA_BUCKET[bucketNuevo])` — the SCREEN's handler owns BOTH side-effects (status text + `announceForAccessibility`); the control never calls `AccessibilityInfo` itself (single announcement source, D-20). On `!ok`: set `errorMensaje` (D-21 copy table), keep the row where it is.

**Settled announcement (the us-055 case law).** The announcement fires INSIDE the `ok` branch, AFTER the PATCH resolves — never optimistically before/around the call. This is the us-055 D-04 lesson made concrete: web's `commit(nombre, onSuccess)` threads the label so `onMovida` fires only in `onSuccess` (`ReclasificarCategoriaControl.tsx:127-141/182-184`). The optimistic-announcement bug (announcing a move that a failed PATCH never made) is the class we avoid.

*Why.* RN has no `<select>`/`<optgroup>` (proposal D-05); a `Modal`+`ScrollView` is the portable, section-capable primitive with no new library. The `Alert.alert` guard is settled us-044 case law. *Rejected:* `ActionSheetIOS`/`@react-native-picker/Picker` (no grouped sections, platform-specific, proposal D-05); a bottom-sheet library (`yagni`); announcing before the PATCH settles (us-055 optimistic-announcement bug).

### D-18 — Refresh contract on reclassify success: M1 refetches its open detail (`cargar`) AND fires `solicitarRecargaResumen()`; M2 refetch-on-focus stale-guard.

**Decision.** The proposal D-06 refresh contract, made concrete against `use-reclasificar-categoria.ts:61-69`'s 4-key invalidation:

- **M1 open detail** (web `['detalle-bucket-mes', bucket, clave]`): `BucketDetalleScreen` passes `onReclasificado={cargar}` down to `GrupoMovimientosMobile` → `ReclasificarMobileControl`. On PATCH success (D-17 step 5), `onReclasificado()` re-runs the route's `cargar` for the current `periodo` — the moved row leaves its old group; a classified Sin-categoría row leaves the destacado group. This is the route-owned refetch (D-12's mechanism (c)).
- **Dashboard resumen** (web `['resumen', clave]` + `['resumen-anual']`): the same success path fires `solicitarRecargaResumen()` (`resumen-refresh.ts:33`). The dashboard's `index.tsx` `cargar` (`:73-75`) and `ResumenAnual` are subscribers, so the 50/30/20 + annual grid refetch on their next render/focus — the mobile equivalent of invalidating `['resumen']`+`['resumen-anual']`. This is the us-044 MCTG-07 precedent (`EditarCategoria.tsx:123`).
- **M2 (`/ingresos`) stale-guard** (web `['ingresos-mes']`): the proposal notes a reclassify does not touch income (D-05 restricts destinations to `BUCKETS_ASIGNABLES`, which excludes any Ingresos bucket), so M2 needs **no active signal**. BUT a cross-bucket move CAN re-stamp income totals in the edge web deliberately invalidates for. Since mobile has no cross-screen ingresos cache, we pin: **M2 uses `useFocusEffect` to refetch its own data on focus** (the ONE `useFocusEffect` in this change — D-12 excludes it from the initial-load path). So if the user reclassifies on M1 then navigates to M2, M2's focus refetch shows fresh income. This mirrors the us-044 D-10 "configuracion refetches its catalog on focus" precedent (`categoria/[id].tsx:56-58` comment references it).

**Contract statement (pinned):** *Any successful reclassify MUST both (a) refetch the open M1 detail via `cargar` and (b) call `solicitarRecargaResumen()`. M2 refetches its own income on focus.*

*Why.* No query cache to invalidate (D-03); the pub/sub + route-refetch is the working mobile idiom (2 precedents: subir.tsx upload, us-044 bucket-change). M2-on-focus closes the web `['ingresos-mes']` gap without a cross-screen cache. *Rejected:* optimistic row-move (proposal D-06, us-055 D-04 — refetch is authoritative); signaling M2 via a second pub/sub (over-engineered — focus refetch is enough and M2 is not commonly open during an M1 reclassify).

### D-19 — testID uniqueness on every repeated row (us-044 PR7 lesson).

**Decision.** Every component rendered in a `map` derives a unique `testID` from a stable id:
- Legend rows: `leyenda-fila-${bucket}` / `leyenda-fila-ingreso` (D-10).
- Groups: `grupo-movimientos-${categoriaId ?? 'sin-categoria'}` on `GrupoMovimientosMobile`'s root (web keys by `periodo-categoriaId` `BucketDetalleMesPage.tsx:195`; mobile testID drops `periodo` — one screen renders one period at a time).
- Movement rows: `movimiento-${tx.id}`.
- Reclassify trigger: `reclasificar-trigger-${tx.id}`; option rows: `reclasificar-opcion-${categoria.nombre}`.
- "ver N más" toggle: `grupo-toggle-${categoriaId ?? 'sin-categoria'}`.
- Ingresos rows: `ingreso-fila-${tx.id}`.
- Screen-owned announcement region: `status-reclasificar` on `BucketDetalleScreen`'s status `Text` (singleton, D-20 — pinned by MDET-05).
- SinCategoria destacado: the group root keeps its stable `grupo-movimientos-sin-categoria`; an INNER highlight wrapper carries `grupo-sin-categoria-destacado`, rendered ONLY while `destacar` is active (pinned by MDET-03).

*Why.* RNTL `getByTestId` throws on duplicate testIDs; the us-044 PR7 gate flagged repeated components sharing one testID as a blocker (today `LeyendaGasto.tsx:55/77/97` all say `"leyenda-fila"` — fine while inert, broken the moment a test must tap ONE row). *Rejected:* `getAllByTestId([index])` positional selection (brittle to reordering).

### D-20 — Cross-bucket feedback: `announceForAccessibility` + a `BucketDetalleScreen`-owned status `Text` that outlives the moved row.

**Decision.** `BucketDetalleScreen` owns `const [anuncio, setAnuncio] = useState('')` and renders a status `Text` at screen top (outside the groups map — a stable sibling that survives a moved row's unmount, web `BucketDetalleMesPage.tsx:104-113`). Props: `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` (the RN status-region idiom, `EditarCategoria.tsx:276-278` precedent). On a confirmed cross-bucket move settling `ok` (D-17), the control calls a passed `onMovida(bucketLabel)`; the SCREEN's handler is the ONLY call site for both side-effects: `setAnuncio(`Movida a ${bucketLabel}.`)` AND `AccessibilityInfo.announceForAccessibility(`Movida a ${bucketLabel}.`)` (the control never calls `AccessibilityInfo` — no double announcement). The status `Text` carries `testID="status-reclasificar"` (MDET-05). `bucketLabel = ETIQUETA_BUCKET[bucketNuevo]` (Deseos→Gustos). The region clears on `periodo` change (arrow tap) — mirror web's period-change clear (`BucketDetalleMesPage.tsx:79-82`) via a `useEffect([periodo])` that resets `anuncio` to `''`.

*Why.* RN has no `aria-live`; `announceForAccessibility` is the screen-reader primitive and the screen-owned `Text` outlives the row (the `ListaIngestas`/`EliminarIngestaControl` in-repo bug class — a per-row announcement unmounts with the row, proposal R2/D-07). *Rejected:* a toast library (`yagni`, proposal D-07); a per-row inline announcement (unmounts with the row — the exact documented bug).

### D-21 — Reclassify error copy: a NEW closed table `mensajes-reclasificar.ts`, NOT `mensajes-catalogo.ts`.

**Decision.** New `apps/mobile/src/domain/mensajes-reclasificar.ts` with a `mensajeDeErrorReclasificar(error: ApiError): string`, structured exactly like `mensajes-catalogo.ts:112-135` (switch on `error.tag`, transport tags → `copiaPorApiError`, `http` status → a closed COPY table, else GENERICO, closed with `const _exhaustive: never`). The reclassify endpoint's 400 response has `content?: never` (`types.gen.ts:1754-1766 — both the 400 and 404 entries carry `content?: never``) — the body is ALWAYS absent, so there is NO error `code` to read; the switch branches on HTTP status only, not on a code field. `CATEGORIA_DESCONOCIDA` is NOT in the closed table (it was a web-layer string, not a wire response code). The table maps:
- `{ tag: 'http', status: 400 }` (code always undefined — body absent) → `"La categoría elegida no es válida. Elige otra."`.
- `{ tag: 'http', status: 404 }` → `"Ese movimiento ya no existe. Vuelve al resumen y recarga."`.
- transport (`network`/`unauthorized`/`parse`) → `copiaPorApiError` (mobile's shared transport copy).

The `mensajes-reclasificar.spec` test plan MUST inject the REAL error shape `{ tag: 'http', status: 400 }` (no code field) — injecting `{ tag: 'http', status: 400, code: 'CATEGORIA_DESCONOCIDA' }` would test a shape that never arrives from the wire.

**Why a separate table, not `mensajes-catalogo.ts`.** `mensajes-catalogo.ts` owns the 12 CATALOG codes (`CodigoCatalogo` union `:40-52`: `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, …) — those are the categoría/patrón CRUD errors, a different closed set. Reclassify errors (http 400 invalid-category, tx-404 not-found/not-owned) are a disjoint vocabulary from a different endpoint; the PATCH 400 carries no response body (`content?: never`, `types.gen.ts:1754-1766 — both the 400 and 404 entries carry `content?: never``), so the only discriminant is the HTTP status. Merging these into `mensajes-catalogo.ts` would widen `CodigoCatalogo` with unrelated HTTP-status branches and break its `Record<CodigoCatalogo, string>` totality intent. A separate small closed table keeps each surface's error vocabulary honest and `tsc`-total.

*Why.* Totality discipline (`mensajes-catalogo.ts:17-22`); disjoint error domains stay disjoint. *Rejected:* reusing `mensajes-catalogo.ts` (pollutes its closed catalog union with reclassify codes); a single global error table (loses per-surface totality).

### D-22 — Ported view-models are pure TS in `apps/mobile/src/domain`; every pinned literal gets a unit-test assert (falsifiability against copy drift).

**Decision.** Port two view-models near-verbatim into `apps/mobile/src/domain`:
- `detalle-bucket-mes-view-model.ts` — `aDetalleBucketMesViewModel(dto: DetalleBucketMesDto): DetalleBucketMesViewModel` + the VM interfaces + `clampBp`, from web `detalle-bucket-mes-view-model.ts:9-112`. Uses mobile's `formatearMontoCLP` (`formatear-monto.ts:36`) and `aPorcentajeLabel` (`porcentaje.ts`, D-14). `fecha` passes verbatim (web VM does not slice it — `GrupoMovimientos.tsx:71` renders raw ISO; mobile `GrupoMovimientosMobile` will render `aFechaCorta(tx.fecha)` at the component layer, matching web's follow-up note `fecha.ts:29-32`).
- `ingresos-mes-view-model.ts` — `aIngresosMesViewModel(dto, periodo?): IngresosMesViewModel`, from web `:50-60`. Uses `aFechaCorta` (D-14), `formatearMontoConSigno(monto,'+')` (`formatear-monto.ts:62`), `mesCompletoLabel` (`periodo-anual.ts:53`). Non-trivial label mappings to PIN in unit tests: `conteoLabel` = `dto.conteo === 1 ? '1 ingreso' : `${conteo} ingresos`` (0→"0 ingresos", web `:56`); `totalLabel` = `$0` WITHOUT sign for zero (`formatearMontoConSigno` returns unsigned for `0n`, `formatear-monto.ts:74`); `mesLabel` from `periodo ?? periodoActual()` — **mobile substitution**: mobile has no `periodoActual()` (web `periodo.ts`); use `periodoActualUTC(new Date())` (`periodo-anual.ts:76`), documented as the mobile equivalent.

**Falsifiability plan.** Because there is no `packages/shared` (ADR-008), every ported string/label/flag is pinned by an explicit unit assert so drift shows as an intentional edit (proposal R5/D-04). Concretely: `porcentajeLabel`/`metaLabel` for a null-meta bucket assert `'—'` (`SIN_PORCENTAJE_LABEL`); `sinMeta`/`sinPorcentaje` flags assert `true` iff the wire field is `null`; `marcaPorcentajePct` (position of the % marker, 0..100) and `marcaMetaPct` (position of the meta marker, `null` when `metaBp` is `null`) assert `clampBp` output — these are the exact VM field names from the web interface (no `marcaPct` shorthand); `conteoLabel` asserts all three cases (0/1/N); the zero-total `totalLabel` asserts no sign; `montoLabel` asserts BigInt-exact CLP over a value > `Number.MAX_SAFE_INTEGER`.

*Why.* ADR-024 presentation-only (format numbers the backend computed, never re-derive a total/meta/classification). Hand-port + pinned tests is the standing web↔mobile duplication mitigation (proposal R5). *Rejected:* sharing code with web (`packages/shared` does not exist, ADR-008); re-computing any figure client-side (ADR-024 violation).

---

## §2 — Component & data flow

```
DASHBOARD (app/index.tsx, existing)
  periodoVista ──► ResumenScreen(periodo, onNavegar) ──► LeyendaGasto(periodo, onNavegar)
                                                              │ Pressable rows
                                                              ▼ onNavegar(path)  [D-10/D-11]
                                                         router.push(path)

M1 ROUTE  app/bucket/[bucket].tsx                 [D-12]
  useLocalSearchParams{bucket,destacar,periodo}
  useState periodo ─► cargar() ─► fetchDetalleBucketMes(bucket, periodo)  [D-15]
     └ loading | error | data(empty=grupos.length===0)
  data ─► aDetalleBucketMesViewModel(dto)  [D-22]
       ─► BucketDetalleScreen
            ├ SelectorPeriodoMes(periodo, onChange=setPeriodo)  [D-13]  ─► arrow ─► cargar re-fires
            ├ header (etiqueta, porcentajeLabel·Meta, usage bar, total·conteo)  [MDET-02]
            ├ anuncio status Text (screen-owned)  [D-20]
            └ grupos.map ─► GrupoMovimientosMobile(destacar, onReclasificado=cargar, onMovida)  [D-19]
                              ├ accordion (3 visible + "ver N más")  [D-04/CA-02]
                              └ rows.map ─► ReclasificarMobileControl(tx)  [D-17]
                                              Pressable ─► Modal(sections=agruparPorBucket∩BUCKETS_ASIGNABLES)
                                                             ├ same-bucket ─► commit
                                                             └ cross-bucket ─► Alert.alert guard ─► commit
                                              commit ok ─► reclasificarCategoria [D-16]
                                                          ─► onReclasificado()=cargar (M1 refetch)
                                                          ─► solicitarRecargaResumen() (dashboard)  [D-18]
                                                          ─► announceForAccessibility + onMovida (cross-bucket)  [D-20]
                                                          !ok ─► mensajeDeErrorReclasificar  [D-21]

M2 ROUTE  app/ingresos.tsx                        [D-12]
  useLocalSearchParams{periodo}; useState periodo ─► cargar() ─► fetchIngresosMes(periodo)  [D-15]
  useFocusEffect ─► cargar (stale-guard)  [D-18]
  data ─► aIngresosMesViewModel(dto, periodo)  [D-22]
       ─► IngresosMesScreen
            ├ SelectorPeriodoMes(periodo, onChange)  [D-13]  (reused)
            ├ header («Ingresos», conteoLabel·totalLabel, static no-meta note)  [MDET-06]
            └ IngresosMesLista (Fecha·Descripción·Origen badge·Monto, read-only)  NO reclassify [D-08]
```

Integration points (all existing, verified): `_layout.tsx` Stack registration; `resumen-refresh.ts` pub/sub; `fetchCatalogo`/`agruparPorBucket` for the picker; `enviarMutacion` transport; `ETIQUETA_BUCKET`/`BUCKETS_ASIGNABLES`; `formatearMontoCLP`/`formatearMontoConSigno`.

---

## §3 — Spec impact (MDET-* new capability + one MOB-08 edit)

Per proposal §Spec impact (IDs verified fresh — MOB max = MOB-15, `MDET-*` unused):
- **MODIFIED** `mobile-resumen-screen` / **MOB-08** — legend rows become pressable nav targets (3 scenarios: spend→`/bucket/{bucket}`, SinCategoria→`/bucket/SinCategoria?destacar=sin-categoria`, Ingresos→`/ingresos`), each threading `periodo`. The ONLY MOB-* edit.
- **ADDED** `openspec/specs/mobile-detalle-mes/spec.md`, prefix **`MDET-*`**: MDET-01 (M1 route/machine), MDET-02 (M1 header), MDET-03 (`GrupoMovimientosMobile` accordion + destacado), MDET-04 (`SelectorPeriodoMes`), MDET-05 (reclassify control + refresh contract), MDET-06 (M2 route/screen read-only), MDET-07 (domain purity + coverage). Full requirement text is the sdd-spec phase's job (this design is the architecture).

---

## §4 — File ledger (VERIFIED against disk this session)

Legend: **C** = Create (does not exist on disk), **M** = Modify (exists on disk, verified).

### Create (production)
| # | Path | What | Decision |
|---|------|------|----------|
| C1 | `apps/mobile/app/bucket/[bucket].tsx` | M1 route + state machine | D-12 |
| C2 | `apps/mobile/app/ingresos.tsx` | M2 route + state machine + focus-guard | D-12/D-18 |
| C3 | `apps/mobile/src/components/detalle/BucketDetalleScreen.tsx` | M1 screen (header, anuncio region, groups) | D-12/D-20 |
| C4 | `apps/mobile/src/components/detalle/GrupoMovimientosMobile.tsx` | accordion group (3 visible + "ver N más", destacado) | D-04/D-19 |
| C5 | `apps/mobile/src/components/detalle/ReclasificarMobileControl.tsx` | Modal picker + Alert guard + settled announce | D-16/D-17/D-20 |
| C6 | `apps/mobile/src/components/detalle/IngresosMesScreen.tsx` | M2 screen (header + static note) | D-12 |
| C7 | `apps/mobile/src/components/detalle/IngresosMesLista.tsx` | read-only rows (Origen badge) | D-08 |
| C8 | `apps/mobile/src/components/SelectorPeriodoMes.tsx` | reusable period arrows | D-13 |
| C9 | `apps/mobile/src/domain/detalle-bucket-mes-view-model.ts` | ported M1 VM | D-22 |
| C10 | `apps/mobile/src/domain/ingresos-mes-view-model.ts` | ported M2 VM | D-22 |
| C11 | `apps/mobile/src/domain/fecha-corta.ts` | ported `aFechaCorta` | D-14 |
| C12 | `apps/mobile/src/domain/porcentaje.ts` | promoted `SIN_PORCENTAJE_LABEL`+`aPorcentajeLabel` | D-14 |
| C13 | `apps/mobile/src/domain/detalle.types.ts` | type aliases for `DetalleBucketMesDto`/`IngresosMesDto`/`ReclasificarCategoriaDto` (mirror `resumen.types.ts`) | D-15/D-16 |
| C14 | `apps/mobile/src/domain/mensajes-reclasificar.ts` | closed reclassify error table | D-21 |

### Create (tests) — see §5 for counts
| # | Path |
|---|------|
| T-C1 | `apps/mobile/src/domain/detalle-bucket-mes-view-model.spec.ts` |
| T-C2 | `apps/mobile/src/domain/ingresos-mes-view-model.spec.ts` |
| T-C3 | `apps/mobile/src/domain/fecha-corta.spec.ts` |
| T-C4 | `apps/mobile/src/domain/porcentaje.spec.ts` |
| T-C5 | `apps/mobile/src/domain/mensajes-reclasificar.spec.ts` |
| T-C6 | `apps/mobile/src/domain/periodo-anual.spec.ts` (add `mesAnterior`/`mesSiguiente`/`esMesActual` cases — or extend existing if present) |
| T-C7 | `apps/mobile/src/api/detalle-fetchers.spec.ts` (`fetchDetalleBucketMes`+`fetchIngresosMes` branch matrix) |
| T-C8 | `apps/mobile/src/api/reclasificar.spec.ts` (`reclasificarCategoria` wrapper) |
| T-C9 | `apps/mobile/src/components/SelectorPeriodoMes.spec.tsx` |
| T-C10 | `apps/mobile/src/components/detalle/BucketDetalleScreen.spec.tsx` |
| T-C11 | `apps/mobile/src/components/detalle/GrupoMovimientosMobile.spec.tsx` |
| T-C12 | `apps/mobile/src/components/detalle/ReclasificarMobileControl.spec.tsx` |
| T-C13 | `apps/mobile/src/components/detalle/IngresosMesScreen.spec.tsx` |
| T-C14 | `apps/mobile/src/components/LeyendaGasto.spec.tsx` (extend: pressability + nav args) |
| T-C15 | `apps/mobile/app/bucket/[bucket].spec.tsx` and `apps/mobile/app/ingresos.spec.tsx` (route machines) |

### Modify (production)
| # | Path | Change | Decision |
|---|------|--------|----------|
| M1 | `apps/mobile/app/_layout.tsx` | register `bucket/[bucket]` + `ingresos` in the authenticated `<Stack.Protected>` (`:42-47`) | D-12 |
| M2 | `apps/mobile/src/components/LeyendaGasto.tsx` | rows `View`→`Pressable`, unique testIDs, `periodo`+`onNavegar` props | D-10/D-11/D-19 |
| M3 | `apps/mobile/src/components/ResumenScreen.tsx` | thread `periodo`+`onNavegar` to `LeyendaGasto` (`:23/:47`) | D-10 |
| M4 | `apps/mobile/app/index.tsx` | pass `periodo={periodoVista}`+`onNavegar={router.push}` to `ResumenScreen` (`:162`) | D-10 |
| M5 | `apps/mobile/src/api/client.ts` | add `fetchDetalleBucketMes`+`fetchIngresosMes`+ their shape guards | D-15 |
| M6 | `apps/mobile/src/api/categorias.ts` | add `reclasificarCategoria` wrapper + `esReclasificarDto` | D-16 |
| M7 | `apps/mobile/src/domain/periodo-anual.ts` | port `mesAnterior`/`mesSiguiente`/`esMesActual`+`partesDePeriodo`/`formatearPeriodo` | D-13 |
| M8 | `apps/mobile/src/domain/resumen-view-model.ts` | import `aPorcentajeLabel` from new `porcentaje.ts`, re-export `SIN_PORCENTAJE_LABEL` (zero call-site churn) | D-14 |

**Ledger summary: 14 production Create + 15 test-file Create (29 Create) · 8 production Modify.** (Some test files extend existing specs where present — the sdd-tasks phase confirms extend-vs-create per file at RED time.)

---

## §5 — Test ledger (RED-first, strict TDD active; jest-expo + RNTL / plain jest)

Per-file plan with assert counts (a spec'd behavior = an assert; the "dropped-assertion" class means every scenario below is an explicit `expect`).

### Unit (plain jest — pure functions)
| File | Asserts | Pins |
|------|---------|------|
| detalle-bucket-mes-view-model.spec | ~10 | `totalLabel`/`subtotalLabel`/`montoLabel` BigInt-exact (incl. > MAX_SAFE_INTEGER); `porcentajeLabel`/`metaLabel` incl. `'—'` for null; `sinMeta`/`sinPorcentaje` true⇔null; `marcaPorcentajePct`/`marcaMetaPct` clamp; grupos verbatim order/count |
| ingresos-mes-view-model.spec | ~8 | `conteoLabel` 0/1/N; `totalLabel` zero-no-sign + signed +; `mesLabel` from periodo & from `periodoActualUTC` fallback; `fechaLabel`=`aFechaCorta`; `origen` verbatim |
| fecha-corta.spec | ~2 | `.slice(0,10)`; passthrough of malformed |
| porcentaje.spec | ~3 | null→`'—'`; 0→`'0%'`; N/100 |
| mensajes-reclasificar.spec | ~6 | `{ tag:'http', status:400 }` (no code — body absent) → invalid-category copy; `{ tag:'http', status:404 }` → tx-not-found copy; network/unauthorized/parse via `copiaPorApiError`; `_exhaustive` tsc-guard (type-level) |
| periodo-anual (new cases) | ~6 | `mesAnterior` incl. Jan rollover; `mesSiguiente` incl. Dec rollover; `esMesActual` true/false |
| detalle-fetchers.spec | ~14 | Per fetcher: no-base-URL→network; fetch-throw→network; 401→unauthorized; non-2xx→http; bad-json→parse; bad-shape→parse; ok→value. Money-guard: malformed `monto`/`total`→parse |
| reclasificar.spec | ~5 | body `{categoria}` only; ok→guarded value; non-2xx→propagated; bad-shape→parse; url encodes id |

**Unit subtotal ≈ 54 asserts across 8 files.**

### Component (jest-expo + RNTL)
| File | Asserts | Pins |
|------|---------|------|
| LeyendaGasto.spec (extend) | ~5 | each row is a button (role); `onNavegar` called with EXACT path incl. `periodo` (spend/SinCategoria+destacar/ingreso); unique testIDs resolve |
| SelectorPeriodoMes.spec | ~6 | `‹` calls `onChange(mesAnterior)`; `›` calls `onChange(mesSiguiente)`; next disabled at current month (`accessibilityState.disabled`); prev always enabled; label = `mesCompletoLabel`; arrow a11y labels |
| BucketDetalleScreen.spec | ~7 | 4 phases (loading/error+retry/empty/data); header labels (etiqueta, `porcentajeLabel · Meta`, total·conteo); `sinMeta`/`sinPorcentaje` hide tag/bar; anuncio region present + outlives row |
| GrupoMovimientosMobile.spec | ~6 | 3 visible + "ver N más" reveals rest; "Ver menos" collapses; `accessibilityState.expanded`; destacado when `?destacar`; ≤3 rows → no toggle; unique group/row testIDs |
| ReclasificarMobileControl.spec | ~10 | trigger opens Modal; sections=BUCKETS_ASIGNABLES only; current marked; same-bucket→commit no Alert; cross-bucket→`Alert.alert` spied on ARGS (title + money-move line + destructive); guard blocks double-open; cancel path zero mutation; `announceForAccessibility` spied fires ONLY after ok (settled); refetch (`onReclasificado`)+`solicitarRecargaResumen` called on ok; error copy on !ok |
| IngresosMesScreen.spec | ~6 | 4 phases; header «Ingresos» + `conteoLabel · totalLabel` + static no-meta note; rows Fecha·Descripción·Origen·Monto; Origen badge; NO reclassify control present; focus refetch |
| bucket/[bucket].spec + ingresos.spec (routes) | ~6 | `useLocalSearchParams` drives fetch; `periodo` state steps on arrow; back calls `router.back`; M2 focus-effect refetch |

**Component subtotal ≈ 46 asserts across 7 files.**

**Test ledger total ≈ 100 asserts / 15 files** (54 unit + 46 component). Maestro-only (manual, not CI, ADR-017): the actual native `Modal` present/dismiss animation, `announceForAccessibility` reaching a real screen reader (RNTL only spies the call), the `ScrollView` scroll on a long picker, and back-gesture navigation.

**Falsifiability for label pins & wiring**: each ported literal (`'—'`, `'1 ingreso'`, `'ingresos'`, `Esto mueve … de … a …`, `Movida a … .`, bucket labels `Gustos`) is asserted against its exact string; each `onNavegar`/`router.push` path is asserted with the FULL template incl. `periodo`; each refresh call (`cargar`, `solicitarRecargaResumen`) is asserted via mock. A silent copy/path drift fails a named test → shows as an intentional edit (proposal R5).

---

## §6 — Case-law compliance checklist (14 gated slices)

- **Truthful comments** — new files carry docstrings that describe what the code does (no aspirational/stale claims); `LeyendaGasto`'s inert-row docstring (`:6-16`) is UPDATED to reflect pressability (not left lying).
- **testID uniqueness on repeated rows** — D-19 (every `map`ped element).
- **Alert guard** — D-17 (`mostrandoAlerta` useRef, `{cancelable:false}`, cleared in every onPress) verbatim from `EditarCategoria.tsx:96/157/163`.
- **Settled announcements** — D-17/D-20 (`announceForAccessibility` fires inside the PATCH `ok` branch only; us-055 D-04 lesson).
- **Dropped-assertion class** — §5 every spec'd behavior has an explicit `expect`.
- **Stub shapes pass real DTO guards** — test fixtures for the fetchers/VMs are built to satisfy `esDetalleBucketMesDto`/`esIngresosMesDto`/`esReclasificarDto` (real field shapes from `types.gen.ts:1839-1976/2121-2129`), not loose partials.
- **Ledger inline ✅ (sha)** — apply phase records each task's completion with commit sha inline.
- **RED evidence recorded** — every fetcher branch, VM label, nav push, and the reclassify flow goes RED first with captured output (D-09).

---

## §7 — PR shape (5 PRs, stacked-to-main) + commit order

Chain strategy: **stacked-to-main** (proposal; 13-slice US-050→055 precedent is the chain-merge case law). Each PR is RED-first-tested and independently shippable. **PR chain count: 5 (SelectorPeriodoMes in PR3) or 6/refolded (into PR2) — DECIDE at the sdd-tasks Review Workload gate.**

### PR1 — Legend pressability + navigation (~150 LOC, CA-01) ✅ under 400
Commits: (1) `test(mobile): RED legend rows pressable + nav args + periodo threading` (extend LeyendaGasto.spec, T-C14); (2) `feat(mobile): make legend rows Pressable with router.push` (M2 LeyendaGasto, M3 ResumenScreen, M4 index.tsx); (3) register `bucket/[bucket]`+`ingresos` as STUB routes in `_layout.tsx` (M1) so pushes resolve (stub screens render a placeholder + back); (4) `docs(openspec): MOB-08 delta`. Gate: MOB-08 spec scenarios green.

### PR2 — Plumbing + domain (~300 LOC, CA-02/03 foundation) ✅ under 400
Commits: (1) RED unit specs for both VMs + `aFechaCorta` + `porcentaje` + the 3 period helpers + fetchers + reclassify wrapper (T-C1..C8); (2) port VMs (C9,C10), `fecha-corta` (C11), `porcentaje` (C12) + rewire `resumen-view-model` (M8), `detalle.types` (C13); (3) port period helpers (M7) + update the `periodo-anual.ts` docstring (its 'out of scope for mobile' claim becomes false — D-13 truthful-comments obligation); (4) add fetchers+guards (M5), reclassify wrapper+guard (M6), `mensajes-reclasificar` (C14). Gate: all unit specs green, `tsc --noEmit`.

### PR3 — M1 read-only (~400 LOC, CA-02) ⚠️ AT budget — **recommendation below** — **PR chain count: 5 (SelectorPeriodoMes here in PR3) or 6/refolded (SelectorPeriodoMes into PR2) — DECIDE at the sdd-tasks Review Workload gate**
Commits: (1) RED specs for `SelectorPeriodoMes`, `BucketDetalleScreen`, `GrupoMovimientosMobile`, the bucket route (T-C9,C10,C11,C15-M1); (2) `SelectorPeriodoMes` (C8); (3) `GrupoMovimientosMobile` accordion (C4); (4) `BucketDetalleScreen` (C3) + real `app/bucket/[bucket].tsx` (C1, replacing PR1 stub) — NO reclassify yet (control slot is a no-op/read-only row). Gate: MDET-01..04 green.

### PR4 — Reclassify (~300 LOC, CA-04) ✅ under 400 (highest-effort)
Commits: (1) RED `ReclasificarMobileControl.spec` (Modal, Alert-args, settled announce, refresh) (T-C12); (2) `ReclasificarMobileControl` (C5); (3) wire it into `GrupoMovimientosMobile` (per-row trigger) + `BucketDetalleScreen` anuncio region + `onReclasificado=cargar`+`solicitarRecargaResumen` (D-18). Gate: MDET-05 green incl. announcement/refresh asserts.

### PR5 — M2 ingresos (~300 LOC, CA-03) ✅ under 400
Commits: (1) RED `IngresosMesScreen.spec` + ingresos route spec (T-C13,C15-M2); (2) `IngresosMesLista` (C7); (3) `IngresosMesScreen` (C6) + real `app/ingresos.tsx` (C2, replacing PR1 stub) with `SelectorPeriodoMes` reuse + focus-guard (D-18). Gate: MDET-06/07 green.

### PR3 split-vs-exception recommendation (Review Workload gate)
**Recommendation: SPLIT `SelectorPeriodoMes` out ahead of PR3.** `SelectorPeriodoMes` (C8, ~70 LOC + its ~40-LOC spec) is reused by PR5, so extracting it as an early standalone slice is clean AND drops PR3 from ~400 to ~290 LOC (M1 screen + accordion + route), comfortably under budget. Concretely: promote `SelectorPeriodoMes` (component + spec) into PR2 (it depends only on the D-13 period helpers already landing in PR2) — PR2 goes ~300→~410 which then itself needs the check, OR make it its own PR2.5. **Preferred: fold `SelectorPeriodoMes` into PR2** (period helpers + their sole consumer ship together, cohesive) and if PR2 crosses 400 after that, carry `size:exception` on PR2 (pure additive domain+one component, low-risk diff) rather than on PR3 (the denser screen+accordion+route slice, where an exception hides more). Decide at the sdd-tasks Review Workload gate once exact LOC is counted at RED time.

Rollback: purely additive client change; revert PR(s), no backend/schema to unwind. Reverting only PR1 makes the routes unreachable while leaving screen files inert (one-commit hotfix path, proposal Delivery forecast).

---

## §8 — Risks (architectural)

| # | Risk | Mitigation |
|---|------|------------|
| A1 | RN `Modal` a11y (focus, dismiss, section headers) is new surface | D-17 scopes it to `Modal`+`ScrollView` (no library), sections from existing `agruparPorBucket`; RNTL asserts open/select/cancel + Alert args; real-device focus/dismiss is Maestro-only |
| A2 | Announcement lost on row unmount | D-20 screen-owned status region + `announceForAccessibility`; asserted the region outlives the row |
| A3 | Stale dashboard/M2 after reclassify | D-18 pins refetch(`cargar`)+`solicitarRecargaResumen`; M2 focus-guard |
| A4 | PR3 at 400-line budget | §7 recommends folding `SelectorPeriodoMes` into PR2; decide exact call at tasks gate |
| A5 | Copy/label drift web↔mobile (no `packages/shared`) | D-22 falsifiability: every ported literal pinned by a named unit assert |
| A6 | `periodo` threading correctness (open on dashboard's month) | D-10 threads `periodoVista` into the push path; D-13 seeds `SelectorPeriodoMes`; asserted in PR1 + route specs |
| A7 | **RESOLVED**: proposal §Why-now named wrong paths (`/api/detalle/bucket/:bucket`, `/api/ingresos`) | D-15 corrected to the CONTRACT paths verified on disk: `/api/buckets/{bucket}/detalle` + `/api/ingresos/mes` (`types.gen.ts:487/949`). Fetcher URL literals + their specs must use these; the sdd-tasks/apply phases inherit the corrected D-15, NOT the proposal's paths |
