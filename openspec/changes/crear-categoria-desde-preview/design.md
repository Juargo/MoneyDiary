# Design: Create a categoría (with patrones) from the upload preview

Change: `crear-categoria-desde-preview` · Store: hybrid (Engram topic `sdd/crear-categoria-desde-preview/design`)
Inputs: `proposal.md` (its "Product decisions — locked" section is binding), Engram `sdd/crear-categoria-desde-preview/explore`.
Language: design in English; every quoted UI string is the neutral Spanish that ships.

---

## 0. Architecture summary

No new layer, no new pattern, no new dependency. The change composes three existing seams:

1. **API** — `POST /api/categorias` gains an optional nested `patrones[]` written in ONE Prisma statement. The categoría-creation use case grows one input field; a new port method carries the transaction; a wrapper error carries the failing index. Domain is untouched.
2. **Contract** — `openapi.json` and `@moneydiary/api-client` are regenerated from the Zod schemas that already drive them (ADR-011/012), and the web finally consumes the generated catalog types instead of the hand-written mirror whose ADR-008 exception is provably stale.
3. **Web** — a row-level creation form composed from existing field primitives; the "create → adopt → refresh → re-preview → announce" sequence lives in exactly one named handler in `SubirCartola`, the component that already owns all four of its inputs (`archivo`, `edits`, `previewMutation`, the live region).

Layering (ADR-005) holds throughout: `domain ← application ← infrastructure`, `Result<T,E>` never throws, no classification or money math moves to the client (ADR-024).

---

## 1. Verified facts this design rests on

| # | Fact | Evidence |
|---|---|---|
| F-1 | `PrismaCategoriaRepository.crear` already returns `patrones` and `transaccionesCount` through the shared `categoriaInclude(userId)`. | `prisma-categoria.repository.ts:21-27,123-136` |
| F-2 | `aCategoriaDto` / `categoriaResponseSchema` already nest `patrones[]`. **The 201 response shape does not change.** | `categorias.schema.ts:36-67` |
| F-3 | `PatronClasificacion` has **no DB unique constraint** on `(userId, patron)` — only `@@index([userId])`. Uniqueness is enforced *purely in application code* (`existePatron`). | `schema.prisma:157-180` |
| F-4 | `aCatalogoHttpError` is closed by `const _exhaustive: never` over 11 error classes; `responderErrorTraducido` is the single wire chokepoint and **drops any field other than `message`/`code`**. | `catalogo-http-error.ts:100`, `responder-error-traducido.ts:46-52` |
| F-5 | `openapi.json` is *generated* from the Zod schemas (`openapi-document.ts` imports `categoriaCreateRequestSchema` directly). Editing the schema IS editing the contract. | `openapi-document.ts:66-71,731-768` |
| F-6 | `CategoriaResponse` already exists in the generated client, and `/api/categorias` is already in the document. The ADR-008 exception comment in `apps/web/src/api/types.ts:238-249` ("openapi.json todavía no cubre… /api/categorias") is **false today**. | `packages/api-client/src/types.gen.ts:2089`, `openapi-document.ts:1469` |
| F-7 | `preview.filas[i].rowIndex === i`, assigned in `transacciones.map((tx, i) => …)`; `transacciones` comes from `normalize*TransactionsUseCase(buffer, banco)` and `banco` from the detector — **the whole chain reads only the file bytes**. | `preview-ingesta.use-case.ts:179-201`, `ejecutar-pipeline-ingesta.use-case.ts:121-175` |
| F-8 | `esCategoriaDto` / `esPatronDto` runtime guards already exist in the web and are not currently applied to the 201 body (it is discarded). | `apps/web/src/api/categorias.ts:49-76,241-246` |
| F-9 | `useMutation.mutate()` clears `data` while pending — a preview re-run would unmount the whole review table if it kept rendering from `previewMutation.data`. | TanStack Query v5 semantics; `SubirCartola.tsx:567-570` |

---

## 2. Decisions

### D-01 — Atomicity lives in one repository method, not in a transaction orchestrator

`CrearCategoriaUseCase` gains an optional `patrones` input. Persistence goes through **one new port method**:

```ts
// application/ports/categoria-repository.port.ts
crearConPatrones(
  userId: string,
  data: {
    nombre: string;
    bucket: string;
    patrones: ReadonlyArray<{ patron: string; matchType: MatchType; prioridad: number }>;
  },
): Promise<CategoriaConPatrones>;
```

The adapter implements it as a **single Prisma nested create** — `categoria.create({ data: { …, patrones: { create: [...] } }, include: categoriaInclude(userId) })`. A nested create is one statement, therefore one implicit transaction: all-or-nothing without `$transaction`, without an interactive transaction, and without a unit-of-work port.

`crear()` is **replaced** by `crearConPatrones()` rather than kept alongside it: `crear` is `crearConPatrones` with `patrones: []`, so keeping both would be two spellings of one operation (YAGNI: "borrar caminos muertos"). The use case passes `[]` when the caller sends nothing.

**Alternatives rejected**
- *New `CrearCategoriaConPatronesUseCase` composing `CrearCategoriaUseCase` + `CrearPatronUseCase`.* Two repository calls ⇒ two transactions ⇒ exactly the partial-catalog state locked decision 4 eliminates. Also impossible on its face: `CrearPatronUseCase` starts with an ownership lookup on a `categoriaId` that does not exist yet.
- *Interactive `prisma.$transaction(async tx => …)` in the adapter, driving both repositories.* Requires threading a transactional client through two ports (a `IUnitOfWork` port or `withTransaction` callbacks) for one call site — machinery with a single consumer (YAGNI rule 4, `kiss` rule 2). The nested create gets the same guarantee for free.
- *Second HTTP call from the web (`POST /api/categorias` then N × `POST /api/patrones`).* Directly contradicts locked decision 4.

### D-02 — Patrón shape validation is extracted; ownership and uniqueness are not

The nested path needs the same shape rules `CrearPatronUseCase` already owns (length 1–200, `matchType` ∈ set, REGEX compiles, `prioridad` range/default). This is the **same knowledge**, not lookalike code (`dry` rule 1): if the 200-char ceiling moves and only one copy follows, `/api/patrones` and the nested create disagree about what a valid patrón is — a silent divergence in a classification rule.

New pure helper `application/use-cases/validar-patron.ts`:

```ts
export type PatronFormatoError =
  | PatronInvalidoError | MatchTypeInvalidoError | RegexInvalidaError | PrioridadInvalidaError;

export function validarPatron(input: { patron: string; matchType: string; prioridad?: number }):
  Result<{ patron: string; matchType: MatchType; prioridad: number }, PatronFormatoError>;
```

It covers exactly the checks that need **no I/O**, in `CrearPatronUseCase`'s existing order. Ownership (404) and uniqueness (409) stay in their use cases — they are queries, not shape. `CrearPatronUseCase` is refactored to call it and its existing spec suite is the behavior-preservation net (not one assertion changes).

**Within-batch duplicates are checked in memory.** F-3 is load-bearing: there is no DB constraint, and N independent `existePatron` calls cannot see each other's uncommitted rows, so `["uber", "UBER"]` in one request would persist two patrones the API rejects everywhere else. The use case therefore lower-cases each accepted patrón into a `Set` as it validates, and a repeat fails with `PatronDuplicadoError` at the index of the **second** occurrence.

**Validation order** (guard-clause style, all-before-any-write):
```
demo gate → nombre shape → bucket asignable → nombre único (query)
  → for each patrón i: validarPatron → existePatron(query) → within-batch Set
  → crearConPatrones   ← the FIRST and ONLY write
```
Atomicity is therefore doubly guaranteed: nothing is written until every patrón passed (unit-testable without a DB), and the single write is itself atomic (integration-testable).

### D-03 — Per-patrón errors: an index-carrying wrapper, closed map unchanged

New domain error:

```ts
// domain/errors/patron-en-lote-invalido.error.ts
export class PatronEnLoteInvalidoError extends Error {
  constructor(readonly indice: number, readonly causa: PatronFormatoError | PatronDuplicadoError) { … }
}
```

Added to `CrearCategoriaError`. `aCatalogoHttpError` gains **one** branch that recurses into `causa` and spreads the index:

```ts
if (error instanceof PatronEnLoteInvalidoError) {
  return { ...aCatalogoHttpError(error.causa), indice: error.indice };
}
```

Why this shape:
- **The closed map stays closed.** The wrapper introduces no new `code` and no new status — it reuses the causa's. The 11-class table and its `_exhaustive: never` guard are untouched, and the web's `CodigoCatalogo` union (12 members) does not grow. `indice` is orthogonal metadata, never a discriminator.
- **Recursion terminates by type, not by a runtime guard.** `causa` is typed as the patrón-reachable subset, so a `PatronEnLoteInvalidoError` can never wrap another one. The compiler proves it.
- **Never stringly-typed.** The UI keys the message off `code` exactly as today and uses `indice` only to decide *where* to render it.

Plumbing (F-4): `ErrorTraducido` gains `readonly indice?: number`; `responderErrorTraducido` forwards it when present; `catalogoErrorResponseSchema` gains `indice: z.number().optional()` documented as "present only when the failure is attributable to one element of `patrones[]`". This is additive for the other catalog paths, which simply never emit it.

**Alternative rejected:** echoing the offending patrón string back. It is user-supplied free text on a financial surface (ADR-013 scrubbing discipline says do not reflect payload content), and the UI needs a *position* to place the message, which a string cannot give when two rows hold the same text.

### D-04 — Transport schema: optional, strict, capped, no `prioridad`

```ts
const patronEnCategoriaCreateSchema = z.object({
  patron: z.string(),
  matchType: z.string(),
}).strict();

export const categoriaCreateRequestSchema = z.object({
  nombre: z.string(),
  bucket: z.string(),
  patrones: z.array(patronEnCategoriaCreateSchema).max(MAX_PATRONES_POR_CATEGORIA).optional(),
}).strict();
```

- **Layer-honesty gate preserved** (the file's own docblock rule): no length, no enum membership here — those are domain rules producing `PATRON_INVALIDO` / `MATCH_TYPE_INVALIDO`, not `BODY_INVALIDO`.
- **`.max(20)` is the one exception, and it is not a business rule** — it is a request-size guard so a single request cannot ask for an unbounded nested write. It produces the generic `400 BODY_INVALIDO`. Alternative (no cap) rejected: unbounded nested inserts inside one implicit transaction is a cheap DoS. 20 leaves ~4× headroom over any realistic UI use (1–5 patrones).
- **`prioridad` is not accepted.** No client sends it (`PatronInput` deliberately omits it, US-043 §1/Q9b); the server default 100 applies. Adding a knob nothing turns is a dead path (YAGNI rule 3).
- **Backward compatibility is structural**: `.strict()` already rejected unknown keys, so no shipped client can be sending `patrones` today; an absent key is `undefined`, which the use case reads as `[]`, which takes the byte-identical path through today's code. The deployed mobile APK (ADR-038 catalog CRUD) is unaffected. A route test pins this.

### D-05 — Contract regeneration, and the web adopts the generated catalog types

- `pnpm api openapi:emit` regenerates `apps/api/openapi.json`; `pnpm --filter @moneydiary/api-client generate` regenerates `packages/api-client/src/types.gen.ts`. Both land in the same PR as the schema change so `openapi:check` never goes red (proposal, ADR-011).
- The only contract diff is the request body's new optional `patrones[]` plus `CatalogoErrorResponse.indice?`. F-2 means the 201 body is untouched.
- **`apps/web/src/api/types.ts` adopts the generated types**: `PatronDto` / `CategoriaDto` / `CatalogoDto` become re-exports of the generated `CategoriaResponse` / `CatalogoResponse` shapes, matching this file's dominant idiom (`export type { MeDto } from '@moneydiary/api-client'`). The stale exception comment (F-6) is deleted, not rewritten — a comment that asserts a false fact is the repo's own named anti-pattern (`dry`: "docs que repiten código derivan y mienten"). The generated shape is field-identical to the hand-written one, including `bucket`/`matchType` as plain `string` (server is the authority, ADR-024), so no consumer changes.
- The runtime guards `esCategoriaDto`/`esPatronDto` **stay**. They validate the wire, which types cannot; adoption changes the type source, not the parsing discipline.
- ⚠️ *Apply-time check*: `packages/api-client/src/index.ts` exports named aliases (`MeDto`, …). The exact alias mechanism must be read before writing — a `CategoriaResponse`/`CatalogoResponse` alias may need adding there first.

### D-06 — `postCategoria` returns the created categoría; `useCrearCategoria` seeds the cache

```ts
export type CategoriaInput = {
  readonly nombre: string;
  readonly bucket: BucketAsignable;
  readonly patrones?: ReadonlyArray<{ readonly patron: string; readonly matchType: MatchType }>;
};
export async function postCategoria(input: CategoriaInput): Promise<ApiResult<CategoriaDto>>;
```

It keeps using `enviarMutacion` (which returns the raw `Response` on success) and then parses the body through the **existing** `esCategoriaDto` guard; a malformed 201 yields `{ tag: 'parse' }`. The file docblock's blanket claim "los bodies de éxito de las seis mutaciones se DESCARTAN" must be amended in the same commit to name the one exception — otherwise D-05's own anti-lying-comment argument is violated two files later.

`ApiError`'s `server` variant gains `readonly indice?: number`, lifted in `errorConCodigo`, with a doc comment naming its single producer (`POST /api/categorias` with `patrones[]`). A catalog-specific error union was rejected: one optional field on the existing discriminated union is smaller than a parallel error type that every catalog caller would have to widen to.

`useCrearCategoria` becomes `useMutation<CategoriaDto, ApiError, CategoriaInput>` and, in `onSuccess`, **seeds `['categorias']` with the created row before invalidating**:

```ts
queryClient.setQueryData(['categorias'], (prev) => prev ? { categorias: [...prev.categorias, categoria] } : prev);
invalidarCatalogoYDashboard(queryClient);
```

This is not an optimization, it closes a real ordering hazard: the originating row's edit is set to the new `categoriaId` synchronously, but until the invalidation refetch lands, `catalogoEstado.grupos` has no group containing that id — `FilaRevision`'s prop-divergence branch would find no group, leave `bucketUI` stale, and the `<select>` would render `''` (a value not among its options). Seeding makes the option exist in the same commit as the edit. The refetch still runs and reconciles (the seeded row lands last in its bucket until then; the backend sorts by `nombre asc` — a cosmetic, self-healing ordering blip, noted not fixed).

`NuevaCategoriaForm` needs **no change**: it calls `mutate({…}, { onSuccess: onCerrar })` and `onCerrar: () => void` legally ignores the new first argument.

### D-07 — `rowIndex` stability: proven by construction, pinned by a test

**The proposal's blocking risk is resolved: `rowIndex` is a pure function of the file bytes.**

Chain (F-7): `rowIndex = i` over `transacciones`; `transacciones = normalize(buffer, banco)`; `banco = detect(buffer)`. Nothing in that chain reads the database, the clock, the session, or any random source. The Excel normalizer walks sheet rows in file order; the PDF path sorts tokens by `(page, y, x)` — a *total* order over the token set, hence stable for identical bytes. `esDuplicado` and `sugerido` are computed **after** the array is built and never reorder it.

Two further consequences, both used by D-11/D-12:
- Between the two previews of this flow **nothing is persisted** — creating a categoría writes no `Transaccion`, so `esDuplicado` cannot change either. The *only* field that can differ between run 1 and run 2 is `sugerido`. That makes the diff safe by construction.
- The browser re-reads the same `File` object, so the multer buffer is byte-identical.

**Test T-01 (must land in PR1, before any re-run wiring ships)** — `apps/api/test/preview-rowindex-estable.spec.ts`, unit-level with stubbed readers, no DB:
1. Run `PreviewIngestaUseCase.execute` twice over the same fixture buffer with an **empty** catalog, then map each result to `filas.map(f => [f.rowIndex, f.transaccion.descripcion, String(f.cargo), String(f.abono)])` and assert deep equality plus `rowIndex === arrayPosition`.
2. Repeat with a **different catalog on the second run** (one extra `PatronClasificacion` matching some rows) and assert the tuples are still identical while `sugerido` differs — this is exactly the scenario the feature creates.
3. Both assertions run for one Excel fixture (`movimientos-test.xlsx`) and one PDF fixture (`bci-cartola-test.pdf`) — the PDF path carries the sort, so it carries the residual risk.

**Fallback, recorded and deliberately NOT built** (YAGNI: minimum today + registered debt with a trigger): if T-01 ever fails, re-key the overlay by a row identity hash of `(fecha, descripcion, cargo, abono)` instead of `rowIndex`. Trigger: T-01 red, or any change to a normalizer's row ordering.

### D-08 — Popup primitive: an inline `<form>` in the row, following the `NuevaCategoriaForm` precedent

**Chosen:** a new presentational component rendered **inside the originating row's `<li>`, full width, directly under the bucket/categoría selects, in document flow**. Its shell copies `NuevaCategoriaForm`'s recipe (`flex flex-col gap-4 rounded-md border border-border p-4`), it is a real `<form>` labelled by a visible heading (`aria-labelledby`), and it owns two behaviors the long-list context demands: **focus moves to `Nombre` on open**, and **Escape closes it and returns focus to the "+" trigger** (the trigger ref lives in `FilaRevision`). No focus trap — consistent with the app's non-modal identity.

**Why not Radix `Popover` (`ui/popover.tsx`, currently unused):** it portals and floats — the exact two properties DESIGN.md's signature component was defined *against* ("no overlay, no portal", calm over drama). Its `w-72` (288px) cannot hold a `matchType` select + `patron` input + delete button per row; widened to ~360px it overflows a 360px viewport once `sideOffset` is added. Floating content would also have to negotiate z-index with `PreviewMuestra`'s `sticky top-0 z-10` header band *and* its `sticky bottom-16 z-10` bulk toolbar. And it would make this feature the first consumer of an unused primitive — a new interaction pattern needing ADR-level justification (`kiss` rule 2) to save nothing.

**Why not a new `ui/dialog.tsx` (modal + backdrop):** explicitly outside scope per the proposal, and against DESIGN.md's identity.

**Why not `InlineConfirm`, despite the "Don't hand-roll a new confirmation shell" rule:** that Don't governs *confirmations*, and this is a creation form. `InlineConfirm` hard-codes `role="alertdialog"`, which announces a multi-field creation form to assistive tech as an **alert** — semantically false and a WCAG 2.2 AA / ADR-018 regression, in exchange for saving ~10 lines of focus/Escape handling. The house precedent for "a creation form toggled open inline by a button" is `NuevaCategoriaForm`, not `InlineConfirm`, and this design follows it. Nothing about the shared confirmation shell is duplicated: destructive confirmations in this feature (none exist) would still compose `InlineConfirm`.
*Registered debt, second-occurrence note (`dry` 3-strike rule):* if a third inline non-confirmation form appears, generalize `InlineConfirm` into an `InlineDialog` with a configurable `role`. Two occurrences today — annotate, do not extract.

**Interaction constraints**
- At most **one** form open across the whole preview. `FilaRevision` cannot enforce that from local state, so the open row is held one level up (D-10).
- The form stays mounted when its date group is collapsed (`PreviewMuestra` hides groups with `hidden`, it does not unmount them).
- Toggling "Solo sin clasificar" can unmount the row and lose an in-progress form. Accepted: the toggle is a deliberate act and the filter button is already hidden during other multi-step interactions.
- Never rendered for `esDuplicado` rows (they render no categoría select either).

### D-09 — Form component and state

New `apps/web/src/components/preview/NuevaCategoriaDesdeFilaForm.tsx` (co-located with the preview surface, not with `configuracion/categorias/`, because its lifecycle belongs to the review flow):

```ts
{
  bucket: string;                 // read-only, from the row's chosen bucket
  descripcionFila: string;        // seeds the first patrón
  onCancelar: () => void;
  onCreada: (categoria: CategoriaDto) => void;
  esDemo: boolean;                // defensive; the trigger is already disabled
}
```

Local state:
```ts
const [nombre, setNombre] = useState('');
const [filas, setFilas] = useState<PatronBorrador[]>([
  { clave: crypto.randomUUID(), patron: descripcionFila, matchType: 'CONTAINS' },
]);
```
Keyed rows (`clave`), never array index — removing row 0 must not make row 1 inherit its React state or its error. The first row is prefilled per locked decision 3 and is fully editable and removable; an empty list is a valid submission.

Composition: `CampoTexto` for `Nombre` and `Patrón`, `CampoSelect` for `matchType` built from `MATCH_TYPES` + `ETIQUETA_MATCH_TYPE` (the same `OPCIONES_MATCH_TYPE` shape `PatronFila` uses), the bucket shown as static text via `ETIQUETA_BUCKET` (so "Deseos" reads "Gustos", DESIGN.md Do #4). `PatronFila` itself is **not** reused: it is a per-row *auto-committing* controller wired to three mutations against a persisted `categoriaId` — the opposite of a draft row in an unsaved form. Reusing it would mean bolting a "not persisted yet" mode onto the exact component US-042's D-02 refused to give a `modo` flag.

Validation strategy (ADR-024, server is the authority):
- No client-side blocking. `Crear` is disabled only while `mutation.isPending` or `esDemo`.
- REGEX is pre-checked as a **hint** only, identical to `PatronFila`: `role="status"`, "Esa expresión regular podría no ser válida.", commit path untouched.
- Error placement: on failure, `error.indice !== undefined` ⇒ render `mensajeDeErrorCatalogo(error)` in a `role="alert"` **inside** `filas[indice]` (the index is the position in the submitted array, which equals the position in `filas`); otherwise render it in the form-level `role="alert"` above the footer. One message at a time — the API fails on the first bad patrón by construction (D-02).
- Submit: `mutation.mutate({ nombre, bucket, patrones: filas.map(({patron, matchType}) => ({patron, matchType})) }, { onSuccess: onCreada })`. Blank-only patrón rows are dropped client-side before submit (a blank row is "not filled in yet", the same reading `PatronFila.commit` already applies), so an untouched extra row never produces `PATRON_INVALIDO`.

Footer: `Cancelar` (outline, always enabled — it issues no request) + `Crear` (primary), house 36px sizes.

### D-10 — Orchestration lives in `SubirCartola`; `FilaRevision` stays presentational

`SubirCartola` owns `archivo`, `edits`, `previewMutation` and the live region — all four inputs of the sequence. A `useReevaluarPreview` hook would have to receive all four and return a callback plus its own announcement state: an indirection with exactly one call site (`kiss` rule 2, YAGNI rule 4). **Decision: one named handler, `handleCategoriaCreada(rowIndex, categoria)`, in `SubirCartola`.**

Props drilled through `PreviewMuestra` (which already pass-throughs `onEditChange` unchanged):

| Prop | Type | Owner | Consumer |
|---|---|---|---|
| `onCategoriaCreada` | `(rowIndex: number, categoria: CategoriaDto) => void` | `SubirCartola` | `FilaRevision` |
| `filaCreando` | `number \| null` | `PreviewMuestra` | `FilaRevision` (`abierto = filaCreando === fila.rowIndex`) |
| `onAbrirCreacion` | `(rowIndex: number \| null) => void` | `PreviewMuestra` | `FilaRevision` |
| `esDemo` | `boolean` | `SubirCartola` | `FilaRevision` |

`filaCreando` sits in `PreviewMuestra`, not `SubirCartola`: it is ephemeral UI state of the review table, exactly like `seleccionados` and `gruposColapsados`, and it never reaches the wire. Single-open (D-08) falls out of it being a single value. `FilaRevision` gains **no** business responsibility — it renders a trigger, holds a trigger ref for focus return, and forwards the callback; `useCrearCategoria()` is owned by the form component, which mounts only while open (so exactly one mutation instance exists at a time, mirroring `NuevaCategoriaForm`).

**`previewData` is hoisted out of the mutation.** F-9 is the reason: `previewMutation.mutate()` clears `data`, so re-running with the current code unmounts the entire review table and shows the skeleton — destroying the user's scroll position and their place in a 300-row list at the precise moment they were rewarded for creating a categoría. `SubirCartola` gains `const [previewData, setPreviewData] = useState<PreviewIngestaDtoConCanonicos | null>(null)`, written from `onSuccess` on **both** the initial preview and the re-run, read everywhere `previewMutation.data` is read today (`mostrarPreview`, the `<PreviewMuestra>` props, the draft write-through effect, the discard-confirm counts, the `exito` banco line), and cleared by the same three reset paths that already clear `edits` (`procesarArchivoSeleccionado`, `handleDescartar`, `handleSubirOtra`). `previewMutation` keeps owning pending/error only.

This is the highest-regression-risk edit in the change (`SubirCartola` is the most critique-scarred file in the web app) — it gets its own commit inside PR4 with the existing suite green before anything else is added.

### D-11 — Re-run UX: table stays, no skeleton, no focus theft

`estado` is still derived from the mutations; no new `EstadoSubida` member (the machine stays type-exhaustive). A re-run is distinguished by `previewData !== null && estado === 'previsualizando'`:

- **Skeleton** renders only when `previewData === null` (first preview). During a re-run the table stays mounted with `aria-busy="true"` on the preview `<section>`; "Agregar transacciones" and "Descartar" are disabled while it runs.
- **Status message** uses one documented override on top of the exhaustive record: `mensajeEstado = mensajeOverride ?? MENSAJE_POR_ESTADO[estado]`, where the override is `'Actualizando la vista previa con la nueva categoría…'` during a re-run and the D-12 diff sentence on the transition to `preview-listo`.
- **Focus is not stolen.** The `useEffect` that focuses `previewHeadingRef` on `preview-listo` is suppressed for re-runs (a `reevaluandoRef` flag set when the re-run starts, consumed and cleared when it settles). Instead, focus returns to the **"+" trigger of the originating row** — the element the user activated, per the standard return-focus-to-trigger rule — managed entirely inside `FilaRevision` via its trigger ref, on both success and cancel. No cross-component focus plumbing. `key={fila.rowIndex}` is stable across the re-run, so the ref survives (D-07 guarantees the key itself is stable).
- **sessionStorage draft** needs no special handling: the write-through effect's deps become `[archivo, previewData, edits]`, both of which change, so the draft is re-saved with the new suggestions and the merged overlay automatically.

### D-12 — Diff and announcement

Computed in the re-run's `onSuccess`, from a snapshot of the pre-run `filas` captured in the handler's closure:

```
anterior = Map(previewDataAnterior.filas.map(f => [f.rowIndex, f.sugerido?.categoriaId ?? null]))
cambiadas = nuevas.filas.filter(f =>
    !f.esDuplicado &&
    !editsDespues.has(f.rowIndex) &&                       // edits always win (D-05 merge rule)
    (f.sugerido?.categoriaId ?? null) !== anterior.get(f.rowIndex)
).length
```

Keyed by `rowIndex` through a `Map`, never by array position — belt and braces on top of D-07. `editsDespues` is the map built in step 1 of the sequence, so the originating row is excluded (it changed by explicit edit, not by suggestion) and every previously-edited row is excluded (locked decision 1). This is pure presentation over two backend responses — **no matching logic runs client-side** (ADR-024).

Copy, rendered in the **existing** `role="status"` region (see D-11's override — one live region on the page, so there is no double announcement):

| Case | Spanish |
|---|---|
| `N > 1` | `«{nombre}» se aplicó a {N} filas más.` |
| `N === 1` | `«{nombre}» se aplicó a 1 fila más.` |
| `N === 0` | `«{nombre}» se creó. Ninguna otra fila coincide con sus patrones.` |

The message persists until the next state transition — it is the blast-radius disclosure that mitigates the "greedy CONTAINS" risk, so it must not auto-dismiss. A second dedicated live region was rejected: two `role="status"` nodes changing in the same transition double-announce.

### D-13 — A failed re-run must not destroy a successful creation

Today `previewMutation.isError ⇒ estado === 'preview-error' ⇒ mostrarPreview === false`, which would wipe the review table *after* the categoría was already created — the worst possible end state. With `previewData` hoisted (D-10) the guard changes to:

- `mostrarPreview = previewData !== null && estado !== 'exito'`.
- The full-width `preview-error` block only renders when `previewData === null` (a failed *first* preview — unchanged behavior).
- A failed **re-run** keeps the last good table and shows a non-blocking inline notice inside the preview section: `'No se pudo actualizar la vista previa. Tu categoría se creó y esta fila ya la usa; las demás filas conservan su sugerencia anterior.'` The user can still commit; the backend re-classifies untouched rows at commit anyway (D-11 of US-059), so the outcome is correct, only the preview is stale.

### D-14 — Demo mode

The "+" is **rendered but `disabled`** on every eligible row (PRODUCT.md principle 4: degrade to read-only with an honest nudge, never a broken or missing control), with `aria-describedby="demo-catalogo-nota"`. That note is rendered **once** — 300 copies of the same paragraph is absurd — as a sibling of the existing `MENSAJE_DEMO_COMMIT` note inside `SubirCartola`'s `esDemo &&` block:

```tsx
<p id="demo-catalogo-nota" role="note" className="text-sm text-muted-foreground">{MENSAJE_DEMO_CATALOGO}</p>
```

reusing the existing constant verbatim ("…Crea una cuenta real para editar tus categorías."). The form is unreachable in demo; the server still answers `403 DEMO_SOLO_LECTURA` through the closed map if it is called directly.

---

## 3. Success-path sequence

```
User (row 12, bucket "Necesidades" already chosen)
  │
  ├─ click "+"                                   FilaRevision → onAbrirCreacion(12)
  │                                              PreviewMuestra: filaCreando = 12
  │                                              Form mounts in <li>, focus → Nombre
  ├─ types "Farmacia", edits patrón 1
  │  (prefilled "FARMACIA CRUZ VERDE" / CONTAINS), adds patrón 2
  └─ click "Crear"
        │
        │ POST /api/categorias { nombre, bucket, patrones:[…] }
        ▼
   registrarCategorias
        │ categoriaCreateRequestSchema.safeParse           (shape only, D-04)
        ▼
   CrearCategoriaUseCase.execute
        │ demo gate → nombre → bucket → existeNombre
        │ ∀ patrón i: validarPatron → existePatron → Set within-batch   (D-02)
        ▼
   ICategoriaRepository.crearConPatrones                   (D-01)
        │ prisma.categoria.create({ data:{…, patrones:{create:[…]}}, include })
        │ ← ONE statement = ONE transaction
        ▼
   201 aCategoriaDto(categoria)   { id, nombre, bucket, patrones:[…], transaccionesCount:0 }
        │
        ▼
   postCategoria → esCategoriaDto guard → ApiResult<CategoriaDto>      (D-06)
        │
        ▼
   useCrearCategoria.onSuccess
        │ queryClient.setQueryData(['categorias'], append)   ← option exists NOW
        │ invalidarCatalogoYDashboard(queryClient)           ← refetch reconciles
        ▼
   Form.onCreada(categoria) → FilaRevision closes form, focus → "+" trigger  (D-11)
        │
        ▼
   SubirCartola.handleCategoriaCreada(12, categoria)
        │ 1. editsDespues = new Map(edits).set(12, categoria.id); setEdits(editsDespues)
        │ 2. previewAnterior = previewData          ← snapshot for the diff
        │ 3. reevaluandoRef = true
        │ 4. previewMutation.mutate(archivo, { onSuccess: nuevo => { … } })
        ▼
   POST /api/ingestas/preview  (same File bytes ⇒ same rowIndex order, D-07)
        │ PreviewIngestaUseCase re-reads the LIVE catalog → new `sugerido`s
        ▼
   onSuccess(nuevo)
        │ setPreviewData(nuevo)                     ← table never unmounted (D-10)
        │ N = diff(previewAnterior, nuevo, editsDespues)               (D-12)
        │ setMensajeOverride(copy(N, categoria.nombre))
        │ reevaluandoRef = false → heading focus effect suppressed     (D-11)
        ▼
   role="status": «Farmacia» se aplicó a 7 filas más.
   Rows 12 (edit) + 7 untouched matches now display "Farmacia". Nothing persisted yet.
```

---

## 4. Affected files

| File | Change | Slice |
|---|---|---|
| `apps/api/src/domain/errors/patron-en-lote-invalido.error.ts` | **new** — index-carrying wrapper (D-03) | PR1 |
| `apps/api/src/application/use-cases/validar-patron.ts` | **new** — extracted shape validator (D-02) | PR1 |
| `apps/api/src/application/use-cases/crear-patron.use-case.ts` | refactor to call `validarPatron`; behavior identical | PR1 |
| `apps/api/src/application/use-cases/crear-categoria.use-case.ts` | optional `patrones`, per-patrón loop, error union grows | PR1 |
| `apps/api/src/application/ports/categoria-repository.port.ts` | `crear` → `crearConPatrones` (D-01) | PR1 |
| `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts` | nested create with the existing include | PR1 |
| `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts` | optional `patrones[]`, `.strict()`, `.max(20)` (D-04) | PR1 |
| `apps/api/src/infrastructure/http-express/schemas/catalogo-error.schema.ts` | `indice?: number` | PR1 |
| `apps/api/src/infrastructure/http-express/routes/catalogo-http-error.ts` | one recursive branch, `_exhaustive` intact | PR1 |
| `apps/api/src/infrastructure/http-express/routes/responder-error-traducido.ts` | forward `indice` | PR1 |
| `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts` | pass `parsed.data.patrones` through | PR1 |
| `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | 400 description mentions `indice` | PR1 |
| `apps/api/openapi.json` | **regenerated** (`openapi:emit`) | PR1 |
| `packages/api-client/src/types.gen.ts` (+ `src/index.ts` alias) | **regenerated** (`generate`) | PR1 |
| `apps/api/test/preview-rowindex-estable.spec.ts` | **new** — T-01, the blocker's proof (D-07) | PR1 |
| `apps/web/src/api/types.ts` | adopt generated catalog types, delete stale exception (D-05) | PR2 |
| `apps/web/src/api/categorias.ts` | `postCategoria` returns `CategoriaDto`; `patrones` input; `indice` lifted; docblock amended | PR2 |
| `apps/web/src/api/client.ts` | `ApiError.server.indice?: number` | PR2 |
| `apps/web/src/api/use-crear-categoria.ts` | typed result + cache seeding (D-06) | PR2 |
| `apps/web/src/components/preview/NuevaCategoriaDesdeFilaForm.tsx` | **new** — the form (D-08/D-09) | PR3 |
| `apps/web/src/components/FilaRevision.tsx` | "+" trigger, trigger ref, form slot, demo gating | PR3 |
| `apps/web/src/components/PreviewMuestra.tsx` | `filaCreando` state + prop pass-through | PR3 |
| `apps/web/src/components/SubirCartola.tsx` | `previewData` hoist, `handleCategoriaCreada`, diff + announcement, busy/failure states, demo note | PR3 (note) / PR4 |
| `apps/web/e2e/crear-categoria-preview.e2e.ts` | **new** — stubbed happy path | PR4 |
| `openspec/specs/web-import-preview/spec.md`, `openspec/specs/catalogo-clasificacion-ownership/spec.md` | spec deltas (owned by sdd-spec) | per slice |

---

## 5. Testing plan (strict TDD is active — tests first, every slice)

**API unit** (`vitest`, no DB)
- `crear-categoria.use-case.spec.ts`: absent `patrones` ⇒ byte-identical to today (regression); `[]` ⇒ same; valid list ⇒ exactly one `crearConPatrones` call with the full payload; invalid patrón at index 1 ⇒ `PatronEnLoteInvalidoError{indice:1}` **and the repository is never called** (atomicity without a DB); within-batch case-insensitive duplicate ⇒ error at the index of the *second* occurrence (F-3 is why this test exists); pre-existing duplicate ⇒ `PatronDuplicadoError` wrapped with its index; demo ⇒ `CatalogoDemoSoloLecturaError` before any patrón is inspected; nombre/bucket failures still precede patrón failures.
- `validar-patron.spec.ts` **new**; `crear-patron.use-case.spec.ts` **unchanged and green** — the proof that the extraction preserved behavior.
- `catalogo-http-error.spec.ts`: the wrapper maps to the causa's status+code plus `indice`; the closed map still compiles.
- `categorias.routes.spec.ts`: 201 nests the created patrones; a 400 body carries `indice`; a body without `patrones` behaves exactly as before (mobile/back-compat pin); `>20` and unknown patrón keys ⇒ `BODY_INVALIDO`.
- `categorias.schema.spec.ts`: response/DTO sync assertion extended.
- **T-01 `preview-rowindex-estable.spec.ts`** (D-07) — Excel + PDF, empty and non-empty catalog.

**API integration** (`pnpm api test:integration`, gated `ALLOW_DESTRUCTIVE_DB=1`, local Postgres per ADR-029) — extend `test/catalogo-crud.int-spec.ts`: a request whose second patrón duplicates an existing one leaves **zero** new `Categoria` and **zero** new `PatronClasificacion` rows. This is the only test that exercises the real transaction; the unit test only proves no write was attempted.

**Contract drift** — `pnpm api openapi:check` (existing CI gate) plus `pnpm --filter @moneydiary/api-client typecheck` after regeneration.

**Web unit** (`vitest` + RTL + `vitest-axe`, ADR-018)
- Form: first patrón prefilled with the row description as `CONTAINS`; add/remove keyed rows; zero patrones submits; REGEX hint appears and never blocks; submitted payload shape; `indice` error renders on the named row, non-indexed error renders form-level; `Crear` disabled while pending; Escape closes; focus lands on `Nombre` on open; axe clean while open.
- `FilaRevision`: "+" not rendered without a bucket, rendered once one is chosen, never for `esDuplicado` rows; disabled with `aria-describedby` in demo; focus returns to the trigger on cancel and on success.
- `SubirCartola` (mocked mutations): the originating row's edit is set; the re-run is called with the **same `File` instance**; pre-existing edits survive; **the table stays mounted during the re-run** (no `[data-skeleton-preview]`); the status region announces N>1 / N===1 / N===0; `previewHeadingRef` is **not** focused; a failed re-run keeps the previous table and shows the notice; the sessionStorage draft holds the post-re-run preview.
- `categorias.test.ts`: `postCategoria` returns the parsed DTO; malformed 201 ⇒ `{tag:'parse'}`; `indice` lifted from a 400.
- `use-crear-categoria.test.ts`: cache seeded before invalidation.

**e2e** (Playwright, `stubApi` doctrine — no real backend) `crear-categoria-preview.e2e.ts`: small 6-row fixture; stub `POST /api/categorias` → 201; stub `POST /api/ingestas/preview` to return a *second, different* body on the second call (extra rows carrying the new `sugerido`); assert the announcement text, the new categoría shown on the matching rows, and that a pre-existing manual override is untouched.

---

## 6. Delivery slicing (input for `sdd-tasks`)

Four chained PRs. `chain_strategy: feature-branch-chain` is recommended — PR2 does not typecheck until PR1's regenerated `api-client` exists.

| PR | Scope | Est. hand-written lines | Independently shippable? |
|---|---|---|---|
| **PR1** | API: domain error, `validarPatron` extraction, use case, port, adapter, Zod, error map + `indice` plumbing, `openapi:emit`, `api-client generate`, **T-01** | ~350 + generated | Yes — additive, optional field; no client sends it yet |
| **PR2** | Web client seam: adopt generated catalog types, `postCategoria` returns the DTO + accepts `patrones`, `ApiError.indice`, `useCrearCategoria` typed + cache seeding | ~150 | Yes — inert for the UI; `NuevaCategoriaForm` keeps working |
| **PR3** | Preview UI: the form component, "+" trigger + focus return in `FilaRevision`, `filaCreando` in `PreviewMuestra`, demo note. `SubirCartola` wires a minimal handler that only sets the originating row's edit — **no re-run yet** | ~300 | Yes — "create a categoría from a row and the row adopts it" is a coherent increment |
| **PR4** | Orchestration: `previewData` hoist (own commit, suite green first), `handleCategoriaCreada` re-run, diff + announcement, busy/failure states, e2e | ~300 | Yes — completes the loop |

⚠️ PR1 exceeds the 400-line budget once `openapi.json` + `types.gen.ts` are counted. Those are **generated artifacts** regenerated by a scripted command, not reviewable prose — `sdd-tasks` should carry a `size:exception` justification naming them, or exclude generated paths from the count if the harness supports it.

---

## 7. Risks and open items

| Risk | Severity | Mitigation |
|---|---|---|
| The `previewData` hoist regresses `SubirCartola`'s state machine (draft recovery, discard confirm, exito landing) | **High** | Its own commit at the head of PR4 with the full existing suite green before any new behavior lands; the draft/discard/exito tests are the gate |
| `packages/api-client/src/index.ts`'s alias mechanism is assumed, not read | Medium | Apply must read that file before writing D-05; if aliases are hand-maintained, adding `CategoriaResponse`/`CatalogoResponse` is a PR1 task |
| A greedy `CONTAINS` patrón re-labels many unrelated rows | Medium | Rows are suggestions until commit; the D-12 announcement makes the blast radius visible and persistent |
| Seeded cache row sorts last until the refetch lands (backend sorts `nombre asc`) | Low | Cosmetic and self-healing; noted, not fixed (YAGNI) |
| `.max(20)` is a judgement call, not a measured limit | Low | Generous vs. realistic use (1–5); raising it is a one-line change with no migration |
| `role="alertdialog"` semantics debate (D-08) could be re-litigated in review | Low | Rationale recorded here with the DESIGN.md scope argument and the `NuevaCategoriaForm` precedent |
| Toggling "Solo sin clasificar" while the form is open loses draft form state | Low | Accepted; documented in D-08 |

**Assumptions requiring validation at apply time:** the api-client alias mechanism (above); that `crypto.randomUUID()` is available in the web's browser targets (else `useId()` per row, or a monotonic counter).

**Resolved from the proposal:** open choices 1–6 are decided (D-08, D-10, D-07, D-03, D-05, D-12 respectively). The `rowindex-stability` blocker in `state.yaml` is **cleared by D-07**, conditional on T-01 landing in PR1.
