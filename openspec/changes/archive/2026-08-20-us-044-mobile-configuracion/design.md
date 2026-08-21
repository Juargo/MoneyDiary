# Design: US-044 — Mobile Configuración with parity (perfil + categorías)

> Scope contract: this design answers `proposal.md` and nothing else. Its four binding product
> decisions and its §10 Closed Questions (CQ-1…CQ-6) are settled inputs and are treated here as
> immovable. Where a §Approach sentence collides with evidence found in the shipped code, the
> evidence wins and the reconciliation is recorded explicitly (D-03, D-12, D-16 — three such
> collisions were found).

---

## 0. Architecture at a glance

No new architectural pattern, no new state library, no query layer. `apps/mobile` keeps the exact
four-tier split it has had since Sprint 3, and every new artifact lands in the tier it already
belongs to:

```
app/<route>.tsx          ← route: owns fetch + state machine + navigation
  └─ src/components/     ← pure presentation (props in, JSX out; no fetch, no env, no money math)
       └─ src/domain/    ← pure functions: copy tables, orchestration rules, grouping, plurals
  └─ src/api/            ← fetch boundary: ApiResult<T>, never throws
  └─ src/theme/          ← design tokens
```

Dependency rule (mobile analog of ADR-005): `domain ← components ← app`; `api` is a leaf the route
owns, and **`api → domain` is the existing direction** (`client.ts` already imports
`esMontoStringValido` from `src/domain/formatear-monto.ts`). That direction is load-bearing for this
change: the new copy tables live in `domain/` and must be able to name `ApiError`, so the type
declaration moves *down* into `domain/` rather than the tables reaching *up* into `api/` (D-04).

### Composition tree after this change

```
app/configuracion.tsx                              ← route: owns `me` fetch + catálogo fetch + tab state
└─ SafeAreaView > ScrollView
   ├─ "Volver al resumen"   (on-screen back — the stack header is hidden, D-03)
   ├─ h1 "Configuración"
   ├─ TabsConfiguracion   tablist: [Perfil | Categorías]   ← local useState, NOT routes
   └─ switch(tab)
       ├─ 'perfil'     → PerfilPanel      me
       │                   ├─ CampoTexto ×4  (Nombre, Email, Password actual, Password nueva)
       │                   ├─ GoogleEstado   (read-only pill, local component)
       │                   └─ message regions (ok: liveRegion · error: role="alert")
       └─ 'categorias' → CategoriasPanel  catalogo
                           ├─ NuevaCategoriaForm  (inline, toggled)
                           └─ per bucket group: CategoriaFila ×N → router.push('/categoria/{id}')

app/categoria/[id].tsx                             ← route: owns its OWN catálogo fetch + resolve-by-id
└─ SafeAreaView > ScrollView
   ├─ "Volver a Categorías" (on-screen back, D-03)
   ├─ h1 "Editar categoría"
   └─ EditarCategoria  categoria
        ├─ CampoTexto "Nombre" · SelectorChips "Bucket (obligatorio)"
        ├─ PatronesSection → PatronFila ×N (+ new placeholder rows)
        └─ footer: Guardar · Cancelar · Eliminar categoría   → Alert.alert confirmations
```

Two independent reads exist after this change (`GET /api/auth/me` on the Perfil tab, `GET
/api/categorias` on the Categorías tab and again on the edit route). Neither can blank the other:
each tab owns its own `{loading|error|data}` phase, exactly like `app/index.tsx`'s SLOT.

---

## 1. Layer-by-layer design

### 1.1 `src/domain/api-error.ts` (NEW — a move, not an invention)

`ApiError`, `ApiResult<T>` and `copiaPorApiError` move **verbatim** out of `src/api/client.ts` into
`src/domain/api-error.ts`, and `client.ts` re-exports all three:

```ts
// src/domain/api-error.ts
export type ApiError =
  | { tag: 'unauthorized' }
  | { tag: 'network' }
  | { tag: 'parse' }
  | { tag: 'http'; status: number; code?: string };   // ← the ONLY new syntax (CQ-3)
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
export function copiaPorApiError(error: ApiError): string   // unchanged, byte for byte

// src/api/client.ts
export type { ApiError, ApiResult } from '../domain/api-error';
export { copiaPorApiError } from '../domain/api-error';
```

Every existing importer (`states/Error.tsx`, `app/index.tsx`, `app/subir.tsx`, `app/login.tsx`, four
spec files) keeps importing from `./client` unchanged — **zero call-site churn, zero test churn**.

Why the move is required and not cosmetic: the perfil/catálogo copy tables are pure functions that
belong in `domain/` (proposal §4.6) and they must (a) name `ApiError` and (b) call
`copiaPorApiError` for the transport tags (D-08). Leaving both in `api/` would force a runtime
`domain → api` import — a real inversion of the dependency rule, not a type-only one.

**`code?: string` (CQ-3)** is an *additive optional field on the existing `http` member*, not a
fifth `server` tag. A fifth tag would force a new branch into `copiaPorApiError`, `states/Error.tsx`
and `subir.tsx`'s `mensajeDeError` for a state they already handle correctly as `http`.
`post-ingesta.ts`'s local `PostIngestaError` (`{tag:'http';status;message?}`) stays structurally
compatible and is not touched.

`code` is populated **only** by the new mutation/catalog fetchers (§1.3/§1.4). Every shipped fetcher
in `client.ts` keeps leaving it `undefined`, so no existing behaviour changes.

### 1.2 `src/api/client.ts` — the `esMeDto` fix (the proposal's blocking gap)

Today (`client.ts:148-156`) the guard is `userId: string && email: string`, which (a) rejects
`email: null` as a parse failure and (b) validates none of the three fields the Perfil tab renders.
After:

```ts
function esMeDto(value: unknown): value is MeDto {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<MeDto>;
  return (
    typeof c.userId === 'string' &&
    (typeof c.email === 'string' || c.email === null) &&   // relaxation
    typeof c.nombre === 'string' &&                        // tightenings
    typeof c.esDemo === 'boolean' &&
    typeof c.googleVinculado === 'boolean'
  );
}
```

Mirrors `AuthMeResponse` exactly (`packages/api-client/src/types.gen.ts:1780-1788`). The
tightenings are safe by construction: `fetchMe`'s only shipped consumer is the cold-start session
gate, which treats every non-`unauthorized` failure as **optimistically authenticated**
(`session-context.tsx:78-84`) — so even a hypothetical backend that dropped a field cannot lock a
user out; it would surface as this screen's error state, which is the correct outcome.

`esDemo` is validated even though CQ-4 leaves the proactive demo UI out: it is the discriminator
that makes `email: null` legitimate rather than a malformed body, so it is consumed *by the guard's
own reasoning*. This is the one deliberate exception to `post-ingesta.ts:41-48`'s "validate only
what flows to render" rule, and it is stated rather than smuggled.

### 1.3 `src/api/mutacion.ts` (NEW) — one shared mutation transport

```ts
export async function enviarMutacion(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<ApiResult<Response>>
```

Same discipline as every fetcher in `client.ts`: `API_BASE_URL` guard → `network`;
`construirHeadersSesion()` reused verbatim (plus `content-type: application/json` **only** when a
body is present); `401 → unauthorized`; other non-2xx → `errorConCodigo(res)`; never throws.
Success returns the raw `Response`; every caller in this change discards it (web's Q2a discipline:
the fresh state comes from the re-fetch, never from the mutation's success body).

`errorConCodigo` reads `body.code` defensively (`try/catch` around `res.json()`, `typeof code ===
'string'` or `undefined`) — the mobile twin of `apps/web/src/api/categorias.ts:89-107`.

**Why extract on occurrence two, against `dry`'s three-strike rule (D-06):** web wrote this exact
helper twice (`api/perfil.ts:61-122` and `api/categorias.ts:89-155`) and its own docstring records
the verdict of a judgment-day round, both judges concurring: *"hoy son dos copias idénticas sin nada
que las enlace — un fix en una no se propaga a la otra y ni tsc ni eslint lo detectan"*
(`categorias.ts:16-21`). Mobile would be landing occurrences two **and** three simultaneously, in
one change, with the divergence cost already measured on the other client. That is evidence, not
anticipation.

### 1.4 `src/api/perfil.ts` and `src/api/categorias.ts` (NEW)

| module | exports | notes |
|---|---|---|
| `perfil.ts` | `patchPerfil(patch): ApiResult<void>` · `patchPassword(patch): ApiResult<void>` | Success bodies discarded (200 identity / 204 no-body). `PerfilPatch = {nombre?, email?, passwordActual?}`, `PasswordPatch = {passwordActual, passwordNueva}` — mirrors `apps/web/src/api/perfil.ts:29-38` |
| `categorias.ts` | `fetchCatalogo(): ApiResult<CatalogoDto>` + the six mutations | `fetchCatalogo` has its own fetch (it is the only call that reads a body) with `esCatalogoDto`; the six mutations delegate to `enviarMutacion` |

**Read vs. write typing, mirrored from web verbatim** (`apps/web/src/api/categorias.ts:39-48`,
`205-238`): the runtime guards keep `bucket` and `matchType` as plain `string` — the server is the
authority on validity (ADR-024; ADR-037: a categoría is valid because it has a `bucketId` row, not
because a client union says so), so a bucket the client does not recognise must still **list**, not
fail parsing. The *write* payload types use the closed literal unions (`BucketAsignable`,
`MatchType`), so a mis-capitalised value fails at compile time instead of as a runtime 400.

**`prioridad` is never sent** (binding decision 3): it is absent from `PatronInput`/`PatronPatch`,
so the backend default (100) always applies.

Guards, per element, never throwing (`esBucketResumenDto`'s judgment-day lesson applied):
`esPatronDto` (5 fields), `esCategoriaDto` (4 fields + `patrones.every(esPatronDto)`),
`esCatalogoDto` (`categorias.every(esCategoriaDto)`). `transaccionesCount` is validated as a
`number` and its range is **not** checked — it is the input to a destructive warning, so a missing
field must be a `parse` failure, never an `undefined` interpolated into "N transacciones quedan…".

### 1.5 DTO types — `packages/api-client` gains three aliases

`CatalogoResponse`, `CategoriaResponse` and `PatronResponse` already exist in
`packages/api-client/src/types.gen.ts` but have no alias in `index.ts`. Three one-line indexed
accesses are added there (`CatalogoDto`, `CategoriaDto`, `PatronDto`), and `src/domain/catalogo.types.ts`
re-exports them the way `resumen.types.ts` already re-exports `MeDto`.

This is the ADR-011/012-sanctioned path (generate, don't hand-mirror) and it costs ~9 lines. Web
hand-wrote these DTOs in `apps/web/src/api/types.ts` before the package existed; this change does
**not** migrate web (out of scope, §9.9 forbids touching `apps/web/**`) — it simply does not repeat
the hand-mirroring on the third client.

`src/domain/catalogo-constantes.ts` ports `apps/web/src/api/catalogo-constantes.ts:11-18` verbatim:
`BUCKETS_ASIGNABLES = ['Necesidades','Deseos','Ahorro'] as const` (which **is** the group order —
no separate `ORDEN_BUCKETS`) and `MATCH_TYPES = ['CONTAINS','STARTS_WITH','REGEX'] as const`.

### 1.6 Pure domain helpers

| file | ported from | contract |
|---|---|---|
| `domain/agrupar-categorias-por-bucket.ts` | `apps/web/src/domain/agrupar-categorias-por-bucket.ts:32-47` | verbatim: fixed `BUCKETS_ASIGNABLES` order, empty groups dropped, unknown buckets collected into a trailing `'Otros'` group |
| `domain/plural.ts` | `apps/web/.../categorias/plural.ts:12-26` | verbatim: `etiquetaPatrones` (3 forms: `sin patrones` / `1 patrón` / `N patrones`), `etiquetaTransacciones` (2 forms) |
| `domain/impacto-catalogo.ts` | `apps/web/.../categorias/mensajes-catalogo.ts:180-247` | verbatim `ImpactoCatalogo` union + `fraseDeImpacto` → `{titulo, lineas, textoConfirmar}`, closed by `const _exhaustive: never` |
| `domain/mensajes-perfil.ts` | `apps/web/.../perfil/mensajes.ts:25-149` | the `status:code` table, minus the three Google rows (§1.9) |
| `domain/mensajes-catalogo.ts` | `apps/web/.../categorias/mensajes-catalogo.ts:33-163` | `CodigoCatalogo` (12 members) + `COPY: Record<CodigoCatalogo,string>` + `ETIQUETA_MATCH_TYPE` |
| `domain/guardar-perfil.ts` | `apps/web/src/api/use-guardar-perfil.ts:22-127` | `construirPerfilPatch` + the two-call orchestration, minus TanStack (§1.8) |

`ETIQUETA_BUCKET` is **not** ported — `src/theme/colors.ts:57-62` already ships it (`Deseos` →
`Gustos`), and the proposal's label note settles that the screen renders `Gustos`.

### 1.7 Copy: every string is client-owned, and the resolution is split by axis (D-08)

Two error surfaces, both total, both closed at compile time:

```ts
// domain/mensajes-perfil.ts
export function mensajeDeApiError(e: ApiError, origen: 'perfil' | 'password'): string
export function mensajeDeResultado(r: ResultadoGuardado): Mensaje   // {tono:'ok'|'error', lineas}

// domain/mensajes-catalogo.ts
export function mensajeDeErrorCatalogo(e: ApiError): string
```

The resolution rule, identical in both:

| `ApiError` | resolved by | why |
|---|---|---|
| `network` · `unauthorized` · `parse` | `copiaPorApiError(e)` (mobile-owned, already shipped) | transport copy is a **cross-screen** concern this app already owns in one place. Two different Spanish sentences for "no internet" on the same app is a worse defect than a wording divergence from web |
| `http` + known `code` | the ported table (verbatim web strings) | this is the parity surface CA-02/CA-03 actually names |
| `http` + unknown/absent `code` | `'Ocurrió un error inesperado. Intenta nuevamente.'` | web's own `GENERICO` |

`COPY` stays a `Record<CodigoCatalogo, string>` (tsc-enforced totality over 12 codes) and
`mensajeDeResultado` keeps web's `const _exhaustive: never = r` guard. **No server `message` string
is ever rendered**, and wrong-password vs. email-already-taken remain byte-identical
(PERF040-04 anti-enumeration).

Deliberate divergence from web, recorded: web maps `unauthorized` to `''` because it intercepts the
tag and navigates to `/login` first. Mobile has **no in-screen 401 interception today** — the
shipped convention is to render `copiaPorApiError`'s message (`app/index.tsx:155` → `ErrorState` →
`copiaPorApiError`), and the session gate only re-checks on cold start
(`session-context.tsx:51-90`). See D-16; the proposal's §4.5 sentence about "routing an
`unauthorized` result through the session gate" describes a convention that does not exist.

### 1.8 Perfil: the two-call orchestration, lifted whole

```ts
// domain/guardar-perfil.ts  — pure: no fetch, no React, no imports from src/api
export type DraftPerfil = { nombre; email; passwordActual; passwordNueva };
export type ResultadoGuardado =
  | { tipo: 'sin-cambios' }
  | { tipo: 'falta-password-actual' }
  | { tipo: 'perfil-fallo'; error: ApiError }
  | { tipo: 'password-fallo'; perfilGuardado: boolean; error: ApiError }
  | { tipo: 'ok'; perfilGuardado: boolean; passwordCambiada: boolean };

export function construirPerfilPatch(draft: DraftPerfil, me: MeDto): PerfilPatch | undefined;

export async function guardarPerfil(
  draft: DraftPerfil,
  me: MeDto,
  io: {                                    // ← injected, so domain never imports src/api (DIP)
    patchPerfil: (p: PerfilPatch) => Promise<ApiResult<void>>;
    patchPassword: (p: PasswordPatch) => Promise<ApiResult<void>>;
  },
): Promise<ResultadoGuardado>;
```

The body is `use-guardar-perfil.ts:90-127` verbatim, and the two guarantees that make it worth
lifting are preserved *structurally*, not by convention:

1. **`passwordActual` travels only when `email` changes** (PERF040-01) — a nombre-only save issues
   exactly one request and never demands it.
2. **A profile failure aborts: the password call is never issued.** The order *is* the state
   machine — the first `return` is the abort. Inverting it would require moving a whole block, which
   is exactly what the order test detects.

"What counts as a change" is computed against the freshly-read `me`, so a retry after a partial
failure is idempotent without any reset code.

Injecting `io` (rather than importing `patchPerfil` directly, as web does) is what keeps `domain/`
free of `src/api` at runtime and lets the orchestration be unit-tested with two `jest.fn()`s and no
module mocking. The route passes the real pair.

### 1.9 Perfil tab — what mobile does NOT render

Google is **status only** (binding decision 1): a pill reading `Vinculada: {email}` /
`Vinculada` (when `email === null`) / `No vinculada`, ported from
`GoogleVinculoSection.tsx:112-116`, with **no** link/unlink control and no
`ConfirmarPasswordDialog`. Consequently the three Google-only error rows
(`VINCULO_REQUIERE_PASSWORD`, `GOOGLE_YA_VINCULADO`, `GOOGLE_NO_DISPONIBLE`) and the `'google'`
`origen` are **omitted** from the mobile table: those codes are produced only by
`/api/perfil/google/*`, which mobile never calls. Should one ever appear, it falls to `GENERICO`.
`origen` narrows to `'perfil' | 'password'`.

Per CQ-4 there is **no proactive demo layer**: no disabled controls, no `role="note"` banner. The
single defensive `403 DEMO_SOLO_LECTURA` row stays in the table, and
`MENSAJE_DEMO_SOLO_LECTURA` is kept as a named constant so the string has one home.

### 1.10 Categorías — the list is read + navigate only (D-12)

Web's `CategoriaFila` ships its delete icon as `hidden md:inline-flex`
(`CategoriaFila.tsx:152-165`), a US-063 decision (WCTM-03/D-08/D-09) whose stated guarantee is
*"exactly one action control below `md`"*. The web list's footer hint at phone width reads, verbatim,
«Toca una categoría para editarla o eliminarla.» — i.e. **web itself, at phone width, routes deletion
through the edit screen**.

Mobile therefore ships: row = `Pressable` (name + `etiquetaPatrones(n)`) → `router.push`; **no
row-level delete, no row-level `Alert`, no focus-restore/announce machinery**. Deletion and its
warning live exclusively on the edit screen, where web puts them at this width. CA-03 ("the SAME
CRUD and the SAME deletion-in-use warning") is satisfied — the operation and its copy are identical;
only the entry point count matches web-at-phone-width instead of web-at-desktop-width. The
proposal's §2 phrasing ("row tap → edit, delete with the impact warning") is reconciled, not
contradicted: both exist, one screen deeper.

Everything else is ported: groups in `Necesidades → Gustos → Ahorro` order with the heading from
`ETIQUETA_BUCKET`; `Nueva categoría` opens an **inline form at the top of the list** (not a route —
a not-yet-created categoría has no id and cannot own patterns); the empty state («Todavía no tienes
categorías» / «Crea tu primera categoría para empezar a clasificar tus movimientos.») reuses the
existing `states/Empty` shell.

Where web ships an `EtiquetaResponsiva` copy variant, **mobile takes the `movil` string** — that is
US-063's own phone-width decision, so parity means adopting its mobile branch, never its desktop
branch (D-13). Concretely: the list hint, `Patrones` (heading), `Agregar` (button text, with the
accessible name `Agregar patrón`), «Sin patrones: solo asignación manual.», and the omission of the
list subtitle (web hides it below `md`).

### 1.11 Editar categoría + the two confirmations

The route (`app/categoria/[id].tsx`) fetches `GET /api/categorias` itself and resolves the row by
`id` — there is no `GET /api/categorias/:id`, and mobile has no query cache to share (D-09). Four
states, ported from `EditarCategoria.tsx:30-46`: loading · error (+ back link) · **id absent** →
«Esa categoría ya no existe.» (a `status`, not an `alert` — a stale deep link is not a failure of
the action the user just took) · loaded.

Identity draft (`nombre`, `bucket`) is local `useState` in the loaded child component, seeded from
the resolved row. `Cancelar` discards the draft **and navigates back** (WCTG-04's shipped fix).
`Guardar`:

```
bucket clean  → patchCategoria({nombre, bucket}) directly
bucket dirty  → Alert.alert(fraseDeImpacto({tipo:'cambiar-bucket', …}))  → confirm → patch
```

Both confirmations go through **`Alert.alert`** (binding decision 4) with the same shape:

```ts
const { titulo, lineas, textoConfirmar } = fraseDeImpacto(impacto);   // pure, unit-tested
Alert.alert(titulo, lineas.join('\n'), [
  { text: 'Cancelar', style: 'cancel' },
  { text: textoConfirmar, style: 'destructive', onPress: () => void confirmar() },
]);
```

`transaccionesCount` comes from the **already-loaded DTO** — never a fresh fetch (decision 3). The
zero case **softens the sentence, it never skips the confirmation** (`fraseDeImpacto`'s own
invariant, preserved by porting it whole).

Two web mechanisms are deliberately **not** ported, because `Alert.alert` is a native modal and
removes their reason to exist: the `snapshotAlAbrirDialogo` freeze
(`EditarCategoria.tsx:294-299` — the OS alert blocks interaction, so nothing can move underneath
it) and the elaborate `disabled`/focus-restore matrix around a non-modal dialog. Values are read
at the moment `Alert.alert` is called, which is the freeze. This is a genuine simplification the
platform buys, and it is stated so a reviewer does not read it as an omission.

**R5's residual, addressed:** a failure *after* the confirm has no place inside the dismissed alert.
The screen renders it in its own alert region (`accessibilityRole="alert"` +
`accessibilityLiveRegion="polite"`, the `subir.tsx:230-238` idiom), pinned by an RNTL case.

### 1.12 Patrones — one explicit per-row confirm (CQ-5) replaces web's whole blur machinery

Web's `PatronFila` is ~570 lines carrying four judgment-day rounds of `blur`-race patches:
pointer-intent refs (`clicEliminarEnCursoRef`), a deferred `setTimeout(…, 0)` replay with an
unmount-cleanup, a split "not-yet-created rows never commit on blur" rule, and a focus-restoration
ref/effect pair. Every one of those exists to disambiguate `blur`.

CQ-5 removes the trigger. Mobile's row state machine:

```
limpio   (valor === comprometido)          → confirm control hidden
sucio    (dirty AND trimmed value ≠ '')    → confirm control enabled: "Guardar patrón"
enviando (mutation in flight)              → fields + both controls disabled
error                                      → inline role="alert" under the row; row stays sucio (retryable)
```

- **New row** (no `id`): confirm → `POST /api/patrones`; on success the parent drops the placeholder
  and the real row arrives through the screen's re-fetch. Delete on a new row = discard, **zero
  requests** — structurally, because nothing ever auto-creates.
- **Existing row**: confirm → `PATCH /api/patrones/:id`; the committed baseline advances **only on
  success**, so a failed patch stays retryable. Delete → `DELETE /api/patrones/:id`, **no
  confirmation** (a pattern touches no persisted transaction).
- Rows commit independently of the categoría's `Guardar`; `Cancelar` discards only the identity
  draft.

`matchType` is a 3-chip `SelectorChips` (`CONTIENE` / `EMPIEZA CON` / `REGEX` per
`ETIQUETA_MATCH_TYPE`), not a `<select>` — RN has none. The REGEX hint («Esa expresión regular
podría no ser válida.») is ported as a **hint, never a gate**: the device's `RegExp` engine is not
guaranteed to match the server's, so blocking would refuse patterns the API accepts (ADR-024).

### 1.13 Freshness: two different mechanisms for two different problems (D-10, D-11)

| what goes stale | trigger | mechanism |
|---|---|---|
| the catálogo list, after editing/deleting on the pushed edit screen | the user comes **back** | `useFocusEffect` on `app/configuracion.tsx`'s catalog load — fires on mount and on every re-focus, covering gesture-back, hardware-back and the on-screen control alike |
| the dashboard's 50/30/20, after a bucket change | a screen the user is **not on** | the existing `solicitarRecargaResumen()` pub/sub (`src/api/resumen-refresh.ts`), whose `Set` of listeners (US-050 D-13) already keeps `app/index.tsx` and `ResumenAnual` subscribed while backgrounded |

**The dashboard refresh fires on a successful bucket change only**, and the evidence is specific:
`PATCH /api/categorias/:id` re-stamps the referenced transactions' `bucketId` when the bucket
changes (`actualizar-categoria.use-case.ts:38-39`, D-07's "re-stamp" mechanism), while
`DELETE /api/categorias/:id` leaves `bucketId` **untouched** — «su `bucketId` nunca se toca, así que
borrar una categoría no mueve dinero entre buckets» (`eliminar-categoria.use-case.ts:14-18`, echoed
in `openapi.json`'s DELETE description). The resumen groups by `bucketId` (null → `SinCategoria`,
`prisma-movimientos-mes.repository.ts:73-78`), so a delete cannot move a single peso between
buckets, and patterns never reclassify retroactively (classification runs at ingesta time). Firing
on delete too would be harmless but would encode a false belief; the rule is one line to broaden if
the resumen contract ever derives anything from `categoriaId`.

### 1.14 Entry point and back navigation

`src/components/Header.tsx`'s inert `☰` **is replaced** by a lucide `Settings` gear
(`accessibilityRole="button"`, `accessibilityLabel="Configuración"`) doing
`router.push('/configuracion')`. The avatar stays an inert `image`. The `☰` stub's own docstring
says it exists so "wiring it later is a one-liner"; its destination (a drawer) does not exist and
is backlog #394. `'Abrir menú'` is **not** a Maestro anchor and `Header.tsx` has **no spec today** —
ripgrep-verified — so nothing breaks and a first `Header.spec.tsx` lands with the change.

**`_layout.tsx` hides the native header** (`screenOptions={{ headerShown: false }}`, line 41), so
there is no on-screen back control on a pushed route. `app/subir.tsx:420-424` already records this
exact finding and ships its own «Volver al resumen». Both new screens do the same:
«Volver al resumen» on Configuración, «Volver a Categorías» on the edit screen (web's own
phone-width `BotonVolver` label, `EditarCategoria.tsx:419-424`). Gesture/hardware back keeps
working; this is the *visible* affordance, and it is a correction to §4.1's "native Expo Router
back" — which is true of the gesture and false of the chrome.

Both routes register inside the existing `<Stack.Protected guard={estado === 'authenticated'}>`
block as `<Stack.Screen name="configuracion" />` and `<Stack.Screen name="categoria/[id]" />`. The
session gate is untouched.

---

## 2. Decisions (ADR-style)

| id | decision | rationale | rejected alternative |
|----|----------|-----------|----------------------|
| D-01 | Two flat routes — `app/configuracion.tsx` and `app/categoria/[id].tsx` — with the `Perfil│Categorías` split as **local `useState`**, not nested routes | Binding decision 2 puts the tabs inside the screen. A nested `_layout` for two tabs introduces a routing concept this app uses nowhere else, and a flat registration keeps `Stack.Protected` a flat list (`kiss`) | `app/configuracion/_layout.tsx` + `index`/`categorias` child routes (Expo Router tabs machinery for a two-way toggle); serialising the categoría through router params instead of a `[id]` route |
| D-02 | The gear **replaces** the inert `☰`; the avatar is untouched | The `☰` is the stub whose destination never existed; the avatar is decorative and turning it into a control would create a second, competing "profile" concept on the same bar. Smallest honest diff | Adding the gear beside `☰` (two controls, one of which still lies); moving the entry onto the avatar (changes a decorative element's role) |
| D-03 | Both new screens render their **own** on-screen back control | `headerShown: false` (`_layout.tsx:41`) means a pushed route has no chrome; `subir.tsx`'s docstring already recorded that gap and its fix. Correction to proposal §4.1 | Relying on gesture/hardware back alone (invisible on iOS beyond the edge swipe); enabling the native header for two routes only (a third navigation idiom on a two-screen app) |
| D-04 | `ApiError`/`ApiResult`/`copiaPorApiError` **move** to `src/domain/api-error.ts`; `client.ts` re-exports | The copy tables belong in `domain/` (proposal §4.6) and must name the type and reuse the transport copy. Re-exporting means **zero** import churn and zero test churn at ~10 lines of movement | Type-only `domain → api` imports (a back-edge that reads as a violation and invites a runtime one); duplicating the transport copy inside the tables (two sentences for "no internet") |
| D-05 | `code?: string` is an **additive optional field on the `http` member**, not a fifth `server` tag (CQ-3's first option) | A fifth tag forces a new branch into `copiaPorApiError`, `states/Error.tsx` and `subir.tsx` for a state they already handle; `PostIngestaError` stays structurally compatible; every shipped fetcher keeps `code` undefined, so behaviour is unchanged | Web's `server` tag with a `message` field (mobile never renders a server message, so the field would be dead weight in a wider union) |
| D-06 | Extract `enviarMutacion`/`errorConCodigo` **once**, in `src/api/mutacion.ts`, on occurrence two | Web wrote it twice and its own docstring records a judgment-day finding (both judges) that the copies are unlinked and undetectable by `tsc`/eslint. Mobile lands #2 and #3 in one change, with the cost already measured elsewhere | Two copies "per the three-strike rule" (the rule's purpose is to avoid guessing the abstraction — here the abstraction is already known and its divergence cost is documented) |
| D-07 | Runtime guards keep `bucket`/`matchType` as `string`; write payloads use the closed unions | Verbatim from `apps/web/src/api/categorias.ts:39-48/205-213`, itself a judgment-day fix. ADR-024/ADR-037: the server owns validity, so an unrecognised bucket must list, not vanish; but a mis-capitalised **outbound** value should fail at compile time, not as a 400 | Narrowing on read (a categoría disappears the day the backend adds a bucket); widening on write (rediscovering typos in production) |
| D-08 | Error copy resolves **by axis**: transport tags → mobile's `copiaPorApiError`, domain `code`s → web's ported table | Transport copy is cross-screen and already has one owner in this app; the domain codes are the actual parity surface CA-02/CA-03 names. Two "no internet" sentences in one app is a worse defect than a wording divergence from the other client | Porting web's transport strings too (a second connection message on the same screen as `ErrorState`'s); resolving everything through `copiaPorApiError` (loses the precise `code` copy CA-02 requires) |
| D-09 | The edit route performs its **own** `GET /api/categorias` and resolves by id | There is no `GET /api/categorias/:id` and no cache to share; the alternative is passing a serialised DTO through router params, which is stale by construction and string-typed | Router-param hand-off; introducing a catalog cache/query library (explicitly out of scope, §2) |
| D-10 | List freshness = `useFocusEffect` on the Configuración route | The refresh trigger literally *is* "the user returned to this screen", and focus covers every return path (control, gesture, hardware back) in **one** place. A pub/sub would need a fire call at each of six mutation sites — six places to forget | A second pub/sub module mirroring `resumen-refresh` (duplicates the mechanism for one consumer, and its completeness depends on remembering every call site); a `recargar` param on back-navigation |
| D-11 | `solicitarRecargaResumen()` fires **only** after a successful bucket change | Verified: the bucket patch re-stamps `bucketId` (`actualizar-categoria.use-case.ts:38-39`); delete explicitly does not (`eliminar-categoria.use-case.ts:14-18`); resumen groups by `bucketId` (`prisma-movimientos-mes.repository.ts:73-78`); patterns never reclassify retroactively | Firing after every mutation (harmless but encodes a false belief about what moves money); firing never (ships criterion 7 broken for the one case that matters) |
| D-12 | The categoría **list has no delete control**; deletion + its warning live on the edit screen | Web's own phone-width UI does exactly this (`CategoriaFila.tsx:158-162` `hidden md:inline-flex`, US-063 WCTM-03 "exactly one action control below `md`"), and its phone-width hint says «Toca una categoría para editarla o eliminarla.» Parity with web-at-this-width, not web-at-desktop-width | Porting the desktop row icon (diverges from web on the very viewport this app *is*, and drags in the focus-restore + live-region machinery web needed for a non-modal dialog inside a list) |
| D-13 | Wherever web ships an `EtiquetaResponsiva` variant, mobile takes the **`movil`** string | US-063 already decided what this copy says at phone width; taking the desktop string would be a *new* product decision disguised as parity | Always taking `escritorio` "because it is more complete" |
| D-14 | Per-row explicit confirm (CQ-5) — and with it, **none** of web's blur machinery is ported | The pointer-intent ref, the deferred `setTimeout` replay + unmount cleanup, the not-yet-created-row blur exception and the focus-restore ref/effect all exist solely to disambiguate `blur`. Removing the trigger removes the class, not the symptom | Porting commit-on-blur (there is no Tab on a phone and blur fires on any tap elsewhere — R8); auto-commit on `matchType` change alone (a write the user never confirmed) |
| D-15 | `Alert.alert` replaces `ConfirmarImpactoDialog`, and the `snapshotAlAbrirDialogo` freeze + `disabled` matrix are **not** ported | The OS alert is genuinely modal, so the state it renders cannot move underneath it — reading values at call time *is* the freeze. Porting the guards would carry machinery whose premise (a non-modal dialog) is false here | A custom RN modal reproducing web's dialog (binding decision 4 forbids it, and it would re-import every race it guards against) |
| D-16 | A 401 on any config call renders `copiaPorApiError`'s message; **no** in-screen sign-out is introduced | The proposal's §4.5 claim describes a convention this app does not have: `app/index.tsx` renders `ErrorState` on `unauthorized`, and the session gate only re-checks at cold start (`session-context.tsx:51-90`). Adding a 401→`signOut` path is a cross-cutting behaviour change belonging to its own change | Calling `signOut()` from the config screens (one screen behaving differently from every other on the same failure) |
| D-17 | `SelectorChips` (a `radiogroup` of 3 chips) serves both `Bucket` and `Tipo de coincidencia` | RN has no `<select>`; `subir.tsx:327-360` already ships this exact `radiogroup`/`radio` + `accessibilityState.checked` idiom for its 10/25/50 selector. Three call sites justify one component | A picker dependency (`@react-native-picker/picker` — a new native dep for two 3-option fields); an `ActionSheet` (platform-divergent, harder to assert) |
| D-18 | The gear (the entry point) lands in the **last** slice | Until the gear exists, the new routes are unreachable from the UI, so every intermediate slice on `main` is inert — which is precisely §7's stated partial-rollback lever, used proactively. It makes `stacked-to-main` safe for a 7-slice chain | Landing the gear first (a half-built Configuración screen is reachable on `main` for the length of the chain) |

---

## 3. Test strategy (TDD — tests first, per suite)

Runner: `pnpm --filter @moneydiary/mobile test` (jest-expo + RNTL, ADR-017). Maestro stays manual and
out of CI; a device pass over the two new screens is a manual verification step, not a gate.

**Behaviour-first, and specifically hardened against this sprint's four recurring judgment findings:**

1. **Guard accept/reject *per field*.** `esMeDto`, `esPatronDto`, `esCategoriaDto`, `esCatalogoDto`
   each get one rejection case **per field** (missing and wrong-typed), plus the acceptance case —
   never a single "wrong shape → parse" case standing in for all of them. `esMeDto` additionally
   pins `email: null` **accepted** (the regression this change exists to fix) and each of `nombre` /
   `esDemo` / `googleVinculado` missing → rejected.
2. **List ORDER pinning.** `agruparPorBucket` asserts the exact group sequence
   `['Necesidades','Deseos','Ahorro']` (+ `'Otros'` last) via array equality, never `toContain`;
   `CategoriasPanel` asserts rendered row order within a group; `PatronesSection` asserts existing
   rows precede new placeholders.
3. **Non-tautological absence assertions.** Every `queryBy… → null` case is paired with a positive
   case proving the same query *can* match: `Eliminar categoría` is asserted **absent** on the list
   and **present** on the edit screen with the identical query; `Desvincular` is asserted absent on
   the Perfil tab while `Vinculada`/`No vinculada` is asserted present.
4. **No vacuous prop-identity probes through `Pressable`.** Interactions are exercised with
   `fireEvent.press(screen.getByLabelText(...))` and asserted through the mocked module call
   (`expect(mockPatchCategoria).toHaveBeenCalledWith(...)`) — never
   `getBy…(...).props.onPress === handler` (US-050's D-15 gate).
5. **Per-fetcher suites do not duplicate the transport branch matrix.** `perfil.spec.ts` and
   `categorias.spec.ts` MUST NOT re-test `mutacion.ts`'s branch matrix (network throw / 401 /
   non-2xx **with** `code` / non-2xx **without** `code` / malformed 2xx / missing `API_BASE_URL`)
   — that matrix is asserted exactly once, in `mutacion.spec.ts`. Each per-fetcher suite tests only
   (a) the call shape passed to `enviarMutacion` (URL, method, body — including `prioridad`
   omission and no `content-type` on a bodyless DELETE) and (b) its own fetcher-specific guards.

Per-layer:

| layer | how | representative cases |
|---|---|---|
| pure domain | plain jest, no renderer | `guardarPerfil`: nombre-only ⇒ **one** call and `passwordActual` absent from the payload; email change ⇒ `passwordActual` present; empty `passwordActual` + email dirty ⇒ `falta-password-actual` with **zero** calls; profile failure ⇒ `patchPassword` **never called** (the abort-order guarantee); password failure after a profile success ⇒ `password-fallo` + `perfilGuardado: true`; `ok` + `passwordCambiada`. `fraseDeImpacto`: both `tipo`s × `count>0`/`count===0`, asserting the **exact** frozen lines. `etiquetaPatrones` 0/1/N. `mensajeDe*`: one case per code row + the unknown-code fallback + the three transport tags |
| HTTP — transport (`mutacion.spec.ts`) | `fetch` mocked at the global, mirroring `client.spec.ts` | the full branch matrix, asserted **once**: 401 → `unauthorized`; non-2xx **with** `code` → `{tag:'http',status,code}`; non-2xx with unparseable body → `code: undefined`; network throw → `network`; malformed 2xx → `parse`; missing `API_BASE_URL` → `network` **with no fetch performed** |
| HTTP — per fetcher (`perfil.spec.ts`, `categorias.spec.ts`) | `fetch` mocked at the global | call shape only (point 5): URL + method + headers (`x-api-key`, `Bearer`) + body per fetcher; no `content-type` on bodyless DELETE; `prioridad` **never** present in any pattern payload; plus each fetcher's own guard field-rejections — the shared branch matrix above is **not** repeated here |
| screens | RNTL | tab switch; the three fetch phases per tab; the perfil submit paths incl. partial success copy; the per-row pattern state machine (confirm hidden when clean, disabled while sending, error retryable); back controls navigate |
| confirmations | `jest.spyOn(Alert, 'alert')` | assert the **arguments**: title, the joined body lines verbatim, a `style:'destructive'` confirm and a `style:'cancel'` button — then invoke the confirm's `onPress` to drive the mutation. Also: dismissing without confirming issues **zero** requests; a post-confirm failure renders in the screen's own `role="alert"` region (R5) |
| refresh wiring | RNTL + the real `resumen-refresh` | a successful bucket change calls `solicitarRecargaResumen()`; a successful delete does **not** (D-11 pinned in both directions) |

**Two test seams, declared up front (not discovered at apply time):**

- `useFocusEffect` needs navigation context. The existing idiom already mocks `expo-router` wholesale
  (`app/index.spec.tsx:75-77`); the mock gains
  `useFocusEffect: (cb) => React.useEffect(cb, [cb])`, which faithfully reproduces the mount fire.
  RNTL cannot simulate a real re-focus without a navigator — **the re-focus refetch is
  Maestro/manual-verified**, and this limit is stated rather than papered over.
- `lucide-react-native` is ESM and is almost certainly outside `jest-expo`'s default
  `transformIgnorePatterns`. `jest.config.js` gains an explicit pattern in the **same slice as the
  gear** — otherwise every spec that renders `Header` (including `app/index.spec.tsx` and
  `test/auth-navigation.integration.spec.tsx`) breaks. The config's own docstring already
  anticipates this ("puede requerir extender `transformIgnorePatterns`").

---

## 4. Impact sweep (ripgrep-verified, not assumed)

| symbol / file | call sites found | impact |
|---|---|---|
| `ApiError` / `ApiResult` / `copiaPorApiError` | `client.ts`, `states/Error.tsx:2-3`, `app/index.tsx:6`, `app/subir.tsx:25`, `post-ingesta.ts` (local superset), 4 specs | **Zero churn** — `client.ts` re-exports all three, so every import path stays literal |
| `esMeDto` | `client.ts:148` only (private); `fetchMe` consumed by `session-context.tsx:69` | Widening is a relaxation for `email`; the three tightenings cannot lock a user out (the gate is optimistic on non-401) |
| `Header` | `app/index.tsx:120` (the only production call site); **no spec file exists** | Safe to modify; `'Abrir menú'` appears in **no** `.maestro` file |
| `☰` / `'Abrir menú'` | `Header.tsx:20,23` only | Removed with the stub |
| `registrarRecargaResumen` / `solicitarRecargaResumen` | `app/index.tsx:9,74`, `app/subir.tsx:24,139`, `ResumenAnual.tsx`, 2 specs | Consumer-only addition; the module is **not** modified |
| `_layout.tsx` `Stack.Protected` block | `app/_layout.tsx:42-45` | +2 `Stack.Screen` entries; the guard itself untouched |
| `packages/api-client/src/index.ts` | consumed by web + mobile | +3 alias lines (additive, type-only package — no runtime, no build step) |
| `apps/api/**`, `openapi.json`, `apps/web/**`, Prisma | — | **Untouched** (§9.9) |

No backend change, no schema/migration, no env var. **One** new dependency: `lucide-react-native`
(CQ-2), installed with `npx expo install lucide-react-native` so Expo resolves the SDK-57-compatible
line; `react-native-svg@15.15.4` is already a direct dep, and the version line is kept aligned with
web's `lucide-react@^0.469.0` per ADR-027's go-forward rule. Only the icons actually used are
imported (`Settings` for the gear; the pattern-row delete shipped as a text Pressable, not a `Trash2`
icon) — lucide is tree-shakeable and per-icon imported, so no barrel import is introduced.

---

## 5. Per-file change ledger and PR slicing

| # | file | change | est. lines | tests |
|---|------|--------|-----------:|-------|
| **PR 1 — ADR-038 + error foundation + the `me` guard fix** |||||
| 1.1 | `docs/adr/ADR-038-mobile-write-scope-configuracion.md` | NEW (drafted in this change, see §6) | ~140 | — |
| 1.2 | `docs/adr/README.md` | MOD — index row + ADR-026 status note | ~2 | — |
| 1.3 | `CLAUDE.md` | MOD — ADR table row | ~2 | — |
| 1.4 | `src/domain/api-error.ts` | NEW — moved decls + `code?` | ~65 | — |
| 1.5 | `src/api/client.ts` | MOD — re-exports + widened `esMeDto` | ~30 | — |
| 1.6 | `src/api/client.spec.ts` | MOD — per-field `esMeDto` cases | ~80 | +7 |
| | | **subtotal** | **~319** | **7** |
| **PR 2a — Mutation transport + perfil client** |||||
| 2.1 | `src/api/mutacion.ts` | NEW | ~90 | — |
| 2.2 | `src/api/mutacion.spec.ts` | NEW | ~130 | 9 |
| 2.3 | `src/api/perfil.ts` | NEW | ~55 | — |
| 2.4 | `src/api/perfil.spec.ts` | NEW | ~110 | 8 |
| | | **subtotal** | **~385** | **17** |
| **PR 2b — Catálogo client + DTO aliases** |||||
| 2.5 | `packages/api-client/src/index.ts` | MOD — 3 aliases | ~9 | — |
| 2.6 | `src/domain/catalogo.types.ts` | NEW | ~25 | — |
| 2.7 | `src/domain/catalogo-constantes.ts` | NEW | ~20 | — |
| 2.8 | `src/api/categorias.ts` | NEW — `fetchCatalogo` + 6 mutations + 3 guards | ~180 | — |
| 2.9 | `src/api/categorias.spec.ts` | NEW — call shape (7 endpoints) + fetcher-specific guards; the transport branch matrix is NOT duplicated here (§3 point 5, owned by `mutacion.spec.ts`) | ~132 | 10 |
| | | **subtotal** | **~366** | **10** |
| **PR 3a — Shared field components** |||||
| 3.1 | `src/components/configuracion/CampoTexto.tsx` | NEW | ~60 | — |
| 3.2 | `src/components/configuracion/CampoTexto.spec.tsx` | NEW | ~70 | 5 |
| 3.3 | `src/components/configuracion/SelectorChips.tsx` | NEW | ~60 | — |
| 3.4 | `src/components/configuracion/SelectorChips.spec.tsx` | NEW | ~70 | 6 |
| | | **subtotal** | **~260** | **11** |
| **PR 3b — Route shell + tabs + back control** |||||
| 3.5 | `app/_layout.tsx` | MOD — 2 `Stack.Screen` | ~4 | — |
| 3.6 | `src/components/configuracion/TabsConfiguracion.tsx` | NEW | ~55 | — |
| 3.7 | `src/components/configuracion/TabsConfiguracion.spec.tsx` | NEW | ~65 | 5 |
| 3.8 | `app/configuracion.tsx` | NEW — `me` + catálogo fetch, `useFocusEffect`, tab state | ~135 | — |
| 3.9 | `app/configuracion.spec.tsx` | NEW | ~185 | 12 |
| | | **subtotal** | **~444** ⚠ | **17** |
| **PR 4a — Perfil domain (orchestration + copy)** |||||
| 4.1 | `src/domain/guardar-perfil.ts` | NEW | ~110 | — |
| 4.2 | `src/domain/guardar-perfil.spec.ts` | NEW | ~190 | 12 |
| 4.3 | `src/domain/mensajes-perfil.ts` | NEW | ~95 | — |
| 4.4 | `src/domain/mensajes-perfil.spec.ts` | NEW | ~110 | 11 |
| | | **subtotal** | **~505** ⚠ | **23** |
| **PR 4b — Perfil tab UI** |||||
| 4.5 | `src/components/configuracion/PerfilPanel.tsx` | NEW — form + Google pill + 2 message regions | ~175 | — |
| 4.6 | `src/components/configuracion/PerfilPanel.spec.tsx` | NEW | ~230 | 15 |
| | | **subtotal** | **~405** ⚠ | **15** |
| **PR 5a — Catálogo domain helpers** |||||
| 5.1 | `src/domain/agrupar-categorias-por-bucket.ts` + spec | NEW | ~135 | 7 |
| 5.2 | `src/domain/plural.ts` + spec | NEW | ~75 | 6 |
| 5.3 | `src/domain/mensajes-catalogo.ts` + spec | NEW | ~180 | 9 |
| | | **subtotal** | **~390** | **22** |
| **PR 5b — Categorías list** |||||
| 5.4 | `src/components/configuracion/CategoriaFila.tsx` + spec | NEW | ~115 | 6 |
| 5.5 | `src/components/configuracion/CategoriasPanel.tsx` | NEW | ~130 | — |
| 5.6 | `src/components/configuracion/CategoriasPanel.spec.tsx` | NEW | ~180 | 12 |
| | | **subtotal** | **~425** ⚠ | **18** |
| **PR 5c — Nueva categoría (inline create)** |||||
| 5.7 | `src/components/configuracion/NuevaCategoriaForm.tsx` + spec | NEW | ~210 | 9 |
| | | **subtotal** | **~210** | **9** |
| **PR 6a — Edit route + identity form** |||||
| 6.1 | `app/categoria/[id].tsx` | NEW — fetch, resolve-by-id, 4 states | ~115 | — |
| 6.2 | `app/categoria/[id].spec.tsx` | NEW | ~200 | 13 |
| 6.3 | `src/components/configuracion/EditarCategoria.tsx` | NEW — identity form + footer (confirms stubbed to 6b) | ~120 | — |
| 6.4 | `src/components/configuracion/EditarCategoria.spec.tsx` | NEW | ~150 | 9 |
| | | **subtotal** | **~585** ⚠ | **22** |
| **PR 6b — Impact confirmations (bucket change + delete)** |||||
| 6.5 | `src/domain/impacto-catalogo.ts` + spec | NEW | ~195 | 10 |
| 6.6 | `src/components/configuracion/EditarCategoria.tsx` | MOD — both `Alert.alert` flows | ~70 | — |
| 6.7 | `src/components/configuracion/EditarCategoria.spec.tsx` | MOD | ~130 | 11 |
| | | **subtotal** | **~395** | **21** |
| **PR 7 — Patrones (section + per-row confirm)** |||||
| 7.1 | `src/components/configuracion/PatronesSection.tsx` + spec | NEW | ~195 | 8 |
| 7.2 | `src/components/configuracion/PatronFila.tsx` | NEW — the 4-state row machine | ~140 | — |
| 7.3 | `src/components/configuracion/PatronFila.spec.tsx` | NEW | ~200 | 14 |
| | | **subtotal** | **~535** ⚠ | **22** |
| **PR 8 — Entry point (gear) + icon dependency** |||||
| 8.1 | `apps/mobile/package.json` | MOD — `lucide-react-native` | ~1 | — |
| 8.2 | `apps/mobile/jest.config.js` | MOD — `transformIgnorePatterns` | ~10 | — |
| 8.3 | `src/components/Header.tsx` | MOD — gear replaces `☰` | ~25 | — |
| 8.4 | `src/components/Header.spec.tsx` | NEW (first spec for this file) | ~80 | 6 |
| | | **subtotal** | **~116** | **6** |

### Review Workload Forecast

- **Estimated changed lines: ~5 340 across 14 slices** (already presented pre-split; the natural
  un-split shape would be ~7 PRs of 400–1 000 lines each). PR 2b's `categorias.spec.ts` was
  re-estimated down (~210 → ~132 lines, 16 → 10 tests) once the transport branch matrix was moved
  to be owned exclusively by `mutacion.spec.ts` (§3 point 5); PR 2b now sits at ~366, under budget.
- **400-line budget risk: High.** Six slices sit at or above the budget even after splitting
  (3b ~444, 4a ~505, 4b ~405, 5b ~425, 6a ~585, 7 ~535). Every overrun is
  **test volume** (specs are 55–60 % of every slice), not production complexity — total production
  code is ~2 250 lines.
- **Chained PRs recommended: Yes** — mandatory at this size.
- **Recommended chain strategy: `feature-branch-chain`**, matching US-050's precedent for a
  multi-slice client feature: PRs 2–7 are only meaningful together, and a tracker branch keeps the
  intermediate states off `main`.
  **However**, D-18 (gear last) makes `stacked-to-main` genuinely safe here as a cheaper
  alternative: until PR 8, the new routes are unreachable from the UI, so every intermediate merge
  is inert dead code rather than a half-built visible feature. This is §7's partial-rollback lever
  used proactively. Either strategy is defensible; the choice belongs to the delivery gate.
- **Decision needed before apply: Yes** — chain strategy, plus a `size:exception` for 6a (~585) and
  7 (~535) if the reviewer prefers not to split them further. If a further split is wanted, the
  natural cuts are 6a → route+states / identity form, and 7 → section+placeholder rows / the row
  state machine.
- **Cross-slice ordering constraint:** PR 8's `jest.config.js` change and the `lucide-react-native`
  install **must ship together with the `Header` edit** — the icon import breaks `app/index.spec.tsx`
  and the auth-navigation integration spec without it.

---

## 6. ADR-038 (drafted in this change, per CQ-1)

`docs/adr/ADR-038-mobile-write-scope-configuracion.md` — written as part of this design phase and
merged with PR 1, reviewed in that PR.

**What it decides:** mobile's write scope grows from *"una única capacidad de escritura: subir una
cartola"* to **three bounded write surfaces — cartola upload, the caller's own profile, and the
caller's own classification catalog** — all on the same session credential, all on already-deployed
endpoints, with no new API and no new secret.

**What it supersedes:** ADR-026's **scope rule only** (its Decision rule 4, *"editar
transacciones/categorías no entra por esta puerta… Si algún día se quiere, es otro ADR con su propia
justificación"* — this ADR is that ADR). ADR-026's ingesta capability and every other rule it fixes
stand unchanged.

**How the supersession is recorded** — following the house precedent set by ADR-026 itself over
ADR-010: the older ADR's body is **not** edited (README convention: "Never edit an accepted ADR's
decision"), the new ADR carries a prominent `> [!info] Relación con ADR-026` callout, and
`docs/adr/README.md` annotates ADR-026's index row as *"✅ Decidido (regla de alcance superseded by
ADR-038)"*. `CLAUDE.md`'s ADR table gains the ADR-038 row.

**The bounded rule it fixes going forward**, so the boundary stays sayable: mobile may write **what
belongs to the caller and shapes how the caller's own data is read** (perfil, catálogo, ingesta).
Anything that edits **the transactions themselves** (reclasificar, editar montos, borrar ingestas)
remains out and would need its own ADR.

---

## 7. Risks carried into implementation

| risk | severity | mitigation in this design | residual |
|------|----------|---------------------------|----------|
| R1 ADR-026 conflict (proposal) | High → **closed by design** | §6: ADR-038 drafted, superseding the scope rule only, merged with PR 1 | The ADR is reviewed in its PR; if the reviewer rejects the scope widening, the whole change is void — which is the correct gate |
| R2 CA-02 parity needs `code` (proposal) | Med → **closed by design** | D-05: additive `code?` on the `http` member, populated by the new fetchers only | Every shipped fetcher keeps `code: undefined`, so their errors still fall to `GENERICO` — correct, and unchanged from today |
| R3 PR budget (proposal) | High | §5: 14 pre-cut slices, D-18 makes the intermediate states inert | Six slices still exceed 400 lines on test volume; a `size:exception` decision is needed before apply |
| R4 Copy drift web ↔ mobile (proposal) | Med | Every ported string is pinned by a unit test asserting the **exact** sentence, so a silent divergence becomes an intentional, reviewable edit. D-13 fixes *which* variant is authoritative | ADR-008 forbids a shared package; the duplication itself is the standing architectural choice and is accepted |
| R5 `Alert.alert` cannot show a post-confirm failure (proposal) | Low | §1.11: the failure renders in the screen's own `role="alert"` region, pinned by RNTL | The user sees the error one layer behind the dismissed alert — acceptable and consistent with `subir.tsx` |
| R6 Password change revokes other sessions (proposal) | Low | Web's exact copy is ported: «Cambios guardados. Se cerraron tus otras sesiones.» | — |
| R7 Demo unreachable from mobile (proposal) | Low | CQ-4: one defensive table row, no proactive layer, explicit trigger recorded ("when mobile gains demo login") | The `403 DEMO_SOLO_LECTURA` row is unreachable today — a deliberate, documented one-line cost |
| R8 Pattern commit idiom (proposal) | Med → **closed by design** | D-14: explicit per-row confirm; web's entire blur machinery is not ported | The confirm control is one extra tap per pattern edit vs. desktop — the accepted cost of an unambiguous gesture |
| **NEW** `lucide-react-native` breaks the jest transform | Med | §3 seam 2 + §5 ordering constraint: `transformIgnorePatterns` ships in the same slice as the icon import | If jest-expo 57 already allowlists it, the config edit is a no-op — verify at apply time, do not assume either way |
| **NEW** `useFocusEffect` re-focus is not RNTL-verifiable | Med | §3 seam 1: mount fire is tested through the `expo-router` mock; the re-focus path is Maestro/manual | A regression in re-focus refetch would surface late. Fallback if it proves fragile: fire `solicitarRecargaCatalogo()` explicitly at each mutation site (D-10's rejected alternative, reinstated as a plan B) |
| **NEW** Two full `GET /api/categorias` reads per edit visit (list + edit route) | Low | D-09: accepted; the payload is the user's own catalog (tens of rows), and the alternative is a stale router-param hand-off | On a Render cold start (ADR-023) the edit screen shows its own loading state for the round trip |
| **NEW** `esMeDto` tightening rejects a body a deployed backend still sends | Low | §1.2: mirrored field-by-field against `AuthMeResponse`; the session gate is optimistic on non-401 so it cannot lock anyone out | A drifted backend would show the Perfil tab's error state instead of a wrong profile — the better failure |
