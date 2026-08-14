# Design: US-043 — Web Configuración, Categorías section

- **Change**: `us-043-web-configuracion-categorias`
- **Status**: Designed (2026-08-14)
- **Inputs**: `proposal.md` (binding decisions 1–10, §0–§12, open questions 1–7) ·
  `wireframes-extracted.md` (nine frames, measured)
- **Consumes (deployed, canonical, zero API work)**:
  `openspec/specs/catalogo-clasificacion-ownership/spec.md` (`CAT038-*`, `CAT039-*`)
- **Extends**: `openspec/changes/archive/2026-08-13-us-042-web-configuracion-perfil/design.md`
  (Q-then-D structure, `never`-guarded copy tables, CORRECTION-marked departures, thin route files)
- **New ADR**: **No.** ADR-005/008 (web never imports `apps/api` in production code), ADR-016
  (Vitest), ADR-018 (a11y by layers, WCAG 2.2 AA), ADR-024 (backend computes, client renders),
  ADR-036/037 (the catalog is a per-user row set, not a closed enum) applied. Nothing deviates.

Departures from the proposal are marked **CORRECTION** and carry their reason. There are **five**
(§1/Q1c, §1/Q4b, §1/Q6c, §1/Q8b, §1/Q10c).

---

## 0. Framing — the three things this document exists to pin down

Most of this change is repo idiom: a never-throw `ApiResult<T>` client like `perfil.ts`, a
hand-rolled `role="alertdialog"` like `EliminarIngestaControl`, `<label>`-wrapped inputs like
`CampoTexto`, `vi.stubGlobal('fetch')` tests. Three things are not, and they are what this design
resolves:

1. **A three-level route hierarchy where the third level must escape the second level's chrome.**
   The mechanism is TanStack Router's trailing-underscore segment. It was **verified in the
   installed generator's source**, not taken from the proposal's note (§1/Q1).
2. **One screen with two commit semantics, and the layout mitigation the frames removed.** Decision
   10 puts the destructive action in the same footer row as `Cancelar`/`Guardar`, which deletes
   §4's stated structural honesty. This design replaces it with **DOM semantics plus behaviour**
   (`form=` association, per-row pattern announcements, disambiguated accessible names) instead of
   dropping the obligation (§1/Q3).
3. **An invalidation matrix whose *exclusion* is the load-bearing half.** A pattern mutation
   invalidating `['resumen']` is waste; a category mutation *not* invalidating it ships a dashboard
   whose 50/30/20 split no longer exists. Both directions are asserted with exact array equality
   (§1/Q5).

Everything else is subordinate to those three.

---

## 1. Open questions resolved

### Q1 — Routes: the exact filenames, verified against the installed generator

#### Q1a — The four files

Installed versions (`pnpm-lock.yaml`): `@tanstack/react-router@1.170.15`,
`@tanstack/router-cli@1.167.17`, `@tanstack/router-generator@1.167.17`.

| File | URL | Parent in the tree | Renders |
|---|---|---|---|
| `src/routes/_authenticated/configuracion.tsx` | — (layout) | `_authenticated` | `ConfiguracionLayout` + `<Outlet/>` |
| `src/routes/_authenticated/configuracion.index.tsx` | `/configuracion` | `configuracion` | `PerfilPanel` |
| `src/routes/_authenticated/configuracion.categorias.tsx` | `/configuracion/categorias` | `configuracion` | `CategoriasPanel` |
| `src/routes/_authenticated/configuracion_.categorias.$categoriaId.tsx` | `/configuracion/categorias/{id}` | **`_authenticated`** | `EditarCategoria` |

The fourth row is the whole point: the **trailing** `_` on `configuracion` un-nests the edit route
from `configuracion.tsx` while keeping the URL segment.

#### Q1b — Why that works, from the installed source (not from the docs)

Two functions decide it, both in
`node_modules/.pnpm/@tanstack+router-generator@1.167.17/node_modules/@tanstack/router-generator/dist/esm/`:

**Parenting is segment-boundary exact** — `utils.js:24-35`, `RoutePrefixMap.findParent`:

```js
findParent(routePath) {
  let searchPath = routePath;
  while (searchPath.length > 0) {
    const lastSlash = searchPath.lastIndexOf("/");
    if (lastSlash <= 0) break;
    searchPath = searchPath.substring(0, lastSlash);
    const parent = this.prefixToRoute.get(searchPath);   // ← EXACT map lookup
    if (parent && parent.routePath !== routePath) return parent;
  }
  return null;
}
```

It strips one segment at a time and does an **exact** `Map.get`, so it never matches a partial
segment. For our edit route, `routePath = /_authenticated/configuracion_/categorias/$categoriaId`:

| Candidate tried | In the map? |
|---|---|
| `/_authenticated/configuracion_/categorias` | no (no such file) |
| `/_authenticated/configuracion_` | no |
| `/_authenticated` | **yes → parent** |

`/_authenticated/configuracion` is **never** tried, because `configuracion_` and `configuracion`
are different segments and the lookup is exact. The edit route therefore hangs off
`_authenticated` and never renders inside `configuracion.tsx`'s `<Outlet/>`.

**The underscore is stripped from the matched path** — `generator.js:716` computes
`node.cleanedPath = removeGroups(removeLayoutSegmentsAndUnderscoresWithEscape(node.path, …))`, and
`utils.js:290-295`:

```js
function removeUnderscoresFromSegment(segment, metadata) {
  if (result.startsWith("_") && !metadata?.literalLeadingUnderscore) result = result.slice(1);
  if (result.endsWith("_")   && !metadata?.literalTrailingUnderscore) result = result.slice(0, -1);
  return result;
}
```

`configuracion_` → `configuracion`. `inferFullPath` (`utils.js:487-492`) runs the same removal, so
the generated `fullPath` is `/configuracion/categorias/$categoriaId`. Deep-linking, browser-back
and `<Link to="/configuracion/categorias/$categoriaId">` all work on the clean URL.

> A literal trailing underscore in a real path segment is escaped as `[_]`
> (`hasEscapedTrailingUnderscore`, `utils.js:198`). Not needed here, recorded so nobody reads the
> stripping as unconditional.

**Consequence for the list route**: `configuracion.categorias.tsx` stays a **leaf**. The edit route
is on a different branch, so it never becomes a child, so `CategoriasPanel` never needs an
`<Outlet/>`. That is why the list is `configuracion.categorias.tsx` and not
`configuracion.categorias.index.tsx` — no virtual parent is created and no extra file exists.

#### Q1c — **CORRECTION: `validateSearch` stays on the layout route, and the `?google=` effect moves to the index leaf**

The proposal's §1 says only that `configuracion.tsx` becomes a layout. It does not say what happens
to US-042's `validateSearch` and `?google=` read/clean effect, which live in that exact file today
(`configuracion.tsx:40-79`). Splitting them wrong regresses `WCFG-05`.

**Decision, split in two:**

- **`validateSearch` stays on `configuracion.tsx`.** The shipped `WCFG-05` scenarios target the
  route id `/_authenticated/configuracion`; moving the schema to the index leaf would change the
  route that owns the contract and force those tests to be rewritten for no gain. Cost:
  `/configuracion/categorias?google=vinculado` is also "valid" — it renders nothing and is harmless
  (the narrowing already drops everything else).
- **The `useState` capture + the cleanup effect + `markSkipNextAuthRefetch()` move to
  `configuracion.index.tsx`**, verbatim, because they describe *Perfil's* landing, not the section
  shell. The leaf reads the param with an explicit `from`, so nothing depends on search-param
  inheritance typing:

```ts
const { google } = useSearch({ from: '/_authenticated/configuracion' });
```

`router.history.replace('/configuracion')` is unchanged — it already targets the index URL.

#### Q1d — The edit screen has no h1 from the layout, so it renders its own

Because the edit route escapes `ConfiguracionLayout`, it inherits **no heading**. Getting this
wrong yields either two `<h1>`s or none.

| Screen | h1 | h2 | Chrome above |
|---|---|---|---|
| `/configuracion` | `Configuración` (layout) | `Editar perfil` | section tabs |
| `/configuracion/categorias` | `Configuración` (layout) | `Categorías y patrones` | section tabs |
| `/configuracion/categorias/{id}` | `Editar categoría` (own) | `Patrones de auto-categorización` | **breadcrumb** |

Breadcrumb markup (frame 3):

```tsx
<nav aria-label="Ruta de navegación">
  <ol className="flex flex-wrap items-center gap-1 text-sm">
    <li><Link to="/configuracion">Configuración</Link></li>
    <li aria-hidden="true">/</li>
    <li><Link to="/configuracion/categorias">Categorías</Link></li>
    <li aria-hidden="true">/</li>
    <li><span aria-current="page">{categoria.nombre}</span></li>
  </ol>
</nav>
```

#### Q1e — Resolving the category by id, and the four reachable states

There is no `GET /api/categorias/:id`. The edit route selects out of the single `['categorias']`
query. Four states, all specified:

| State | Render |
|---|---|
| query pending | `<p role="status">Cargando…</p>` |
| query error | `mensajeDeErrorCatalogo(error)` in `role="alert"` + a `Volver a Categorías` link |
| ok, id present | the edit screen |
| ok, **id absent** | `<p role="status">Esa categoría ya no existe.</p>` + `Volver a Categorías` link |

`role="status"`, not `role="alert"`, for the last one: a stale deep link or a tab that deleted the
row elsewhere is not a failure of the action the user just took.

**The trap, and its guard.** After a successful delete *from the edit screen*, profile B
invalidation refetches `['categorias']` while this component is still mounted — the row is gone, so
the not-found branch would flash before the navigation lands. React Query runs the hook-level
`onSuccess` (which invalidates) **before** the `mutate`-level one (which navigates), so ordering
alone does not fix it. Guard, in `EditarCategoria`, before the not-found check:

```ts
// A delete in flight or just committed is LEAVING this screen. Rendering
// "ya no existe" for those two ticks is a flash of a false statement.
if (eliminacion.isPending || eliminacion.isSuccess) return null;
```

Pinned by a test: delete succeeds → `Esa categoría ya no existe.` is never in the document.

#### Q1f — Route files stay thin

`buckets.$bucket.tsx:12-18` is the precedent: a `createFileRoute` component cannot be unit-tested
cheaply, so each route file only extracts params/search and hands off. All four here follow it.
`EditarCategoria`, `CategoriasPanel`, `PerfilPanel` and `ConfiguracionLayout` own the queries,
the rendering and the tests.

---

### Q2 — Data layer

#### Q2a — `src/api/categorias.ts`

Same discipline as `perfil.ts`: never-throw `ApiResult<T>`, explicit
`credentials: 'same-origin'`, a shared `enviarMutacion` for the fetch/401/non-2xx mapping, and
`body.code` lifted into the discriminated `ApiError` (`client.ts:42` already carries the optional
`code` field — additive, nothing to widen).

Seven calls, verified against the deployed routes
(`apps/api/src/infrastructure/http-express/routes/{categorias,patrones}.routes.ts`):

| Function | Method + path | Success | Body read? |
|---|---|---|---|
| `fetchCatalogo()` | `GET /api/categorias` | `200 { categorias: CategoriaDto[] }` | **yes**, guarded |
| `postCategoria(input)` | `POST /api/categorias` | `201 CategoriaDto` | discarded |
| `patchCategoria(id, patch)` | `PATCH /api/categorias/:id` | `200 CategoriaDto` | discarded |
| `deleteCategoria(id)` | `DELETE /api/categorias/:id` | `204` | — |
| `postPatron(input)` | `POST /api/patrones` | `201 PatronDto` | discarded |
| `patchPatron(id, patch)` | `PATCH /api/patrones/:id` | `200 PatronDto` | discarded |
| `deletePatron(id)` | `DELETE /api/patrones/:id` | `204` | — |

**Mutation success bodies are discarded**, exactly as `patchPerfil` discards its `200` body: the
fresh state arrives through the `['categorias']` invalidation, and reading a body nobody consumes
would mean a second guard to maintain (`dry`). Only `fetchCatalogo` reads and guards.

#### Q2b — The runtime guards

```ts
function esPatronDto(v: unknown): v is PatronDto {
  // id, categoriaId, patron, matchType: string · prioridad: number
}
function esCategoriaDto(v: unknown): v is CategoriaDto {
  // id, nombre, bucket: string · transaccionesCount: number
  // patrones: Array.isArray && every(esPatronDto)
}
function esCatalogoDto(v: unknown): v is CatalogoDto {
  // { categorias: [] } envelope — Array.isArray && every(esCategoriaDto)
}
```

`transaccionesCount` is guarded as `number` and **not** range-checked: it is the input to the
impact sentence, so a missing field must be a `parse` failure rather than a silent `undefined`
interpolated into a destructive warning. `matchType` and `bucket` are guarded as **plain strings**,
not against the web's own enums — the server owns validity (ADR-024), and a category whose bucket
the web does not recognise must still be listed (Q4c), not rejected as a parse error.

`fetchCatalogo` never returns a `403`: `CAT038-08` keeps `GET` open to demo sessions.

#### Q2c — Query key and hooks

```ts
// src/api/use-categorias.ts
export const CATEGORIAS_QUERY_KEY = ['categorias'] as const;

export function categoriasQueryOptions() {
  return queryOptions({
    queryKey: CATEGORIAS_QUERY_KEY,
    queryFn: async (): Promise<CatalogoDto> => {
      const r = await fetchCatalogo();
      if (!r.ok) throw r.error;   // `query.error` is a typed ApiError
      return r.value;
    },
  });
}
export function useCategorias() { return useQuery(categoriasQueryOptions()); }
```

`['categorias']`, namespaced by the endpoint it mirrors, matching `['resumen']`, `['ingestas']`,
`['detalle-bucket']`, `['auth-me']`. **One key serves three consumers**: the list, the edit screen,
and (per §7) the dashboard's reclassify dropdown.

Six mutation hooks, each `mutationFn` throwing `result.error` — the `useEliminarIngesta` idiom, not
US-042's `ResultadoGuardado` union. Justified: unlike the profile save, every mutation here is
**one** HTTP call, so there is exactly one failure shape and no partial outcome to model as a
value. Introducing a result union for a single call would be the abstraction without the problem.

---

### Q3 — The edit screen's two commit semantics, after decision 10 removed §4's mitigation

#### Q3a — What was lost

Proposal §4 mitigated the two-commit-semantics risk with layout: *"the footer buttons sit below the
divider that closes the patterns section and are visually bound to the identity block only."*
Frames `3` and `T3` draw a **single** footer row — red `Eliminar categoría` left,
`Cancelar`/`Guardar` right (`wireframes-extracted.md` §2 C-1). Decision 10 adopts the frames. The
mitigation is gone and, per decision 10's own wording, **may not be silently dropped**.

#### Q3b — The replacement: DOM semantics and behaviour, not layout

Four mechanisms. The first two are load-bearing; the last two are cheap reinforcement.

**1. `Guardar`/`Cancelar` are associated to the identity form by the HTML `form` attribute.**

```tsx
<form id="form-identidad" onSubmit={guardarIdentidad}>
  <CampoTexto label="Nombre" … />
  <CampoSelect label="Bucket (obligatorio)" required … />
</form>

<section aria-labelledby="titulo-patrones"> … pattern rows … </section>

<footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
  <button type="button" onClick={abrirEliminar}
          aria-label={`Eliminar categoría ${categoria.nombre}`}
          className="… text-destructive">Eliminar categoría</button>
  <div className="flex items-center gap-2">
    <button type="button" form="form-identidad" onClick={cancelar}
            aria-label="Cancelar cambios de nombre y bucket">Cancelar</button>
    <button type="submit" form="form-identidad"
            disabled={guardado.isPending}>Guardar</button>
  </div>
</footer>
```

The pattern rows are **outside** `#form-identidad`. The DOM now states the binding the layout no
longer states: `Guardar`'s form owner is the identity form, and no pattern control is in it. This
is not decoration — it is the actual HTML mechanism for "this button belongs to that form", and it
is exactly true here. It also fixes a real UX gap: Enter in `Nombre` submits the identity form.

**2. Every pattern row announces its own commit.** A control that says "Patrón guardado." the
moment it saves cannot be read as pending until `Guardar`:

```tsx
<span aria-live="polite" className="sr-only">
  {mutacion.isSuccess ? 'Patrón guardado.' : ''}
</span>
```

Same idiom as `ReclasificarCategoriaControl:152-156`. This is the honesty carried by **behaviour**,
which is stronger than the layout hint it replaces: a user who edits a pattern learns immediately
that it is already committed, before they ever reach the footer.

**3. Disambiguated accessible names.** `Cancelar` → `Cancelar cambios de nombre y bucket`;
`Eliminar categoría` → `Eliminar categoría {nombre}`. The visible text stays verbatim per §8's copy
table; only the accessible name is disambiguated — the `EliminarIngestaControl:122` precedent
("the visible label stays 'Eliminar'; only the ACCESSIBLE name is disambiguated"), reused for the
same reason. WCAG 2.5.3 (Label in Name) is satisfied: each accessible name **contains** its visible
text.

**4. The footer is separated by `border-t` and the two clusters by `justify-between`**, so the red
button is never adjacent to `Guardar`. Layout still helps; it is simply no longer the only thing
carrying the claim.

#### Q3c — What is NOT built

No "unsaved changes" badge, no `beforeunload`, no prose paragraph explaining the two semantics. A
sentence explaining that the buttons mean what they say is a symptom that they do not (`kiss`).
The obligation is met structurally; adding copy on top would be the third mechanism for the same
claim.

#### Q3d — The tests that hold it

| Assertion | Why it is the right one |
|---|---|
| `getByRole('button', {name: 'Guardar'})` has `form="form-identidad"` | pins mechanism 1 as an attribute, not as a screenshot |
| submitting `#form-identidad` issues **exactly** `['PATCH /api/categorias/cat-1']` | exact array equality (US-042 Q9a idiom) — a stray `/api/patrones` call fails it |
| editing a pattern row issues **exactly** `['PATCH /api/patrones/pat-1']` and renders `Patrón guardado.` | pins mechanism 2 |
| `Cancelar` after a pattern edit issues **zero** further calls and leaves the pattern list unchanged | pins that `Cancelar` scopes to the identity draft |

> **jsdom note for the tasks phase.** Drive the identity save with `fireEvent.submit(form)`, the
> idiom `PerfilForm`'s tests already use, **not** with `userEvent.click(Guardar)`. jsdom's
> activation behaviour for a submit button associated through the `form` *attribute* is not
> something to bet a suite on. If a click does not submit in jsdom, that is a jsdom limitation —
> do **not** "fix" it by adding an `onClick` that double-fires in real browsers. Verify the click
> path once manually.

---

### Q4 — Constants, labels, grouping, and the drift guard

#### Q4a — Where each constant lives

| Constant | File | Why there |
|---|---|---|
| `BUCKETS_ASIGNABLES = ['Necesidades','Deseos','Ahorro']` | `src/api/catalogo-constantes.ts` | **wire** vocabulary, beside `types.ts` |
| `MATCH_TYPES = ['CONTAINS','STARTS_WITH','REGEX']` | `src/api/catalogo-constantes.ts` | idem |
| `ETIQUETA_BUCKET` | `src/lib/bucket-colors.ts` (**existing, unchanged**) | A1's single label source, already consumed by 4 shipped components |
| `ETIQUETA_MATCH_TYPE` | `components/configuracion/categorias/mensajes-catalogo.ts` | UI copy, used only by this feature |

`ORDEN_BUCKETS` is **not a new constant** — the frames' group order
(`Necesidades`, `Deseos`, `Ahorro`) is `BUCKETS_ASIGNABLES` itself, in its own order. Two names for
one array would be the drift (`dry`).

`ETIQUETA_MATCH_TYPE`: `CONTAINS → CONTIENE`, `STARTS_WITH → EMPIEZA CON`, `REGEX → REGEX`.
Typed `Record<MatchType, string>` over the literal union, so an added match type stops compiling.

**A1, in one place.** `CampoSelect` renders `value={bucket}` with
`label={ETIQUETA_BUCKET[bucket] ?? bucket}`. Display `Gustos`, send `Deseos`, one source, zero new
mapping. The list's group headings use the same lookup.

#### Q4b — **CORRECTION: the drift guard replaces `categoria.mirror.spec.ts`'s mechanism, not its subject — and the 8-name pin is deliberately retired**

`apps/web/src/domain/categoria.mirror.spec.ts` is deleted by §7 because all three of its `it`
blocks assert against `ORDEN_CATEGORIAS`/`CATEGORIA_BUCKET`, which disappear. A reviewer will ask
what happened to the coverage. The answer must be in this document, not discovered in review:

**The 8-template-name pin is retired on purpose.** After §7 the web holds **no hardcoded category
list** — that is §7's entire point. There is nothing left to drift from the backend's 8 template
names, so a guard pinning them would pin a fact neither side uses at runtime. What *can* drift is
the bucket/matchType vocabulary the web must send on the wire, and that is what the new guard pins.
This is a net change of subject, not a net loss.

**New file: `src/api/catalogo-constantes.mirror.spec.ts`**, beside the constants it guards. Reuses
`categoria.mirror.spec.ts`'s exact mechanism — read the backend file as **plain text**, never
import it (ADR-008 holds because this is a test), resolve the path from `import.meta.url`, and fail
loudly with the full path when the file moves.

Four backend sources, all verified present today:

| Backend file | Symbol | Line |
|---|---|---|
| `apps/api/src/application/use-cases/crear-categoria.use-case.ts` | `BUCKETS_ASIGNABLES` | `:17` |
| `apps/api/src/application/use-cases/actualizar-categoria.use-case.ts` | `BUCKETS_ASIGNABLES` | `:16` |
| `apps/api/src/application/use-cases/crear-patron.use-case.ts` | `MATCH_TYPES` | `:19` |
| `apps/api/src/application/use-cases/actualizar-patron.use-case.ts` | `MATCH_TYPES` | `:17` |

```ts
// apps/web/src/api/catalogo-constantes.mirror.spec.ts → repo root is 4 levels up,
// same depth as the domain/ guard this replaces.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const bloque = (fuente: string, nombre: string) => {
  const m = fuente.match(new RegExp(`const ${nombre}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(
    `No se encontró "const ${nombre} = [ … ]". El archivo del backend cambió de formato — ` +
    `actualiza el parser en catalogo-constantes.mirror.spec.ts.`);
  return [...m[1].matchAll(/['"]([A-Z_a-z]+)['"]/g)].map((x) => x[1]);
};
```

Four assertions:

1. web `BUCKETS_ASIGNABLES` equals each backend copy — **in order** (`toEqual` on the array, not on
   a `Set`: the order is the frames' group order and a reordering is a real UI change)
2. web `MATCH_TYPES` equals each backend copy, in order
3. the **two** backend `BUCKETS_ASIGNABLES` copies equal **each other**
4. the two backend `MATCH_TYPES` copies equal each other

Assertions 3–4 are not padding: the proposal names "three copies, no compile-time link" as the
risk, and today two of those three are on the backend with only a comment linking them
(`actualizar-categoria.use-case.ts:15` — *"ver crear-categoria.use-case.ts (misma regla)"*). A
guard that only compares web-to-one-backend-copy would pass while the backend drifted from itself.

`readFileSync` stays wrapped in the existing try/catch shape so a moved file produces a message
naming the path, not an ENOENT stack.

**Recorded follow-up, unchanged**: a backend shared export or an OpenAPI enum is strictly better and
is an `apps/api` change, out of scope here.

#### Q4c — Grouping is a total function over whatever the API returns

```ts
export function agruparPorBucket(categorias: readonly CategoriaDto[]) {
  const conocidos = BUCKETS_ASIGNABLES.map((b) => ({
    bucket: b, categorias: categorias.filter((c) => c.bucket === b),
  })).filter((g) => g.categorias.length > 0);

  const otros = categorias.filter((c) => !BUCKETS_ASIGNABLES.includes(c.bucket as never));
  return otros.length === 0 ? conocidos : [...conocidos, { bucket: 'Otros', categorias: otros }];
}
```

Pure, unit-testable, no React. The `otros` branch is unreachable through the deployed API
(`CAT038-01` makes only the three assignable) — it exists so an unexpected bucket **lists** rather
than vanishing. A category the user cannot see is worse than one in an oddly-named group. One
`filter`, zero speculation about *which* other buckets might appear (`yagni`).

Empty groups are dropped, so a user with nothing in `Ahorro` sees no `Ahorro` heading.

---

### Q5 — The invalidation matrix, as code, with its exclusion

#### Q5a — Two profiles, two exported functions

```ts
// src/api/categorias-invalidacion.ts
import type { QueryClient } from '@tanstack/react-query';
import { CATEGORIAS_QUERY_KEY } from './use-categorias';

/**
 * Perfil A — SOLO catálogo. Las tres mutaciones de PATRÓN.
 * `PatronClasificacion.coincide()` corre únicamente dentro de
 * `ProcessIngestaUseCase` al importar: crear/editar/borrar un patrón NO toca
 * ninguna transacción persistida ni ningún total del dashboard. La EXCLUSIÓN
 * de `['resumen']` es deliberada y está cubierta por test.
 */
export function invalidarCatalogo(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: CATEGORIAS_QUERY_KEY });
}

/**
 * Perfil B — catálogo + las tres claves AMPLIAS del dashboard. Las tres
 * mutaciones de CATEGORÍA. Claves de PREFIJO (sin período ni bucket): esta
 * pantalla no sabe qué períodos tiene cacheados el dashboard, y un cambio de
 * bucket re-estampa TODO el historial (CAT038-03). Precedente:
 * `use-eliminar-ingesta.ts:39-44`.
 */
export function invalidarCatalogoYDashboard(qc: QueryClient): void {
  invalidarCatalogo(qc);
  void qc.invalidateQueries({ queryKey: ['resumen'] });
  void qc.invalidateQueries({ queryKey: ['resumen-anual'] });
  void qc.invalidateQueries({ queryKey: ['detalle-bucket'] });
}
```

Every mutation hook's `onSuccess` is one call to one of these two. Six hooks, two behaviours, one
place to change either (`dry`); the choice is visible at each call site (`kiss`).

The narrow exact-key style of `use-reclasificar-categoria.ts:53-60` is **unusable here** and the
reason is mechanical, not stylistic: that hook receives `periodo` and `bucket` as arguments because
its caller (`BucketDetailList` → `ReclasificarCategoriaControl`) already knows both. Configuración
knows neither.

#### Q5b — Open question 5 resolved, and profile B's `detalle-bucket` leg upgraded from defensive to required

The proposal asks whether a rename-only `Guardar` needs dashboard invalidation, and leans "yes,
deliberately over-invalidating". **Verified: for `['detalle-bucket']` it is not over-invalidation,
it is mandatory.** `agrupar-detalle-por-categoria.ts:93` groups by `tx.categoria?.nombre` and
`:103` renders that name as the group heading. A rename therefore changes what the bucket drill-down
displays. Without the invalidation the drill-down keeps showing the old name until the cache
expires.

`['resumen']` and `['resumen-anual']` genuinely are over-invalidated by a rename (they carry bucket
totals, not category names). Cost: one cheap refetch. A third profile to save it is not worth the
branch (`kiss`), and the asymmetry argument stands — under-invalidating a bucket change ships a
dashboard whose 50/30/20 split no longer exists, silently.

#### Q5c — The tests, including the exclusion

Exact array equality on the captured keys, so a **third** key fails the test. The weaker
`not.toHaveBeenCalledWith(['resumen'])` passes vacuously if the key spelling ever drifts:

```ts
const espia = vi.spyOn(queryClient, 'invalidateQueries');
const claves = () => espia.mock.calls.map(([arg]) => arg?.queryKey);

// pattern mutation — the EXCLUSION
expect(claves()).toEqual([['categorias']]);

// category mutation — the INCLUSION, in order
expect(claves()).toEqual([
  ['categorias'], ['resumen'], ['resumen-anual'], ['detalle-bucket'],
]);
```

One test per mutation kind is enough (six hooks, two profiles) plus one belt-and-braces case: a
**rename-only** `PATCH` must still produce the full profile-B list — that is the assertion that
would fail if someone later "optimises" the rename path per Q5b.

---

### Q6 — Destructive confirmations: one shell, one pure translator, two payloads

#### Q6a — The component takes rendered copy, not a discriminated union

`ConfirmarImpactoDialog` is the `EliminarIngestaControl` shape: hand-rolled `role="alertdialog"`,
`aria-modal="false"` (inline widget, no focus trap — the shipped scoping decision), focus to the
confirm button on open, Escape cancels **and restores focus to the trigger**, errors inline via
`role="alert"`, and **the dialog does not close on failure** so the user can retry in place
(`EliminarIngestaControl:44-50`).

```ts
export function ConfirmarImpactoDialog({
  titulo, lineas, textoConfirmar, pendiente, error, onConfirmar, onCancelar,
}: {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly textoConfirmar: string;
  readonly pendiente: boolean;
  readonly error: string | null;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}): JSX.Element;
```

The dialog **does not know what it is confirming** — US-042's D-02 applied verbatim. A `modo`
prop would put a growing `switch` inside the component (`solid`'s "growing switch in the detector",
at component level).

#### Q6b — The two payloads live in one pure translator

```ts
// components/configuracion/categorias/mensajes-catalogo.ts
export type ImpactoCatalogo =
  | { readonly tipo: 'eliminar'; readonly nombre: string; readonly transaccionesCount: number }
  | { readonly tipo: 'cambiar-bucket'; readonly nombre: string; readonly transaccionesCount: number;
      readonly bucketAnterior: string; readonly bucketNuevo: string };

export function fraseDeImpacto(i: ImpactoCatalogo): {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly textoConfirmar: string;
};   // closes with `const _exhaustive: never = i;`
```

That is §5's "one component, two payloads", with the branch in a **pure function** that needs no
RTL to test and a `never` guard that makes a third payload stop compiling.

Copy, all four rows (`«»` quotes match es-CL register; `etiqueta()` is `ETIQUETA_BUCKET`):

| Payload | Title | Lines | Confirm |
|---|---|---|---|
| `eliminar`, n ≥ 1 | `Eliminar categoría` | `Vas a eliminar «{nombre}».` · `{n} transacciones quedan en Sin categoría, en todos los períodos.` · `Esta acción no se puede deshacer.` | `Eliminar` |
| `eliminar`, n = 0 | `Eliminar categoría` | `Vas a eliminar «{nombre}».` · `No tiene transacciones asociadas.` · `Esta acción no se puede deshacer.` | `Eliminar` |
| `cambiar-bucket`, n ≥ 1 | `Cambiar el bucket` | `«{nombre}» pasa de {etiqueta(ant)} a {etiqueta(nuevo)}.` · `Esto mueve {n} transacciones en TODOS los períodos, incluidos los meses ya cerrados.` · `Tu resumen 50/30/20 va a cambiar para esos meses.` | `Cambiar bucket` |
| `cambiar-bucket`, n = 0 | `Cambiar el bucket` | `«{nombre}» pasa de {etiqueta(ant)} a {etiqueta(nuevo)}.` · `No tiene transacciones asociadas, así que no se mueve ningún monto.` | `Cambiar bucket` |

`{n} transacciones` uses `etiquetaTransacciones(n)` so `1` reads `1 transacción` (Q7a).

**The zero case softens; it never skips.** Both payloads keep the dialog at
`transaccionesCount === 0`. Skipping would falsify the success criterion *"a dirty `Bucket` cannot
be saved without an all-periods impact confirmation"*, and it would add a branch that every test
then has to encode as an exception. `EliminarIngestaControl:109-114`'s precedent is exactly this:
soften the sentence, keep the dialog.

The bucket-change copy is deliberately **more** alarming than `WCAT-04`'s single-transaction
confirmation (`ReclasificarCategoriaControl:173-176`), because it is that same rule applied to
`transaccionesCount` transactions at once, across closed months.

#### Q6c — **CORRECTION: the demo message is a new constant, not `MENSAJE_DEMO_SOLO_LECTURA` reused verbatim**

§8 says `MENSAJE_DEMO_SOLO_LECTURA` is *"reused verbatim"*. Verified: it reads
*"…Crea una cuenta real para editar **tu perfil**."* (`mensajes.ts:35-36`). Rendering that on the
categories screen states something false about what the user cannot do.

**Decision**: a sibling constant in `mensajes-catalogo.ts`:

```ts
export const MENSAJE_DEMO_CATALOGO =
  'Estás en una cuenta de demostración. Crea una cuenta real para editar tus categorías.';
```

Same two-layer pattern as `PerfilForm` (proactively disabled controls + a `role="note"` explanation
+ the defensive `403 DEMO_SOLO_LECTURA` mapping), same shape, one honest sentence instead of one
reused false one. Two constants, not one function with a `seccion` parameter — they are two strings
that will never share a rule.

#### Q6d — Both delete entry points, one dialog, one hook

Open question 6 resolved: **both**. Frame 2 draws a delete icon per row; frame 3 draws
`Eliminar categoría` in the footer. Both mount `ConfirmarImpactoDialog` with the same
`fraseDeImpacto({tipo:'eliminar', …})` payload and call the same `useEliminarCategoria()`. The only
difference is what happens after success: the list row's dialog just closes (the row disappears via
invalidation), the edit screen's navigates back to `/configuracion/categorias`.

M2's single-icon row is **US-063**, not this change (decision 8).

---

### Q7 — Pure helpers, and the ordering rule that replaces `ordinal()`

#### Q7a — Pluralisation: two named helpers, not one generic pluraliser

`components/configuracion/categorias/plural.ts`:

```ts
/** Tres formas (§3): 0 → `sin patrones` · 1 → `1 patrón` · n → `N patrones`. */
export function etiquetaPatrones(n: number): string {
  if (n === 0) return 'sin patrones';
  return n === 1 ? '1 patrón' : `${n} patrones`;
}

/** Dos formas. Solo alcanzable con n ≥ 1: el caso 0 tiene su propia frase (Q6b). */
export function etiquetaTransacciones(n: number): string {
  return n === 1 ? '1 transacción' : `${n} transacciones`;
}
```

Two functions, not one parameterised pluraliser: the zero form is a **different word**
(`sin patrones`, not `0 patrones`), which is precisely the case a generic
`${n} ${sing}${n===1?'':'es'}` gets wrong. Both are pure, both `it.each`-tested at `0,1,2,11`.

All four forms are drawn on the frames (`wireframes-extracted.md` §5), so this is transcription,
not invention.

#### Q7b — The new ordering rule in `agrupar-detalle-por-categoria.ts`

`ORDEN_CATEGORIAS` is deleted, so `ordinal()` (`:51-57`) loses its input. Replacement:

```ts
const NOMBRE_SIN_CATEGORIA = 'Sin categoría';

/**
 * Orden alfabético es-CL, con "Sin categoría" SIEMPRE al final. Reemplaza el
 * orden fijo de las 8 categorías semilla (ADR-036/037: el catálogo es un set
 * de filas por usuario, no un enum cerrado — ya no existe un orden canónico
 * que espejar). El locale es EXPLÍCITO: los nombres creados por el usuario
 * llevan tildes y ñ, y la colación por defecto depende del ICU disponible en
 * el runtime, así que sin `'es-CL'` el orden cambiaría entre Node y navegador.
 */
function compararGrupos(a: string, b: string): number {
  if (a === NOMBRE_SIN_CATEGORIA) return b === NOMBRE_SIN_CATEGORIA ? 0 : 1;
  if (b === NOMBRE_SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es-CL');
}
```

`.sort((a, b) => compararGrupos(a.nombre, b.nombre))` replaces `:100`.

Test (pure, no RTL): `['Ñandú','Zapatos','Ahorro','Sin categoría']` →
`['Ahorro','Ñandú','Zapatos','Sin categoría']`. That case fails under a naive `<` comparison, which
is the point of pinning the locale.

**Edge case, accepted and recorded**: a user who *names* a category `Sin categoría` sorts last and
merges visually with the synthetic group. The API permits the name; no data is lost; inventing a
reserved-name rule client-side would be a business rule in the wrong layer (ADR-024).

**Spec consequence** — the docblock's *"orden fijo de `Categoria` (mismo orden que el backend)"*
becomes false. `WCAT-02`'s *"canonical order"* scenario must be rewritten to *"alphabetical, with
Sin categoría last"*. Handed to `sdd-spec` in §4.

---

### Q8 — Copy: the closed error table and the responsive labels

#### Q8a — Keyed by `code` alone, and why that is earned

`aCatalogoHttpError` (`catalogo-http-error.ts:42-102`) is a chain of `instanceof` branches closed by
`const _exhaustive: never = error`. Verified property: **one error class ⇒ exactly one status ⇒
exactly one code**. No code appears at two statuses. The client table therefore keys by `code`
alone; US-042's `${status}:${code}` composite would carry a discriminator that discriminates
nothing.

#### Q8b — **CORRECTION: totality is a `Record` over a literal union, not a `switch` + `never`**

§8 says the table is *"in the shape of `mensajes.ts` … closed with a `never` exhaustiveness
guard"*. `mensajes.ts` needs a `switch` because `PERFIL_RECHAZADO` maps to different copy depending
on `origen`. **No code here needs two messages**, so a `Record<CodigoCatalogo, string>` over a
closed literal union gives the same totality with less machinery — adding a member without a row
fails `tsc` directly, with no guard to write or forget.

**Correction (2026-08-14, round 2 of judgment-day on PR #334):** the snippet below originally shown
here was an `if`-chain (`if (tag === 'network') …; if (tag === 'server' && …) …; return GENERICO;`).
That shape is the root cause of a CRITICAL judgment-day defect: it silently fell through both
`tag: 'parse'` and `tag: 'invalid'` to the generic fallback instead of dispatching them explicitly,
and — because it has no exhaustiveness guard — a future sixth `ApiError` tag would compile clean
while silently falling through too. `spec.md`'s WCTG-12 was reconciled to require a closed
`switch` + `never` on the `tag` axis (a DIFFERENT axis from `COPY`'s `Record` totality on the `code`
axis, which this Q8b decision still governs unchanged). The snippet below is the shipped,
correct implementation — kept in sync so a future reader consulting `design.md` directly is not
taught the buggy shape.

```ts
export type CodigoCatalogo =
  | 'NOMBRE_INVALIDO' | 'BUCKET_NO_ASIGNABLE' | 'PATRON_INVALIDO' | 'MATCH_TYPE_INVALIDO'
  | 'REGEX_INVALIDA'  | 'PRIORIDAD_INVALIDA'  | 'BODY_INVALIDO'
  | 'DEMO_SOLO_LECTURA'
  | 'CATEGORIA_NO_ENCONTRADA' | 'PATRON_NO_ENCONTRADO'
  | 'NOMBRE_DUPLICADO' | 'PATRON_DUPLICADO';

const COPY: Record<CodigoCatalogo, string> = { /* the 12 rows below */ };
const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

export function mensajeDeErrorCatalogo(error: ApiError): string {
  switch (error.tag) {
    case 'network':
      return 'No se pudo conectar con el servidor.';
    case 'parse':
      return COPY.BODY_INVALIDO;
    case 'server':
      return error.code !== undefined && Object.hasOwn(COPY, error.code)
        ? COPY[error.code as CodigoCatalogo]
        : GENERICO;
    case 'unauthorized':
      return '';
    case 'invalid':
      return GENERICO;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
```

The `COPY` lookup reads `COPY`'s own keys — no second list to keep in sync (`dry`). `tag: 'unauthorized'`
maps to `''`: the caller navigates to `/login`, as everywhere else in the app, so this string is
never actually rendered. `tag: 'invalid'` (400 período inválido) belongs to the dashboard endpoints,
not the catalog ones — it falls back to `GENERICO` defensively. The `switch` + `never` guard on the
`tag` axis is required in ADDITION to `COPY`'s `Record` totality on the `code` axis — neither
replaces the other (unchanged from the original Q8b decision above; only the snippet needed fixing).

The 12 rows (all 11 backend codes + `BODY_INVALIDO`):

| Status | Code | Copy |
|---|---|---|
| 400 | `NOMBRE_INVALIDO` | `El nombre debe tener entre 1 y 40 caracteres.` |
| 400 | `BUCKET_NO_ASIGNABLE` | `Elige un bucket: Necesidades, Gustos o Ahorro.` |
| 400 | `PATRON_INVALIDO` | `El patrón debe tener entre 1 y 200 caracteres.` |
| 400 | `MATCH_TYPE_INVALIDO` | `Elige un tipo de coincidencia válido.` |
| 400 | `REGEX_INVALIDA` | `Esa expresión regular no es válida.` |
| 400 | `PRIORIDAD_INVALIDA` | `La prioridad debe ser un número entre 1 y 999.` |
| 400 | `BODY_INVALIDO` | `No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.` |
| 403 | `DEMO_SOLO_LECTURA` | `MENSAJE_DEMO_CATALOGO` (Q6c) |
| 404 | `CATEGORIA_NO_ENCONTRADA` | `Esa categoría ya no existe. Vuelve a la lista y recarga.` |
| 404 | `PATRON_NO_ENCONTRADO` | `Ese patrón ya no existe. Recarga la página.` |
| 409 | `NOMBRE_DUPLICADO` | `Ya tienes una categoría con ese nombre.` |
| 409 | `PATRON_DUPLICADO` | `Ya tienes un patrón con ese texto.` |
| — | `tag: 'network'` | `No se pudo conectar con el servidor.` |
| — | anything else | `Ocurrió un error inesperado. Intenta nuevamente.` |

Notes a reviewer will otherwise ask about:

- `BUCKET_NO_ASIGNABLE` uses **`Gustos`**, not `Deseos` — A1 applies to error copy too, or the app
  names a value the dropdown never showed.
- `PRIORIDAD_INVALIDA` is **unreachable from this UI**: no control sends `prioridad`, so the API
  default (100) always applies (open question 7 resolved: hidden and defaulted). The row exists so
  the code cannot fall through to the generic if a future control appears. Marked, so nobody hunts
  for the missing input.
- **There is no `409` on delete and there never will be** (decision 5, `CAT038-04`). This is stated
  in the proposal, in the spec, and gets a one-line code comment on `deleteCategoria` — three
  places, because the criterion says *"nobody should later hunt for it"*.
- Every message is a client constant. `body.message` is never rendered — `perfil.ts:20-24`'s
  discipline, applied here for a different reason: the backend's messages enumerate valid values
  (`'…debe ser uno de: CONTAINS, STARTS_WITH, REGEX.'`), which is wire vocabulary, not UI copy.

#### Q8c — Responsive labels, without breaking the accessible name

T2 shortens `Nueva categoría` to `Nueva` at 880px, and frame 2's footer sentence is rewritten at T2
(A4: rendered copy, per-breakpoint). Both use the **existing `lg` breakpoint** — the one
`ConfiguracionPage.tsx:62` already uses — so `layout.ts` gains no tier (CA-06 holds):

```tsx
<button type="button" aria-label="Nueva categoría" onClick={abrirNueva}>
  <span className="lg:hidden">Nueva</span>
  <span className="hidden lg:inline">Nueva categoría</span>
</button>
```

The `aria-label` keeps the accessible name **stable at every width**, so
`getByRole('button', {name: 'Nueva categoría'})` works in jsdom (which has no viewport) and the
name never changes under a screen reader. WCAG 2.5.3 (Label in Name) is satisfied because
`Nueva categoría` **contains** the visible `Nueva`.

Footer sentence, same mechanism, one `<p>` with two spans:

| Width | Text |
|---|---|
| `lg` and up | `Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.` |
| below `lg` | `Eliminar en uso: advertencia, transacciones a Sin categoría.` |

M2's `Toca una categoría para editarla o eliminarla.` is **not built** — it describes a one-icon
row that only exists in US-063.

#### Q8d — The rest of the copy, accented per A3

Verbatim from §8's table: `Categorías y patrones` · `Tu catálogo propio: toda categoría pertenece a
un bucket. Los patrones permiten la auto-categorización.` · `Editar categoría` · `Nombre` ·
`Bucket (obligatorio)` · `Patrones de auto-categorización` · `Agregar patrón` ·
`Sin patrones, la categoría solo se puede asignar manualmente.` · `Eliminar categoría` ·
`Cancelar` · `Guardar`.

**The `sin patrones` note is always rendered** (decision 9), below the pattern list, preceded by an
`aria-hidden` `Info` icon — all three edit frames draw it under a populated list. It reads oddly
above three listed patterns; that was settled in the proposal against the drawn evidence and is
**not re-litigated here**.

---

### Q9 — Creating a category, and the pattern row

#### Q9a — Open question 4 resolved: an inline form on the list, not a `/nueva` route

The proposal leans "reuse the edit route". Rejected, for a mechanical reason:

**A not-yet-created category has no id, so it cannot own patterns.** Reusing the edit route would
mean a `modo: 'crear' | 'editar'` flag that hides the entire patterns section, the delete button
and the breadcrumb's leaf — one screen with half of it disabled, which is the exact
`modo`-prop anti-pattern US-042's D-02 rejected. It would also cost a `POST` followed by a
navigation to the real id before patterns became reachable.

**Decision**: `Nueva categoría` toggles a small `NuevaCategoriaForm` at the top of the list —
`Nombre` + `Bucket (obligatorio)` + `Crear`/`Cancelar`. On `201` it closes; profile B invalidation
brings the new row into the list. The user adds patterns by opening the new row's edit screen.

What is actually reused is what should be: `CampoTexto` and `CampoSelect`, the fields — not the
screen. The edit screen stays a pure edit screen: always a real category, always a real
`transaccionesCount`, always deletable, always with patterns. No mode flag, no disabled halves, no
extra route, no second not-found state.

*Rejected alternative, recorded*: navigate to the new category's edit screen on `201`. It puts the
patterns affordance one step closer but adds a navigation nobody asked for and one more test; a
user creating three categories in a row would be bounced out of the list each time.

#### Q9b — The pattern row

A `matchType` `<select>` (`MATCH_TYPES` → `ETIQUETA_MATCH_TYPE`) plus a value `<input>`, both
`<label>`-associated. Commits **per row, immediately** (decision 2).

**Corrected 2026-08-14 (judgment-day redesign)**: the mechanism is NOT a single "blur-or-Enter"
shared by every row, as this section originally said. An EXISTING row (already has a server id)
commits on blur-or-Enter, as originally written. A NOT-YET-CREATED row (`Agregar patrón`'s blank
row, before its first `POST`) commits ONLY on an EXPLICIT confirm — Enter, or picking `matchType`
once the value already has text — never on `blur` alone. Treating `blur` as one ambiguous trigger for
both cases is what three consecutive PR #4 fix rounds patched around symptom-by-symptom instead of
correcting (each round's fix opened the next round's defect); see `PatronFila.tsx`'s docblock for the
full account. This is a correction of this document, not an amendment of the frozen spec: WCTG-04
only requires patterns to commit "the moment each row action is confirmed", which never said `blur`.
`Agregar patrón` still appends a blank row whose first commit is a `POST` — only the trigger for that
first commit changed; the row's delete icon fires `DELETE` with no dialog (a pattern carries no
impact — it touches no transaction, `CAT038-04` does not apply, and a confirmation for a reversible
one-field edit is friction, not safety). A not-yet-created row's delete is always a local
`onDescartar` with zero network calls, regardless of trigger.

**`prioridad` is never sent.** Omitted from every payload → API default 100. No UI control, per the
proposal's out-of-scope list.

**REGEX pre-validation is a hint, not a gate.** `try { new RegExp(v) } catch` renders an inline
`role="status"` hint, and **the save control stays enabled**. Rationale: the browser's regex engine
is not guaranteed to be the server's, so a client-side *block* could refuse a pattern the API would
accept — the client would be enforcing a rule it does not own (ADR-024). The server is
authoritative (`400 REGEX_INVALIDA`), and `coincide()` degrades a malformed stored pattern to
no-match without throwing (`CAT038-06`). Cheap, zero-risk, non-blocking — exactly §4's framing,
made precise about which way the non-blocking cuts.

---

### Q10 — The 360px defensive floor (decision 8)

**Scope discipline first: this builds the floor, not the M2/M3 redesign.** Horizontal tabs,
one-icon rows, back-icon IA, inverted footer and the four shortened labels are **US-063 (#332)**.
Three guarantees, and nothing else.

#### Q10a — Guarantee 1: no horizontal overflow

Two mechanisms, one of which is the one people forget:

1. **`min-w-0` on the content track.** `ConfiguracionPage.tsx:62`'s grid is
   `grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]`. A grid item's default `min-width` is `auto`, so a
   long category name inside the `1fr` track forces the track wider than the viewport and the page
   scrolls sideways. `ConfiguracionLayout`'s second child gets `min-w-0`. This is *the* fix; the
   truncation below only works once it is in place.
2. **`min-w-0 truncate` on every name cell**, inside a `flex flex-wrap items-center gap-2` row.

**Prohibited in every new component**: fixed pixel widths (`w-[NNNpx]`, `min-w-[NNNpx]`) and
`overflow-x-auto`. A horizontal scroll container is not "no overflow" — it is overflow with a
handle. This is a greppable review rule.

#### Q10b — Guarantee 2: `Nombre`/`Bucket` stack

Mobile-first, using Tailwind's stock `sm` (640px) — **no new tier in `layout.ts`**, so CA-06's
constraint holds and T3 (880px) still draws them side by side exactly as the frame does:

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
  <CampoTexto  label="Nombre" … />
  <CampoSelect label="Bucket (obligatorio)" required … />
</div>
```

At 360 they stack; at 880 they are `1fr` + `220px`, matching T3's measured 356 + 200 within the
fluid band.

#### Q10c — **CORRECTION: guarantee 3 (≥24×24 tap targets) cannot be asserted in jsdom, so the pin is on the class, not on the geometry**

The frames' row icons are 18px. SC 2.5.8 (WCAG 2.2 AA, ADR-018) requires a 24×24 CSS px minimum
target. The icon must **not** be redrawn (that is US-063's job); the **hit area** grows around it.

Three usages — list-row edit, list-row delete, pattern-row delete — so `dry`'s three-strike rule is
satisfied on first write. One constant, `components/configuracion/categorias/estilos.ts`:

```ts
/**
 * CLASE_BOTON_ICONO — área táctil mínima de los botones de sólo-icono.
 * `size-6` = 24×24 CSS px = el mínimo de WCAG 2.2 AA SC 2.5.8 (ADR-018). El
 * icono sigue siendo de 18px y NO se redibuja (eso es US-063): lo que crece es
 * el área de golpe. Si alguien reduce esto, el test de abajo falla.
 */
export const CLASE_BOTON_ICONO =
  'inline-flex size-6 shrink-0 items-center justify-center rounded';
```

```tsx
<button type="button" className={CLASE_BOTON_ICONO}
        aria-label={`Editar categoría ${categoria.nombre}`}>
  <Pencil aria-hidden="true" className="size-[18px]" />
</button>
```

**The honest limit**: jsdom performs no layout — `getBoundingClientRect()` returns zeros — so the
24px cannot be asserted as geometry. The guarantee is carried by three things, stated so nobody
mistakes the coverage for more than it is:

| Layer | What it actually proves |
|---|---|
| `expect(CLASE_BOTON_ICONO).toContain('size-6')` (pure unit) | the constant was not shrunk |
| all three buttons render `className={CLASE_BOTON_ICONO}` (RTL) | no usage bypasses the constant |
| a manual 360px devtools pass, recorded in the task | the rendered geometry |

The `aria-label` carrying the category name is not decoration either: `EliminarIngestaControl:122`
records the same finding — a list of identical icon buttons is unusable by screen reader without
per-row names.

---

## 2. Architecture decisions (D-numbered)

### D-01 — Three URL levels; the third escapes the layout by a trailing underscore, verified in the installed generator

`configuracion.tsx` (layout) → `configuracion.index.tsx` + `configuracion.categorias.tsx` (leaves,
inside the tab shell) → `configuracion_.categorias.$categoriaId.tsx` (breadcrumb, outside it).
Mechanism proven at `utils.js:24-35` (exact-segment parenting) and `utils.js:290-295` +
`generator.js:716` (underscore stripped from the matched path). §1/Q1.

### D-02 — The two commit semantics are carried by the DOM and by behaviour, because the frames took the layout away

Decision 10 is adopted; §4's obligation is **transferred, not dropped**, onto `form=` association,
per-row `aria-live` commit announcements, and disambiguated accessible names. §1/Q3. The
transferred obligation is stronger than the original: a user learns a pattern is committed the
moment they commit it, rather than inferring it from where a divider sits.

### D-03 — Destructive confirmation is one a11y shell over one pure, `never`-closed translator

`ConfirmarImpactoDialog` renders `{titulo, lineas, textoConfirmar}` and knows nothing else;
`fraseDeImpacto` owns the two payloads and stops compiling if a third appears. A third destructive
action costs zero component changes (OCP). §1/Q6.

### D-04 — Two invalidation profiles, two exported functions, and the exclusion is a first-class test

Profile A for the three pattern mutations, profile B for the three category mutations, asserted
with **exact array equality** in both directions. Profile B's `['detalle-bucket']` leg is required,
not defensive, because the drill-down groups and renders by category *name*. §1/Q5.

### D-05 — The copy table is total by `Record` over a closed union; no server string is ever rendered

Twelve codes keyed by `code` alone, which is earned by `aCatalogoHttpError`'s one-class-one-status
property. `tag: 'unauthorized'` routes to `/login` and has no copy. §1/Q8.

### D-06 — The drift guard changes subject: from the 8 template names to the wire vocabulary

The 8-name pin is retired because §7 removes the web's hardcoded list — there is nothing left to
drift. The new guard pins `BUCKETS_ASIGNABLES`/`MATCH_TYPES` against **four** backend files and
additionally against **each other**, catching the backend drifting from its own duplicate. Same
plain-text mechanism, so ADR-008 holds. §1/Q4b.

### D-07 — Every structural change is a compile error when omitted

| Type change | What deliberately breaks |
|---|---|
| delete `src/domain/categoria.ts` | `ReclasificarCategoriaControl.tsx:4-6`, `agrupar-detalle-por-categoria.ts:5`, `category-icons.test.ts:14`, `categoria.test.ts`, `categoria.mirror.spec.ts` — **`tsc` enumerates them; do not hunt by grep** |
| new `MatchType` member | `ETIQUETA_MATCH_TYPE`'s `Record` over the union |
| new `CodigoCatalogo` member | `COPY`'s `Record` over the union |
| new `ImpactoCatalogo` member | `fraseDeImpacto`'s `never` guard |
| new route files | `<Link to="…">` does not typecheck until `tsr generate` has run |

The last row is the ordering trap: `pnpm web typecheck` **is** `tsr generate && tsc -b`, so it must
run after each route file is created and before anything links to it.

### D-08 — No new dependency, no new breakpoint tier, no shell surgery

`layout.ts`, `AppShell.tsx`, `Sidebar.tsx`, `BottomTabs.tsx` untouched. The page uses only `lg`
(already used by `ConfiguracionPage.tsx:62`) and stock `sm` for the field grid. No shadcn primitive
is vendored — hand-rolled `<select>`/`<input>`/dialog, US-042 binding decision 5.

### D-09 — The directory split, with §10's "pure rename" claim corrected

```
components/configuracion/
  ConfiguracionLayout.tsx     ← NEW (h1 `Configuración` + grid + tabs + children)
  ConfiguracionTabs.tsx       ← MODIFIED (Categorías: inert <button> → <Link>)
  CampoTexto.tsx              ← STAYS at the shared level (used by both sections)
  perfil/
    PerfilPanel.tsx           ← rename+edit of ConfiguracionPage.tsx (loses h1/grid/tabs,
                                 gains the ?google= read/clean effect from the route)
    PerfilForm.tsx  GoogleVinculoSection.tsx  ConfirmarPasswordDialog.tsx  mensajes.ts
  categorias/
    CategoriasPanel.tsx  CategoriaFila.tsx  NuevaCategoriaForm.tsx
    EditarCategoria.tsx  CampoSelect.tsx
    PatronesSection.tsx  PatronFila.tsx
    ConfirmarImpactoDialog.tsx  mensajes-catalogo.ts  plural.ts  estilos.ts
```

**CORRECTION to §10.** *"Moving US-042's files into `perfil/` is a pure rename"* is true for **8
files** (`PerfilForm`, `GoogleVinculoSection`, `ConfirmarPasswordDialog`, `mensajes.ts` and their
four tests) — import-line changes only, collapsed by GitHub. It is **not** true for two:
`ConfiguracionPage.tsx` → `perfil/PerfilPanel.tsx` is a rename **with** edits, and
`ConfiguracionTabs.tsx` changes in place. Naming this now stops a reviewer discovering it mid-diff.

`CampoTexto.tsx` **stays at the shared level** rather than moving into `perfil/`: `categorias/`
uses it too, and a sibling importing across `perfil/` would signal ownership that is not real.

The scoped a11y `error` tier already globs `src/components/configuracion/**/*.tsx`, so every new
subdirectory is covered with no config change.

### D-10 — The eslint route glob widens once, by pattern, not by enumeration

`eslint.config.js:86-89` lists **one** route file, so all four new route files would be ungated.
Replace the second entry with a pattern that also covers anything added later:

```js
files: [
  'src/components/configuracion/**/*.tsx',
  'src/routes/_authenticated/configuracion*.tsx',   // ← was: the single file
],
```

`*` matches within a segment, so it covers `configuracion.index.tsx`,
`configuracion.categorias.tsx` and `configuracion_.categorias.$categoriaId.tsx`. Same
directory-glob reasoning US-042 applied to components, finally applied to routes. **This lands in
slice 1, before any new route component is authored** — otherwise the rules gate nothing while the
code that needs them is being written (US-042's Q10 step-5 rule).

---

## 3. Module map

| File | Action | Detail |
|---|---|---|
| `src/routes/_authenticated/configuracion.tsx` | **Modify** | Layout: keeps `validateSearch`; renders `<ConfiguracionLayout><Outlet/></ConfiguracionLayout>` |
| `src/routes/_authenticated/configuracion.index.tsx` | **New** | Perfil leaf; owns the `?google=` capture + cleanup effect moved from the layout (Q1c) |
| `src/routes/_authenticated/configuracion.categorias.tsx` | **New** | Thin → `CategoriasPanel` |
| `src/routes/_authenticated/configuracion_.categorias.$categoriaId.tsx` | **New** | Thin → `EditarCategoria`; **escapes the tab layout** (Q1b) |
| `src/api/categorias.ts` (+ test) | **New** | 7 calls, guards, `code` mapping |
| `src/api/use-categorias.ts` (+ test) | **New** | `CATEGORIAS_QUERY_KEY`, `categoriasQueryOptions`, `useCategorias` |
| `src/api/categorias-invalidacion.ts` (+ test) | **New** | The two profiles (Q5a) |
| `src/api/use-{crear,actualizar,eliminar}-categoria.ts` (+ tests) | **New** | Profile B |
| `src/api/use-{crear,actualizar,eliminar}-patron.ts` (+ tests) | **New** | Profile A |
| `src/api/catalogo-constantes.ts` (+ test) | **New** | `BUCKETS_ASIGNABLES`, `MATCH_TYPES` |
| `src/api/catalogo-constantes.mirror.spec.ts` | **New** | The drift guard, 4 backend files (Q4b) |
| `src/api/types.ts` | **Modify** | `CategoriaDto`, `PatronDto`, `CatalogoDto` hand-written (ADR-008 exception) |
| `src/components/configuracion/ConfiguracionLayout.tsx` (+ test) | **New** | h1 `Configuración` (A2), grid, tabs, `min-w-0` content track |
| `src/components/configuracion/ConfiguracionTabs.tsx` (+ test) | **Modify** | `Categorías` → `<Link>` with `aria-current` |
| `src/components/configuracion/perfil/**` | **Moved** | 8 pure renames; `PerfilPanel.tsx` is rename+edit (D-09) |
| `src/components/configuracion/categorias/**` | **New** | 11 files (D-09) |
| `src/components/ReclasificarCategoriaControl.tsx` (+ test) | **Modify** | Data-driven via `useCategorias()` (§7) |
| `src/domain/categoria.ts`, `categoria.test.ts`, `categoria.mirror.spec.ts` | **Removed** | §7 |
| `src/domain/agrupar-detalle-por-categoria.ts` (+ test) | **Modify** | `compararGrupos` replaces `ordinal` (Q7b) |
| `src/lib/category-icons.test.ts` | **Modify** | Loses its `ORDEN_CATEGORIAS` import → local 8-name fixture. `category-icons.ts` itself unchanged (`iconoDeCategoria` already falls back to `Receipt`) |
| `apps/web/eslint.config.js` | **Modify** | The route glob (D-10) |
| `src/components/app-shell/**`, `src/api/client.ts`, `apps/web/api/proxy.ts`, `vercel.json` | **Unchanged** | D-08; `PATCH` through the proxy is proven (US-042 Q5) |
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Zero files. A diff here means the design was misread |

### §7 — the reclassify repair, concretely

`ReclasificarCategoriaControl` drops both `@/domain/categoria` imports and derives everything from
the query:

```ts
const { data } = useCategorias();
const grupos = agruparPorBucket(data?.categorias ?? []);          // Q4c, shared with the list
const bucketDe = (nombre: string) =>
  data?.categorias.find((c) => c.nombre === nombre)?.bucket;      // replaces CATEGORIA_BUCKET[nombre]
```

`<optgroup label={ETIQUETA_BUCKET[g.bucket] ?? g.bucket}>` — unchanged shape, live data.
`WCAT-04`'s cross-bucket confirmation now compares against the **real** bucket, which is the defect
this slice exists to close.

**Loading**: while `data` is undefined the `<select>` renders `disabled` with only its current
value. It must never render an *empty* select — that would silently offer nothing on a shipped
dashboard surface.

---

## 4. Design element → requirement mapping (hand-off to `sdd-spec`)

| Design element | Suggested requirement |
|---|---|
| Three URL levels, the breadcrumb, the edit route escaping the tab shell (Q1a/Q1b/Q1d) | **WCTG-01** |
| Not-found / pending / error states of the edit route + the in-flight-delete guard (Q1e) | **WCTG-02** |
| Grouped list, group order, three-form tag, the always-rendered note, empty catalog (Q4c, Q7a) | **WCTG-03** |
| Two commit semantics + the `form=` association + per-row pattern announcements (Q3) | **WCTG-04** |
| Both impact confirmations, both zero cases, focus in/out, dialog stays open on failure (Q6) | **WCTG-05** |
| The two invalidation profiles, inclusion **and** exclusion (Q5) | **WCTG-06** |
| The 12-code copy table + no server string rendered (Q8) | **WCTG-07** |
| Demo: proactive disable + `role="note"` + defensive `403`; read path still renders (Q6c) | **WCTG-08** |
| T2/T3 with no new tier + the 360 floor's three guarantees (Q8c, Q10) | **WCTG-09** |
| Delta: `/configuracion` becomes a layout; Perfil moves to the index leaf; `?google=` still works | **`WCFG-01`, `WCFG-05`, `WCFG-11`, `WCFG-12`** |
| Delta: grouping order is **alphabetical with Sin categoría last**, not the 8-name canonical order | **`WCAT-02`** |
| Delta: the reclassify dropdown is data-driven; the cross-bucket check uses the real bucket | **`WCAT-04`** |
| Retire `web-app`'s Non-Goal *"The `Categorías` section's real content (US-043…)"* | `web-app` Non-Goals |
| Narrow `catalogo-clasificacion-ownership`'s Non-Goal to **mobile** only | housekeeping, no requirement change |

---

## 5. Testing strategy — pure vs RTL

Strict TDD is active. Red → green → refactor per unit, with **one** structural exception.

### Pure units (no RTL, no fetch stub, no `QueryClient`)

| Target | Assertions |
|---|---|
| `plural.ts` | `etiquetaPatrones` at 0/1/2/11 · `etiquetaTransacciones` at 1/2/11 |
| `mensajes-catalogo.ts` | `mensajeDeErrorCatalogo` `it.each` over all 12 codes + network + unknown-code + no-code · `fraseDeImpacto` over all 4 payload rows, verbatim |
| `catalogo-constantes.mirror.spec.ts` | the four drift assertions (Q4b) |
| `agrupar-detalle-por-categoria.ts` | the accent/ñ ordering case + `Sin categoría` last |
| `agruparPorBucket` | the three groups in order · empty groups dropped · the `Otros` fallback |
| `estilos.ts` | `CLASE_BOTON_ICONO` contains `size-6` (Q10c) |
| `categorias.ts` guards | each guard rejects a missing/mistyped field and accepts a valid fixture |

### RTL (needs the DOM)

| Target | Assertions |
|---|---|
| Both dialogs | focus lands on confirm · Escape restores focus **to the trigger** · a failed confirm keeps the dialog open with `role="alert"` inline |
| Identity form | `Guardar` has `form="form-identidad"` · submit issues exactly `['PATCH /api/categorias/:id']` |
| Pattern rows | a commit issues exactly one `/api/patrones` call and renders `Patrón guardado.` · `Cancelar` issues zero further calls |
| Invalidation matrix | the two exact-array assertions + the rename-only case (Q5c) |
| Edit route states | pending · error · **id not present** · the in-flight-delete guard never renders "ya no existe" |
| Demo | every mutation control `disabled` + the `role="note"` present · the `403` mapping asserted on the translator, not through a disabled button · **`GET` still renders the catalog** |
| a11y | `getByLabelText` on every input · all three icon buttons carry `CLASE_BOTON_ICONO` and a name including the category name |
| Reclassify repair | a just-created category is offered · a deleted one is not · a cross-bucket change fires the confirmation with the **real** bucket · `WCAT-02`/`WCAT-04` scenarios stay green |
| Tabs | `Categorías` is a `<Link>` with `aria-current="page"` on its own route |

### The TDD exception, stated once

**Route files cannot be red-first.** `NavRoute = FileRouteTypes['to']` comes from
`routeTree.gen.ts`, which only learns a route after `tsr generate`. Order for each of the four:
create the route file → `pnpm web typecheck` → write the test → implement the component. Every
other unit is red-first with no exception. `sdd-tasks` must not emit an impossible red-first step
and then quietly skip it.

### Gates

```
pnpm web typecheck   # tsr generate && tsc -b — the ONLY typecheck. Four new route files make it mandatory
pnpm web test        # vitest run — does NOT typecheck
pnpm web lint        # eslint . — the widened jsx-a11y scope (D-10)
```

`pnpm web test` passing means **nothing** about types (`VINC041-11`).

---

## 6. Delivery ordering (hand-off to `sdd-tasks`)

`sdd-tasks` owns the binding forecast and must apply the proposal's calibration (size production
code, multiply by ≥2.4; treat any slice under 250 production lines with suspicion). This design
owns the **ordering** and one correction.

| PR | Content | Must be here because |
|---|---|---|
| **#1 Shell + data layer** | The four route files, `ConfiguracionLayout`, tab → `Link`, `Configuración` h1, the directory split, `?google=` moved to the index leaf, `api/categorias.ts` + `useCategorias` + guards, the two invalidation profiles, `catalogo-constantes.ts` + the drift guard, the copy table, **the eslint glob** | Restructuring a shipped route gets a review of its own. The eslint glob must precede any new route component (D-10) |
| **#2 CA-01 + CA-03** | The grouped list, three-form tag, footer sentence, `sin patrones` note, empty states, demo read path, **plus the 360 floor for everything it authors** | First visible value, read-only, zero mutation risk |
| **#3 Create + identity edit + decision 1** | `NuevaCategoriaForm`, the edit route's identity block, `CampoSelect`, the `form=` footer, the **bucket-change impact confirm**, profile B | The highest-risk slice, isolated: money moving across all periods is one reviewer's whole job |
| **#4 Patterns CRUD** | Pattern rows, add/edit/delete, matchType labels, REGEX hint, per-row announcements, profile A | Independent surface, independent endpoints, independent profile |
| **#5 CA-04 delete + T2/T3 pass** | Both delete entry points reusing #3's dialog; the tablet verification pass | Delete is the second payload of an existing translator |
| **#6 Reclassify repair (§7)** | Data-driven dropdown, `domain/categoria.ts` deleted, the new ordering rule, test fallout | The **only** slice touching shipped dashboard surfaces — the regression risk is reviewed unmixed |

**CORRECTION to the proposal's slicing.** §12's PR #5 describes tablet as *"CSS-only"*, which was
true before decision 8. It is not now: the 360 floor's `min-w-0`, stacking grid and 24px hit areas
are properties **of the components that carry them**. Deferring them to slice 5 would ship three
PRs of known-overflowing mobile and then fix them. **The floor ships with each component**; slice 5
keeps only the delete dialog plus a verification pass at 880 and 360.

**Prohibitions.**

1. **The bucket-change confirmation must never ship in a different PR than the `PATCH` that changes
   the bucket.** A `Guardar` that re-stamps every historical transaction with no warning is worse
   than a large diff.
2. **Do not partially revert.** Reverting §7 while keeping the CRUD ships the CRUD with the
   known-broken dropdown — the proposal's rollback plan item 4, restated here because it is an
   ordering rule, not just a plan.

---

## 7. Risks this design does not remove

| Risk | Status after this design |
|---|---|
| **A bucket change silently rewrites closed months** | Mitigated by decision 1's dialog + profile B, both in slice #3, both pinned by test. The user can still confirm it — the warning is informed consent, not prevention. Irreducible: the API is atomic and has no undo |
| **The 24×24 tap target is not verified as geometry** | **Not removed.** jsdom has no layout. Pinned by a class-constant test + a recorded manual 360px pass (Q10c). Named as a limitation, not covered up |
| **No horizontal overflow is likewise not machine-verified** | Same. Carried by `min-w-0` + `truncate` + a greppable prohibition on fixed widths and `overflow-x-auto` |
| **Mobile ships visibly unfinished at 360px** | Deliberate; **US-063 (#332)** owns the redesign. The floor's three guarantees are the honest minimum |
| **`transaccionesCount` is stale** | Accepted and recorded (decision 3). Single-user app, no impact endpoint by design (`catalogo-clasificacion-ownership` Non-Goals). A delete confirmed against a stale count still deletes correctly; only the number in the sentence can be old |
| **Bucket / matchType drift** | Contained by the four-file guard, **including backend-to-backend** (Q4b). A backend shared export remains the strictly better fix and is out of scope |
| **§7 regresses shipped dashboard behaviour** | Isolated in slice #6. `WCAT-02`/`WCAT-04` are the regression net, and `WCAT-02`'s ordering scenario is being rewritten in the same slice — a reviewer must read the spec delta and the code together |
| **Two commit semantics still confuse someone** | Reduced, not eliminated. The `form=` association and per-row announcements are stronger than the layout hint they replace, but a user who never edits a pattern never sees the announcement that teaches the distinction |
| **jsdom's `form`-attribute submit activation** | Sidestepped by driving submits with `fireEvent.submit`. If a real browser ever disagrees, that is a genuine bug — do not paper over it with an `onClick` |
| **The 8-template-name drift pin is gone** | **Deliberate** (D-06). If the backend template ever needs pinning again, it will be for a reason that does not exist today |
| **`Nueva categoría` as an inline form is not drawn anywhere** | The frames draw no creation screen at all, so every option is an invention; this one adds no route, no mode flag and no not-found state (Q9a). Alternative recorded |
