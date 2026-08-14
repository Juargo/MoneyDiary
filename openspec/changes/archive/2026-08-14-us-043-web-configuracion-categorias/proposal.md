# Proposal: US-043 — Web Configuración, Categorías section

- **Change**: `us-043-web-configuracion-categorias`
- **Issue**: [#277](https://github.com/Juargo/MoneyDiary/issues/277) · Wireframes: Whimsical `LYiabT1DD6UvDMnFXnBkn9`, frames `2`, `3`, `T2`, `T3`
- **Status**: Proposed (2026-08-14)
- **Consumes** (deployed, canonical, **zero API work here**): `openspec/specs/catalogo-clasificacion-ownership/spec.md` (`CAT038-*`, `CAT039-*`) — 7 endpoints, shipped by US-038/US-039
- **Builds on** (shipped): `openspec/specs/web-app/spec.md` `WCFG-01..13` (US-042), `WCAT-01..05` (US-013)
- **Requires new ADR**: **No.** Every decision applies ADR-024 (thin clients), ADR-018 (a11y by layers), ADR-008/016 (stack), ADR-036/037 (catalog is a per-user row, not a closed enum). Nothing deviates.

---

## 0. Action items on issue #277 — what the wireframes contradict about the shipped app

Five items. The first three need a maintainer answer before `sdd-spec` freezes copy.

| # | Finding | Evidence | Leaning |
|---|---|---|---|
| **A1** | **`Deseos` vs `Gustos`.** Frame 2 groups by `Deseos`. The **entire shipped dashboard renders that bucket as `Gustos`** — `ETIQUETA_BUCKET` maps `Deseos → 'Gustos'` and is consumed by `LeyendaGasto`, `DistribucionPie`, `BucketDetailList` and `ReclasificarCategoriaControl` | `apps/web/src/lib/bucket-colors.ts:33-38` ("el dominio modela el bucket del medio como *Deseos*; el producto/UI lo llama *Gustos*") | **Display `Gustos`, send `Deseos`.** Reuse `ETIQUETA_BUCKET`. Two names for one bucket in one app is the defect; the wireframe drew the wire value, not the label |
| **A2** | **Page heading / IA.** Frame 2 shows `Configuracion` as the heading with `Perfil`/`Categorias` beneath it. Shipped `ConfiguracionPage` renders `<h1>Editar perfil</h1>` — there is **no `Configuración` heading today** | `apps/web/src/components/configuracion/ConfiguracionPage.tsx:59` | **Adopt the wireframe**: `Configuración` becomes the shared `<h1>` in the layout, each section keeps a sub-heading (`Editar perfil` / `Categorías y patrones`). Touches a shipped file — see §1 |
| **A3** | **Accents.** Frames write `Configuracion`, `Categorias`, `patron`, `auto-categorizacion`, `Sin categoria` unaccented. Shipped code is **accented** (`Categorías` in `ConfiguracionTabs.tsx:32`, `Configuración` in `NAV_ITEMS`, `Sin categoría` in `ETIQUETA_BUCKET`). US-042 raised this identical item and shipped accented | `ConfiguracionTabs.tsx:32`, `bucket-colors.ts:37` | **Ship accented.** §6 quotes the frames verbatim and gives the accented shipping string beside it |
| **A4** | ~~Two strings on the frames read as annotations, not UI copy~~ — **RESOLVED 2026-08-14, leaning reversed.** The sentence is **rewritten at every breakpoint**: frame 2 `Eliminar una categoria en uso muestra advertencia: sus transacciones pasan a Sin categoria.` · T2 `Eliminar en uso: advertencia, transacciones a Sin categoria.` · M2 `Toca una categoria para editarla o eliminarla.` An annotation to the reader does not get responsive rewrites, and M2's is an instruction to the *user*, not a description of behaviour | `wireframes-extracted.md` §2 C-3 | **Rendered copy.** Ship the per-breakpoint string. US-043 ships the frame-2 and T2 variants; M2's belongs to US-063 (#332) |
| **A5** | **App chrome** (`MoneyDiary`, `Dashboard Registrar Historial`, icon, divider) is illustrative, exactly as US-042 recorded for frame 1. `apps/web` has no header; `AppShell` is `Sidebar`↔`BottomTabs` | US-042 proposal §0 | Read as existing chrome. No shell redesign |

~~**Blocked**: frames T2/T3 could not be extracted (canvas-rendered).~~ **UNBLOCKED 2026-08-14** — all nine
frames extracted to `wireframes-extracted.md`. The block was a wrong tool call shape, not a canvas
limitation: fetching the board flat collapses each wireframe into a one-line summary; passing
`scope: <frame-id>` returns every element with coordinates. **CA-06's assumption is confirmed by
measurement** (§11). Two further findings — a footer contradiction and mobile frames nobody had
seen — are folded into decisions 8–10 below.

---

## Intent

The catalog API is fully deployed and reachable by nobody: seven endpoints (`GET/POST/PATCH/DELETE /api/categorias`, `POST/PATCH/DELETE /api/patrones`) shipped in US-038/US-039 with **zero clients**. A MoneyDiary user cannot create, rename, re-bucket or delete a single category, nor touch one auto-classification pattern, from any surface.

Worse than absent: **the web actively lies about the catalog.** `apps/web/src/domain/categoria.ts` hardcodes the eight seed categories and their buckets, and the dashboard's reclassify `<select>` renders exactly that list. ADR-036/037 made categories per-user mutable rows; the web never followed. Today that costs nothing because nothing can create a ninth category. **This change is precisely what makes it reachable.**

After this change a user opens `/configuracion` → `Categorías`, sees their own catalog grouped by bucket, and can create, rename, re-bucket, delete, and manage patterns — with an honest warning before every operation that moves money or orphans transactions.

## Why now

1. **Two deployed requirement families ship value only through this page.** `CAT038-*`/`CAT039-*` are dead inventory until it exists.
2. **The `Categorías` tab is an inert placeholder that names this change.** `ConfiguracionTabs.tsx:11` — *"US-043 lo cambia a un link en una línea"*.
3. **Inherited obligation, recorded three times.** US-038 accepted the stale dropdown as debt **"closed by US-043"** (`us-038-catalogo-crud/proposal.md:347,391`, `design.md:859`, `categoria.mirror.spec.ts:26-29`: *"accepted debt closed by US-043"*). This change is where that promise comes due — see §7.

---

## Binding decisions

Settled with the maintainer (1–3) or forced by verified ground truth (4–7). Recorded as decisions, not options.

| # | Decision | Rationale |
|---|---|---|
| **1** | **Changing a category's bucket shows an impact warning before saving.** | `PrismaCategoriaRepository.actualizar` re-stamps `bucketId` on **every** transaction referencing the category, **across all periods**, in the same DB transaction. Moving `Supermercado` Necesidades→Deseos retroactively rewrites the 50/30/20 split of every closed month. The wireframe draws a bare dropdown; a bare dropdown for that is a trap. **The single most dangerous operation in this change** |
| **2** | **Patterns persist immediately; `Guardar` covers only `Nombre` + `Bucket`.** `Cancelar` discards only the name/bucket draft. | The API has no batched endpoint: patterns are three independent endpoints and `categoriaId` is not even patchable. One button implying atomicity over four endpoints is a lie the API cannot honour. **The screen therefore has two independent mutation surfaces with different commit semantics, and the UI must not imply otherwise** (§4) |
| **3** | **The delete impact count comes from the list payload and is not refreshed before confirming.** | `transaccionesCount` already rides on `CategoriaDto` (`CAT039-01`), and `catalogo-clasificacion-ownership` Non-Goals explicitly rejected a `GET /api/categorias/:id/impacto` endpoint. Single-user app; staleness is an accepted, recorded tradeoff |
| **4** | **The edit screen is its own route**, `/configuracion/categorias/:categoriaId`. | Frame 3's breadcrumb (`Configuracion` / `Categorias` / `Supermercado`) is a URL hierarchy drawn on screen. Deep-linking and browser-back follow from it; `buckets.$bucket.tsx` is the shipped drill-down precedent (§1) |
| **5** | **CA-04's warning is purely client-side.** There is **no server-side rejection to catch.** | `DELETE /api/categorias/:id` **always returns `204`** for the caller's own row, in use or not — US-039 retired `CategoriaEnUsoError` (`catalogo-http-error.ts:35-37`). CA-04's *"when the category is in use"* implies a 409 that **does not exist and never will**. Nobody should later hunt for it. Referencing transactions survive with `categoriaId: null` via a DB-level `onDelete: SetNull`; **`bucketId` is never touched**, so delete never moves money between buckets |
| **6** | **The reclassify dropdown becomes data-driven and `domain/categoria.ts`'s enum mirror is deleted** (§7). | The obligation inherited above, plus the reachability asymmetry: this change is what makes the stale list wrong in practice |
| **8** | **Mobile viewport gets a defensive floor, not the M2/M3 redesign.** US-043 guarantees at 360px: no horizontal overflow, `Nombre`/`Bucket` stacked, and every tap target ≥ 24×24. It keeps the desktop structure otherwise (vertical tabs, two row icons, breadcrumb). | Settled with the maintainer 2026-08-14. `M2`/`M3` **restructure** rather than resize (`wireframes-extracted.md` §3) — horizontal tabs, one row icon, back-icon IA, inverted footer, four shortened labels. That is a slice of its own and is split to **US-063 (#332)**. But the page is already reachable at 360px (US-042's `grid-cols-1 lg:grid-cols-[200px_1fr]` stacks below `lg`), so shipping *nothing* for mobile ships a page drawn for 680px into 360. The floor is the honest minimum; SC 2.5.8 (WCAG 2.2 AA, ADR-018) makes the tap-target half of it non-optional |
| **9** | **The `sin patrones` note is static helper text under the patterns section, always rendered** — not a zero-pattern conditional. | All three edit frames (`3`, `T3`, `M3`) draw it **below a populated pattern list** with the same leading info icon, regardless of count (`wireframes-extracted.md` §2 C-2). Always-render satisfies CA-03's *"a category with zero patterns shows the note"* trivially and is what was actually drawn. A conditional would contradict every frame that exists |
| **10** | **The footer is one row and the red `Eliminar categoría` sits in it**, left-aligned, with `Cancelar`/`Guardar` right-aligned. | Frames `3` and `T3` both draw it that way (`wireframes-extracted.md` §2 C-1). This **contradicts §4's stated mitigation** ("footer bound to the identity block only"), so §4's two-commit-semantics honesty must be carried by something else — the divider above the footer plus copy that never implies pattern edits are pending. Design owns picking that mechanism; it may not silently drop the obligation |
| **7** | **No retroactive reclassification.** | Split to **issue #331 (US-062)**. The only mechanism today is `PATCH /api/transacciones/:id/categoria`, one row at a time; doing it client-side would duplicate `PatronClasificacion.coincide()` and violate ADR-024. This change stays **frontend-only against deployed contracts**. The edit screen is where #331's offer will eventually live, so §4's layout must leave room for a note under the patterns section — **and build nothing for it now** |

---

## Scope

### In scope

| | Deliverable |
|---|---|
| **A** | **Route restructure + IA** — `/configuracion` becomes a layout; `Perfil` and `Categorías` become sibling routes; the edit screen is a third level (§1). Tab placeholder → real `Link` |
| **B** | **Data layer** — `api/categorias.ts` (7 calls, never-throw `ApiResult<T>`, runtime DTO guards) + query/mutation hooks (§2) |
| **C** | **CA-01** — list grouped by bucket, three-form pattern tag, row actions, `Nueva categoría` (§3) |
| **D** | **CA-02** — edit screen: `Nombre` + required `Bucket` dropdown with `Guardar`/`Cancelar`, and per-row pattern CRUD (§4) |
| **E** | **CA-03** — the `sin patrones` note, in both places the frames put it (§3, §4) |
| **F** | **CA-04 + decision 1** — one destructive-confirm component, two payloads: delete-impact and bucket-change-impact (§5) |
| **G** | **CA-05** — the invalidation matrix, asymmetric by mutation kind (§6) |
| **H** | **Copy** — closed 11-code error table + the verbatim UI strings (§8) |
| **I** | **Reclassify repair** — dashboard dropdown data-driven; enum mirror deleted (§7) |
| **J** | **CA-06** — tablet variants (§11), plus the **360px defensive floor** of decision 8: no horizontal overflow, `Nombre`/`Bucket` stacked, every tap target ≥ 24×24 |
| **K** | **Demo + empty states** (§9), directory structure (§10), tests and gates (§12) |

### Out of scope

| Not doing | Why / owner |
|---|---|
| **Retroactive reclassification** when a pattern is added/changed | **Issue #331 (US-062).** Needs a new bulk API endpoint. Decision 7 |
| Any `apps/api` change | Contracts deployed and canonical. An API change here means the proposal misread the spec |
| Mobile catalog UI | Not scheduled. `apps/mobile` untouched |
| Moving a pattern between categories | The API forbids it — `categoriaId` is rejected by `PATCH /api/patrones/:id`'s `.strict()` |
| An id-based reclassify wire contract | US-038 named it a *"US-043 companion"* — it is an **API** change. Name-based stays; §7 works within it |
| Bulk reassignment of a deleted category's transactions | `catalogo-clasificacion-ownership` Non-Goals: a migration wizard, a different feature |
| `prioridad` as a first-class user control | Neither frame shows it. Send the API default (100); do not invent an ordering UI (`yagni`). Flagged as an open question |
| Promoting `jsx-a11y` to `error` app-wide | US-042's recorded follow-up. This change only widens the scoped glob to its own new routes (§12) |
| A backend `BUCKETS_ASIGNABLES` export or OpenAPI enum | Recorded follow-up; §8 contains the drift with a test instead |

---

## Approach

### 1. Routes and information architecture

Three URL levels, matching frame 3's breadcrumb:

| URL | Screen | Chrome |
|---|---|---|
| `/configuracion` | Perfil (shipped) | `Configuración` h1 + section tabs |
| `/configuracion/categorias` | CA-01 list | `Configuración` h1 + section tabs |
| `/configuracion/categorias/:categoriaId` | CA-02 edit | **Breadcrumb, not tabs** |

Two consequences design must handle:

- **`configuracion.tsx` becomes a layout route with an `<Outlet/>`**, and Perfil's content moves to a `configuracion.index` leaf. The tabs are genuinely shared chrome (both frames draw them), so rendering them once in the layout is the truthful model and makes the `Categorías` tab a real `<Link>` with working `aria-current`. Cost: it restructures a shipped route and its tests.
- **The edit screen must not inherit the tab shell** — frame 3 replaces the tabs with a breadcrumb. TanStack Router's flat-route naming supports opting a child out of a parent layout while keeping the URL (trailing `_` on a segment). Design picks the exact filenames and **verifies the semantics against the installed version** rather than trusting this note.

**There is no `GET /api/categorias/:id`.** The edit route therefore selects its category **by id out of the list query** — one query serves both screens, a cold deep-link fetches the list and resolves, and *"id not present"* is a real, reachable not-found state (stale link, or deleted in another tab) that needs a specified rendering. This also gives the edit screen `transaccionesCount` for free, satisfying decision 3 on both surfaces.

Route files stay **thin containers** (`buckets.$bucket.tsx:12-18`: a `createFileRoute` component cannot be unit-tested cheaply, so the component underneath owns the query, rendering and tests).

### 2. Data layer

New `apps/web/src/api/categorias.ts`, same discipline as `perfil.ts`/`client.ts`: never-throw `ApiResult<T>`, `credentials: 'same-origin'` through the server-side proxy (no base URL, no `x-api-key` in the browser), a runtime guard per response shape, and `403`/`404`/`409` mapped by body `code` into the discriminated `ApiError` so §8's table is a total function.

Seven calls, one query key `['categorias']`, one query hook and six mutation hooks. **`PATCH` is proven through the Vercel proxy** (US-042 shipped it) — the pre-flight risk US-042 carried does not repeat.

### 3. CA-01 — the list

Grouped by bucket in the frames' order (`Necesidades`, `Deseos`, `Ahorro`), each row: name, pattern tag, edit + delete actions. `Nueva categoría` sits page-level, beside the title.

**Pluralisation has three forms, not two** — `sin patrones` (0) · `1 patrón` (1) · `N patrones` (≥2). A naive `${n} patrón${n === 1 ? '' : 'es'}` gets `0 patrones` and misses the zero form. One pure, unit-tested helper.

CA-03's *"sin patrones = solo clasificación manual"* meaning is carried by the `sin patrones` tag here and by the explicit note on the edit screen (§4).

Empty catalog (a user who deleted all eight) is reachable and needs an empty state. **Scale is trivial** — the seed template is 8 categories / 19 patterns; no pagination, no virtualisation (`yagni`).

### 4. CA-02 — the edit screen, and its two commit semantics

Per decision 2 the screen has **two independent mutation surfaces**, and the UI must say so structurally rather than in prose:

| Surface | Commits | Controls |
|---|---|---|
| Identity (`Nombre`, `Bucket (obligatorio)`) | On `Guardar` (one `PATCH /api/categorias/:id`) | `Cancelar` · `Guardar` in the footer |
| Patterns | **Immediately, per row** (`POST`/`PATCH`/`DELETE /api/patrones`) | `Agregar patrón`, per-row delete |

The footer buttons therefore sit **below the divider that closes the patterns section** and are visually bound to the identity block only — the same "two independent calls, ordered, not atomic" honesty US-042 established for `PerfilForm`. `Cancelar` discards the identity draft and returns to the list; it does **not** undo pattern edits, and must not appear to.

A pattern row is a `matchType` dropdown + a value input. **`REGEX` may be pre-validated client-side** (`try { new RegExp(v) } catch`) purely for instant feedback — the server is authoritative either way (`400 REGEX_INVALIDA` at write time, and `coincide()` degrades a malformed regex to "no match" without throwing). Cheap, zero-risk, not blocking.

The `Bucket` dropdown is a **new component** — `configuracion/` has no `<select>` today.

### 5. Destructive confirmations — one component, two payloads

Both warnings are the **`EliminarIngestaControl` shape, not `ConfirmarPasswordDialog`**: an impact statement computed from data already on the client, hand-rolled `role="alertdialog"`, focus to the confirm button on open, Escape cancels and restores focus to the trigger, errors stay inline (the dialog does **not** close on failure — retry in place). No code in the 11-code table requires password re-entry on this surface, so there is nothing to gate.

| | Trigger | Impact sentence source | Zero case |
|---|---|---|---|
| **CA-04 delete** | Red `Eliminar categoría` / row action | `transaccionesCount` (decision 3, 5) — *N transactions become `Sin categoría`* | `transaccionesCount === 0` → soften or skip, mirroring `EliminarIngestaControl`'s "0 movimientos" avoidance |
| **Decision 1 bucket change** | `Guardar` when `bucket` is dirty | `transaccionesCount` + old→new bucket — *money moves across **all** periods, not just this month* | Same |

One component, two payloads (`dry`). Note the precedent: `WCAT-04` already established *"a cross-bucket reclassify requires confirmation"* for a **single** transaction. Decision 1 is the same rule applied to `transaccionesCount` of them at once — the copy should be at least as alarming.

### 6. CA-05 — the invalidation matrix

Verified ground truth: **pattern CRUD has zero effect on any persisted transaction or cached dashboard query.** `PatronClasificacion.coincide()` runs only inside `ProcessIngestaUseCase` at import time. Category mutations are the opposite — a bucket change re-stamps history.

Two profiles, not seven rules:

| Profile | Invalidates | Used by |
|---|---|---|
| **A — catalog only** | `['categorias']` | all three pattern mutations |
| **B — catalog + dashboard** | `['categorias']` + **broad** `['resumen']`, `['resumen-anual']`, `['detalle-bucket']` (prefix keys, no period/bucket segment) | all three category mutations |

Broad prefix keys are the `use-eliminar-ingesta`/`use-ingesta` precedent, and they are **required** here for the same reason: the Configuración screen has no idea which periods the dashboard has cached, and a bucket change touches the user's entire history. The narrow exact-key style of `use-reclasificar-categoria` is unusable — it works only because that caller knows its own visible period and bucket.

Profile B over-invalidates a pure rename by one cheap refetch. Under-invalidating a bucket change ships a dashboard whose 50/30/20 split no longer exists, silently. **Asymmetric cost, so bias broad** (`kiss`). Profile A's exclusion of the dashboard is deliberate and documented, not laziness. After a successful delete from the edit screen, navigate back to the list.

### 7. Repairing the reclassify dropdown (decision 6)

`apps/web/src/domain/categoria.ts` hardcodes `ORDEN_CATEGORIAS` (8 names) and `CATEGORIA_BUCKET` (name→bucket). Three shipped behaviours break the moment this change ships:

| User action in US-043 | Broken dashboard behaviour today |
|---|---|
| Creates `Mascotas` | Never offered by the reclassify `<select>` — unreachable, though `PATCH /api/transacciones/:id/categoria` would accept it |
| Renames `Supermercado` | The stale name is still offered and now yields `400 CategoriaDesconocidaError` |
| Re-buckets a category | `CATEGORIA_BUCKET` is wrong → `WCAT-04`'s cross-bucket money-move confirmation fires wrongly, **or is skipped entirely** |
| Deletes a category | Still offered |

Fix: `ReclasificarCategoriaControl` consumes `useCategorias()` — the query this change already introduces — groups by `categoria.bucket` from the DTO and derives the destination bucket from it. `domain/categoria.ts`'s three exports are deleted.

**Honest blast radius** (this is the only slice touching shipped dashboard surfaces): `ReclasificarCategoriaControl` + test, `domain/categoria.ts` + `categoria.test.ts` (deleted), `categoria.mirror.spec.ts` (its subject disappears), `agrupar-detalle-por-categoria.ts`'s `ordinal()` — which sorts by `ORDEN_CATEGORIAS.indexOf` and needs a new rule (alphabetical, `Sin categoría` last) — plus `category-icons.test.ts`'s import. `iconoDeCategoria` **needs no change**: it already falls back to `Receipt` for unrecognised names, so user-created categories degrade gracefully today.

**Alternative if the maintainer wants US-043 kept purely additive**: defer §7 to a follow-up issue and ship the known defect. Recorded, not recommended — the debt was assigned here by name three times, and this change is what makes it reachable.

### 8. Constants, copy, and drift containment

**No `GET /buckets` list endpoint exists**, and the generated contract types `bucket` and `matchType` as plain `string` (`packages/api-client/src/types.gen.ts:1699,1705`) — **there is no compile-time link web↔api for either.** The backend's `BUCKETS_ASIGNABLES` (`Necesidades`/`Deseos`/`Ahorro`; `Ingreso`/`SinCategoria` are computed and never assignable) is duplicated in two use-case files with no shared export. A web constant makes three copies.

**Containment**: a source-text drift-guard test, the mechanism this repo has already built and re-pointed once (`categoria.mirror.spec.ts` reads a backend file as **plain text** — never imports it, so ADR-008 holds, because it is a test). One guard asserts the web's `BUCKETS_ASIGNABLES` and `MATCH_TYPES` match the backend arrays, and fails loudly with the file path if either backend file moves. Cost: one test file. It buys a CI failure instead of a silent 400 in production. A backend shared export or an OpenAPI enum would be strictly better and is recorded as a follow-up — it is an `apps/api` change, out of scope here.

**Labels are the client's job** (ADR-024). `matchType` wire → UI: `CONTAINS`→`CONTIENE`, `STARTS_WITH`→`EMPIEZA CON`, `REGEX`→`REGEX`. Buckets reuse `ETIQUETA_BUCKET` per **A1**.

**Verbatim wireframe copy**, with the accented shipping string per **A3**:

| Where | Frame (as drawn) | Ship |
|---|---|---|
| Title | `Categorias y patrones` | `Categorías y patrones` |
| Button | `Nueva categoria` | `Nueva categoría` — **and `Nueva` at tablet width** (T2 draws it 111px, shortened). A responsive label, not two components |
| Subtitle | `Tu catalogo propio: toda categoria pertenece a un bucket. Los patrones permiten la auto-categorizacion.` | `Tu catálogo propio: toda categoría pertenece a un bucket. Los patrones permiten la auto-categorización.` |
| Tag | `3 patrones` · `1 patron` · `sin patrones` | `3 patrones` · `1 patrón` · `sin patrones` |
| Breadcrumb | `Configuracion` / `Categorias` / `Supermercado` | `Configuración` / `Categorías` / `{nombre}` |
| Edit title | `Editar categoria` | `Editar categoría` |
| Fields | `Nombre` · `Bucket (obligatorio)` | unchanged |
| Section | `Patrones de auto-categorizacion` · `Agregar patron` | `Patrones de auto-categorización` · `Agregar patrón` |
| CA-03 note | `Sin patrones, la categoria solo se puede asignar manualmente.` | `Sin patrones, la categoría solo se puede asignar manualmente.` |
| Delete | `Eliminar categoria` | `Eliminar categoría` |
| Footer | `Cancelar` · `Guardar` | unchanged |
| Annotations (**A4**, not rendered) | `Eliminar una categoria en uso muestra advertencia: sus transacciones pasan a Sin categoria.` · `Advertencia previa: sus transacciones pasan a Sin categoria` | — |

**Error copy** is a closed `status:code` table over all **11 codes** plus `BODY_INVALIDO`, in the shape of `mensajes.ts` — client constants selected by status + code, never a server-supplied string, closed with a `never` exhaustiveness guard. `MENSAJE_DEMO_SOLO_LECTURA` is reused verbatim.

### 9. Demo sessions and reachable states

`esDemo` returns `403 DEMO_SOLO_LECTURA` on **every** mutation. Both layers ship, as in `PerfilForm`: proactively disabled controls with a `role="note"` explanation, plus the defensive `403` mapping. **The read path still renders** — a demo user sees their own catalog, read-only.

Other reachable states needing a specified rendering: empty catalog, category with zero patterns, `transaccionesCount === 0`, and `:categoriaId` absent from the list (§1).

### 10. Directory structure

`components/configuracion/` is six files today and this change more than doubles it. Propose the split **now**:

```
components/configuracion/
  ConfiguracionLayout.tsx  ConfiguracionTabs.tsx  CampoTexto.tsx   ← shared shell
  perfil/      PerfilForm  GoogleVinculoSection  ConfirmarPasswordDialog  mensajes.ts
  categorias/  CategoriasPanel  CategoriaFila  EditarCategoria  CampoSelect
               PatronesSection  PatronFila  ConfirmarImpactoDialog  mensajes-catalogo.ts
```

Moving US-042's files into `perfil/` is a **pure rename**: GitHub collapses renames, so the review cost is near zero and only a handful of import lines actually change. The scoped a11y tier survives — the glob is already `src/components/configuracion/**/*.tsx`.

### 11. CA-06 — tablet (T2/T3)

**Read 2026-08-14. The default position holds — confirmed by measurement, not assumed.**

US-042 shipped a **fluid** grid (`max-w-5xl` + `grid-cols-1 lg:grid-cols-[200px_1fr]`) using the shell's existing `lg` breakpoint and **no new tier in `layout.ts`** (`WCFG-11`, binding decision 6).

| Element | Frame 2 (1080) | T2 (880) | Behaviour |
|---|---|---|---|
| Tab column | `113×88` | `113×88` | **Fixed — byte-identical** |
| Content column | 760 | 534 | Fluid |
| Gutter tabs→content | 119 | 81 | Fluid |

A fixed sidebar beside a fluid content column **is** `grid-cols-[200px_1fr]`, resized. T3 behaves the same way: `Nombre`+`Bucket` stay side by side (444+220 → 356+200) and the pattern rows shrink proportionally. **CA-06 requires no new tier.**

What the reading *did* change is elsewhere: the footer contradiction (decision 10) and the previously unseen mobile frames (decision 8). Full evidence in `wireframes-extracted.md`.

### 12. Tests and gates

Strict TDD is active (`openspec/config.yaml: strict_tdd: true`). Every new `api/use-*.ts` gets a paired `.test.tsx` — the existing density in `apps/web/src/api/`.

Named coverage: the three-form pluralisation helper; both confirmation dialogs (focus in, Escape restores, error keeps the dialog open); the invalidation matrix (a pattern mutation **must not** invalidate `['resumen']`; a bucket change **must**); every row of the 11-code table asserted verbatim; the drift guard; `:categoriaId` not found; demo disabled + defensive `403`; a11y via `getByLabelText` on every input.

**Widen the a11y glob.** `eslint.config.js:88` scopes the `error` tier to the single file `src/routes/_authenticated/configuracion.tsx`. The new route files **are not covered** — the directory glob reasoning was applied to components only. One-line fix, easy to miss.

```
pnpm web typecheck   # tsr generate && tsc -b — the ONLY typecheck; new routes make tsr generate mandatory
pnpm web test        # vitest run — does NOT typecheck
pnpm web lint        # eslint . — the scoped jsx-a11y tier
```

---

## Affected areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Contracts deployed. Zero files — a change here means the proposal was misread |
| `src/routes/_authenticated/configuracion.tsx` | **Modified** | Becomes a layout with `<Outlet/>` |
| `src/routes/_authenticated/configuracion.index.tsx`, `configuracion.categorias*.tsx` | **New** | Thin containers (§1) |
| `src/api/categorias.ts` + hooks (+ tests) | **New** | 7 calls, guards, code mapping, 2 invalidation profiles |
| `src/components/configuracion/categorias/**` | **New** | List, edit, patterns, dropdown, confirm dialog, copy table |
| `src/components/configuracion/{ConfiguracionPage,ConfiguracionTabs}.tsx` | **Modified** | Layout split, `Configuración` h1 (**A2**), tab → `Link` |
| `src/components/configuracion/perfil/**` | **Moved** | Pure rename (§10) |
| `src/components/ReclasificarCategoriaControl.tsx` (+ test) | **Modified** | Data-driven (§7) |
| `src/domain/categoria.ts`, `categoria.test.ts`, `categoria.mirror.spec.ts` | **Removed** | Enum mirror retired (§7) |
| `src/domain/agrupar-detalle-por-categoria.ts` (+ test) | **Modified** | New ordering rule (§7) |
| `src/lib/category-icons.test.ts` | **Modified** | Loses its `ORDEN_CATEGORIAS` import. `category-icons.ts` itself unchanged |
| `apps/web/eslint.config.js` | **Modified** | Widen the route glob (§12) |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **A bucket change silently rewrites closed months** | High | **High** | Decision 1's warning + profile B invalidation. The single most dangerous operation; both must land in the same slice |
| ~~T2/T3 unread — CA-06 built on an assumption~~ | — | — | **Retired 2026-08-14.** Frames read and measured; the assumption held (§11) |
| **Mobile ships visibly unfinished** — the floor (decision 8) keeps desktop structure at 360px | Medium | Low | Deliberate and recorded, with **US-063 (#332)** owning the redesign. The floor's three guarantees (no overflow, stacked fields, ≥24×24 targets) are testable and must be asserted, not assumed |
| **Bucket / matchType drift** — three copies, no compile-time link | Medium | Medium | §8's source-text drift guard; backend export recorded as follow-up |
| **§7 regresses shipped dashboard behaviour** | Medium | Medium | Its own final PR slice so the regression surface is isolated for review; `WCAT-02`/`WCAT-04` scenarios must stay green |
| **Two commit semantics on one screen confuse the user** — `Cancelar` appears to undo pattern edits | Medium | Medium | §4's structural separation; the copy must never imply pattern edits are pending |
| **Invalidation gets a blanket rule** and either wastes or, worse, misses | Medium | Medium | §6 is a two-profile table with tests asserting both the inclusion and the **exclusion** |
| **`Deseos`/`Gustos` ships inconsistently** (**A1**) | High | Medium | Issue action item; one label source (`ETIQUETA_BUCKET`) |
| **Layout restructure breaks US-042's shipped route** | Medium | Medium | `WCFG-01..13` scenarios are the regression net; the restructure lands in slice 1, alone |
| **Someone hunts for a 409 on delete that does not exist** | Medium | Low | Decision 5 states it in the proposal, the spec and the code comment |
| **Unaccented copy ships** (**A3**) | Medium | Low | §8's two-column table |
| **`prioridad` invented as a UI control** | Low | Low | Out of scope; send the API default |

## Rollback plan

1. **No migration, no server state, no data transformation.** `git revert` + redeploy: the routes disappear, the `Categorías` tab returns to an inert placeholder, the reclassify `<select>` returns to its hardcoded eight.
2. **Catalog rows created before the revert survive** — they are ordinary API state written by deployed, unreverted endpoints.
3. **The one real trap**: after a revert, a user who created or renamed categories has catalog rows the restored hardcoded dropdown **cannot offer** — reclassifying into them becomes impossible from the web until redeploy. No data damage; the API and every other client still resolve them. This is §7's defect returning, which is the argument for §7 in the first place.
4. Reverting **only** §7's slice while keeping the CRUD is the worst combination — it ships the CRUD with the known-broken dropdown. If a partial revert is ever needed, revert the CRUD slices too.

## Capabilities

### New capabilities

None.

### Modified capabilities

- **`web-app`** — a new `WCTG-*` requirement family (web catálogo) for the route hierarchy and breadcrumb, the grouped list and three-form tag, the edit screen's two commit semantics, both impact confirmations, the invalidation matrix, the copy table, demo behaviour and the tablet variants. Follows the file's per-feature prefix convention (`WCAT-*`, `WPER-*`, `WMYP-*`, `WCFG-*`). **Deltas also needed on**: `WCFG-01`/`WCFG-11`/`WCFG-12` (route becomes a layout; new routes join the a11y glob), and `WCAT-02`/`WCAT-04` (grouping order and the reclassify dropdown become data-driven — §7). `web-app`'s Non-Goals line *"The `Categorías` section's real content (US-043; the tab renders inert)"* is retired.
- **`catalogo-clasificacion-ownership`** — **housekeeping only**: the Non-Goals line *"Any web or mobile UI for catalog management — deferred to future work (US-043)"* narrows to mobile. **No requirement changes** — every endpoint is consumed exactly as specified.

## Success criteria

- [ ] **CA-01** — `/configuracion/categorias` lists the caller's own categories grouped by bucket, each row showing `N patrones` / `1 patrón` / `sin patrones`, edit + delete actions, and a `Nueva categoría` button
- [ ] **CA-02** — the edit screen is its own deep-linkable route with the frame-3 breadcrumb; `Nombre` + required `Bucket` commit on `Guardar`; patterns (`CONTIENE`/`EMPIEZA CON`/`REGEX` + value) commit per row, immediately
- [ ] **CA-03** — a category with zero patterns shows the note, verbatim
- [ ] **CA-04** — the red delete shows the `transaccionesCount` impact before confirming, and the zero case is softened. **No 409 is expected or handled** (decision 5)
- [ ] **Decision 1** — a dirty `Bucket` cannot be saved without an all-periods impact confirmation
- [ ] **CA-05** — a category mutation invalidates `['categorias']` **and** the three broad dashboard keys; a pattern mutation invalidates **only** `['categorias']`. Both asserted by test
- [ ] **CA-06** — T2/T3 render correctly with **no new tier in `layout.ts`**, or the deviation is justified against the frames once read
- [ ] The reclassify dropdown offers a just-created category and no longer offers a deleted one; `src/domain/categoria.ts` is gone
- [ ] The drift guard fails when the backend's assignable-bucket list changes
- [ ] Zero files changed under `apps/api/` and `apps/mobile/`
- [ ] `pnpm web typecheck`, `pnpm web test` and `pnpm web lint` all green

## Delivery forecast

**Chained PRs recommended: Yes** · **400-line budget risk: High** · **Decision needed before apply: Yes**
Strategy: `ask-on-risk` · `feature-branch-chain` (PR #1 → tracker branch; each later PR → the previous PR's branch).

**Calibration — `sdd-tasks` must apply this.** US-042 was a comparable frontend-only change and landed **~4600 production + test lines across three chained PRs**, two of which needed a `size:exception`. Its `sdd-tasks` forecast ran **1.7–3.1× low on every slice** because it sized production code while Strict TDD obliges roughly **1.4×** that again in tests. US-043 is **larger**: seven endpoints instead of four, two screens instead of one, two destructive confirmations, an invalidation matrix, and a shipped-surface repair. Size production code, multiply by ≥2.4 for the total, and treat any slice forecast under 250 production lines with suspicion.

Indicative slicing — `sdd-tasks` owns the binding version:

| PR | Content | Stands alone because |
|---|---|---|
| **#1 — Shell + data layer** | Layout restructure, `configuracion.index`, tab → `Link`, `Configuración` h1, directory split, `api/categorias.ts` + `useCategorias` + guards, copy table, drift guard, eslint glob | Infra-first, mirroring US-042's own PR #1a. The restructure of a shipped route gets a review of its own |
| **#2 — CA-01 + CA-03** | The grouped list, three-form tag, `sin patrones`, empty states, demo read path | First visible value; read-only, so zero mutation risk |
| **#3 — Create + identity edit + decision 1** | `Nueva categoría`, the edit route, `CampoSelect`, `Guardar`/`Cancelar`, the **bucket-change impact confirm**, profile B invalidation | The highest-risk slice, isolated: money moving across all periods is one reviewer's whole job |
| **#4 — Patterns CRUD** | Pattern rows, add/edit/delete, matchType labels, REGEX pre-validation, profile A invalidation | Independent surface (decision 2), independent endpoints, independent invalidation profile |
| **#5 — CA-04 delete + CA-06 tablet** | Delete impact dialog reusing #3's component, tablet variants once T2/T3 are read | Delete is the second payload of an existing component; tablet is CSS-only |
| **#6 — Reclassify repair (§7)** | Data-driven dropdown, enum mirror deleted, ordering rule, test fallout | The **only** slice touching shipped dashboard surfaces. Isolating it means a reviewer sees the regression risk unmixed with new-feature noise |

## Open questions (resolve in design; none blocks `sdd-spec` except the starred one)

1. ~~★ T2/T3 must be read before `sdd-design`~~ — **RESOLVED**: read, measured, assumption confirmed (§11).
2. ~~Are frame 2's footer and frame 3's delete-adjacent sentence annotations or rendered copy?~~ — **RESOLVED**: rendered copy, per-breakpoint (**A4**, decision 9's sibling evidence).
3. **`Deseos` or `Gustos`** (**A1**). Leaning: `Gustos` on screen, `Deseos` on the wire.
4. **Does `Nueva categoría` open the same edit route (`/nueva`) or an inline creation row?** The frames do not draw the creation screen. Leaning: reuse the edit route — one screen, one set of tests (`dry`).
5. **Does a `Guardar` that changes only `Nombre` need any dashboard invalidation?** §6 says yes via profile B, deliberately over-invalidating. Confirming whether `ResumenMesDto` carries a per-category breakdown would let profile B split, but the saving is one cheap refetch — likely not worth a third profile (`kiss`).
6. **Delete from the list row vs. only from the edit screen.** Frame 2 draws two row icons; frame 3 draws a delete button too. Leaning: both, one shared dialog.
7. **`prioridad`** — hidden and defaulted (leaning), or exposed once patterns can conflict.
