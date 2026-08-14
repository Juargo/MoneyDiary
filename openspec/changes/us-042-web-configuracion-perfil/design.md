# Design: US-042 — Web Configuración page, Perfil section

- **Change**: `us-042-web-configuracion-perfil`
- **Status**: Designed (2026-08-13)
- **Inputs**: `proposal.md` (binding decisions 1–6, §0–§9, open questions 1–5). The spec
  (`web-app`, `WCFG-*`) is written in parallel — §10 hands it the design-element → requirement
  mapping.
- **Consumes (deployed, canonical, zero API work)**: `openspec/specs/perfil-usuario/spec.md`
  (`PERF040-01..09`), `openspec/specs/vinculacion-google/spec.md` (`VINC041-01..11`).
- **Precedent**: `openspec/changes/archive/2026-08-13-us-041-vincular-google/design.md`
  (Q-then-D structure, exhaustive-translator `never` guard, compile-error-as-cleanup-mechanism,
  CORRECTION-marked departures).
- **New ADR**: **No.** This is ADR-003/008 (stack), ADR-016 (Vitest), ADR-018 (a11y by layers),
  ADR-024 (thin client) and ADR-005/008 (the web never imports `apps/api`) applied. Nothing deviates.

Where this design departs from the proposal the departure is marked **CORRECTION** and carries its
reason. There are **six** (§1/Q1c, §1/Q2d, §1/Q3c, §1/Q4b, §1/Q5, §1/Q9b).

---

## 0. Framing

Most of this page is ordinary repo idiom: a hand-rolled form like `LoginForm`, a hand-rolled
`role="alertdialog"` like `EliminarIngestaControl`, never-throw `ApiResult<T>` clients like
`client.ts`, `vi.stubGlobal('fetch')` tests. Three things are **not** ordinary, and they are what
this document exists to pin down:

1. **One button, two HTTP calls, a forced order and an abort rule — expressed without a state
   machine.** The mechanism is that *sequence is the state*: two `if`s and two early returns in one
   async function, with a discriminated result type that makes the one reachable partial outcome a
   first-class value instead of an exception carrying good news (§1/Q2, §2/D-03).
2. **A runtime guard whose failure mode is an app-wide lockout.** `requireSession` maps *any*
   non-ok `fetchMe` result — including `parse` — to a `/login` redirect. Hardening `esMeDto` is
   therefore correct **and** creates a deploy-ordering constraint that nothing in the toolchain
   enforces (§1/Q4, §2/D-05).
3. **A UI that must be a total function over a closed set of server error codes it does not
   own**, while being forbidden by PERF040-04 from ever naming a cause. The proposal's error table
   is incomplete against the API's actual translator; §1/Q8 closes it (§2/D-04).

Everything else in this design is subordinate to those three.

---

## 1. Open questions resolved

### Q1 — Component decomposition and where state lives

#### Q1a — The tree

The repo's convention is container/presentational with a **thin route file**: `routes/login.tsx`
extracts the search param and hands it to `LoginForm`; `routes/index.tsx` hands off to `ResumenPage`.
This page follows it exactly.

```
routes/_authenticated/configuracion.tsx        route: validateSearch + the ?google= read/clean, thin
└── components/configuracion/
    ├── ConfiguracionPage.tsx                  layout: fluid 2-column grid, tab list, panel;
    │                                          owns the Google-outcome message region
    │   ├── ConfiguracionTabs.tsx              Perfil (aria-current) + Categorías (inert)
    │   ├── PerfilForm.tsx                     4 fields + Guardar cambios + its own message regions
    │   │   └── CampoTexto.tsx                 <label> wrapping <input>; 4 usages
    │   └── GoogleVinculoSection.tsx           pill + button (PR #2)
    │       └── ConfirmarPasswordDialog.tsx    hand-rolled alertdialog, password-gated (PR #2)
    └── mensajes.ts                            the closed copy table + the total translators
```

`CampoTexto` is extracted at **four** usages, not speculatively — `dry`'s three-strike rule is
satisfied on first write. It is a pure presentational component (`label`, `value`, `onChange`,
`type`, `required`, `disabled`, `autoComplete`): it owns no state and knows nothing about profiles.

`ConfirmarPasswordDialog` takes `{ titulo, descripcion, textoConfirmar, pendiente, error,
onConfirmar(passwordActual), onCancelar }` and **does not know whether it is linking or unlinking**.
That is ISP/OCP applied at the component level: a third password-gated action costs zero changes to
it, and its test suite exercises one component instead of two near-identical ones.

**Rejected: a `useConfiguracionPage()` god-hook** that owns the form draft, the mutations, the
dialog state and the Google message. It would recombine exactly what this split separates, and its
own test would need to stub every endpoint on the page to exercise any one of them (`solid`: "if the
mock of a test must stub 10 things to exercise 2, the seam is wrong").

**Rejected: shadcn `Input`/`Label`/`Dialog` primitives.** Binding decision 5. Only `badge`, `button`,
`card` and `popover` are vendored today; adding three primitives to render one form is a new review
surface for zero capability (`yagni`).

#### Q1b — Where state lives, stated once as a rule

| State | Owner | Why there and nowhere else |
|---|---|---|
| Server identity (`nombre`, `email`, `googleVinculado`) | TanStack Query, `['auth-me']` | One cache, one truth. Change detection compares against it (Q2a), so a partial failure self-heals with no reset code |
| Form draft (`nombre`, `email`, `passwordActual`, `passwordNueva`) | `PerfilForm` local `useState` | A draft is not server state and never leaves this component. `LoginForm`'s idiom |
| Save outcome message | `PerfilForm` local state | It describes *this form's* submit |
| Google outcome message + the `?google=` aviso | `ConfiguracionPage` local state | It must survive a dialog unmount **and** the URL rewrite (Q6b) |
| Dialog open/pending/error | `ConfirmarPasswordDialog`'s caller + the mutation | `EliminarIngestaControl`'s idiom |
| `esDemo` | Existing route context | Already there. Zero extra calls (proposal §6) |

**The rule, in one line: drafts and outcomes are local state, identity is the query cache, `esDemo`
is route context, and the URL holds nothing that must survive.** No Zustand store, no reducer, no
new context provider. Zustand exists in this app for client state, but page-scoped form state that
outlives nothing is not client state — it is component state.

#### Q1c — **CORRECTION: two message regions, not one page-level region**

The proposal calls CA-03's feedback "local page state". Splitting it is deliberate:

- A single page-level region would have **two writers with no ordering rule** — a save outcome and a
  Google outcome could overwrite each other with nothing deciding which wins.
- The two are produced by controls that are far apart on screen. A live region adjacent to the
  control that produced it is announced in the right context; a shared one at the top is not.
- The link flow **navigates away entirely**, so its "message" is delivered by the `?google=` return
  on the next page load — a different lifecycle from a form submit.

Two regions is also not an a11y problem: assistive tech announces whichever region changed. The one
coordination rule needed: **opening a Google dialog clears `avisoGoogle`** (Q6b), so a stale
"Vinculaste tu cuenta" never sits next to a fresh failure.

---

### Q2 — The save orchestration, precisely

#### Q2a — Change detection: what counts as "changed"

Derived **at submit time from the query cache**, never stored:

```ts
const nombreCambio = draft.nombre.trim() !== me.nombre;
const emailCambio  = draft.email.trim()  !== (me.email ?? '');
const cambiaPassword = draft.passwordNueva !== '';
```

Four decisions inside three lines:

- **Compared against the cache, not a mount-time snapshot.** This is the load-bearing choice. After a
  partial failure the cache has been invalidated and refetched, so `nombre`/`email` become clean
  *automatically* and the retry submits only the password call. Row 8 of Q2c is a consequence of this
  line, not of retry bookkeeping. A snapshot would require an explicit "reset baseline after partial
  success" step — one more thing to forget.
- **`.trim()` on both sides and on what is sent**, mirroring PERF040-01's trim-then-validate. A
  whitespace-only edit is not a change and issues no request.
- **`me.email ?? ''`** because a demo account has `email: null` while the input renders `''`. Demo
  cannot save anyway, but the predicate must be total or it reports a phantom change.
- **`passwordActual` is never a change.** It is an authorisation input, not a field. Typing it alone
  makes the submit a no-op (row 1).
- **`cambiaPassword` is `passwordNueva !== ''`, not "dirty"** — there is no server value to diff
  against, so "typed anything" *is* the intent.

The profile patch is built by one small function so the "only send what changed" rule has a single
home:

```ts
/** `undefined` ⇒ no profile call at all. `passwordActual` rides along ONLY when
 *  `email` changes (PERF040-01: a nombre-only edit MUST NOT require it — sending
 *  an empty string would fail server-side validation for no reason). */
function construirPerfilPatch(draft, me): PerfilPatch | undefined
```

#### Q2b — The orchestration itself

```ts
// api/use-guardar-perfil.ts — the mutationFn, in full shape
async function guardar(draft: DraftPerfil, me: MeDto): Promise<ResultadoGuardado> {
  const perfilPatch = construirPerfilPatch(draft, me);
  const cambiaPassword = draft.passwordNueva !== '';

  if (perfilPatch === undefined && !cambiaPassword) return { tipo: 'sin-cambios' };
  if ((perfilPatch?.email !== undefined || cambiaPassword) && draft.passwordActual === '') {
    return { tipo: 'falta-password-actual' };
  }

  let perfilGuardado = false;
  if (perfilPatch !== undefined) {
    const r = await patchPerfil(perfilPatch);
    if (!r.ok) return { tipo: 'perfil-fallo', error: r.error };   // ← ABORT
    perfilGuardado = true;
  }

  if (cambiaPassword) {
    const r = await patchPassword({
      passwordActual: draft.passwordActual,
      passwordNueva: draft.passwordNueva,
    });
    if (!r.ok) return { tipo: 'password-fallo', perfilGuardado, error: r.error };
  }

  return { tipo: 'ok', perfilGuardado, passwordCambiada: cambiaPassword };
}
```

**"One click = one or two calls" without a state machine.** There is no machine because *sequence is
the state*: the forced order is the physical order of the two blocks, and the abort rule is the first
`return`. Reversing the order requires moving a block — which is why Q9's test asserts a **call-order
array**, not a status flag. Nesting is two levels; the whole function reads top-to-bottom (`kiss`
rules 1 and 3).

The local pre-check (`falta-password-actual`) is a **form-completeness** check about the user's own
input, not a guess about the server's answer — it does not violate the anti-enumeration constraint,
which is about never *naming a cause of a server rejection*. The native `required` attribute on
`Password actual` (conditional on the email input being dirty, binding decision 2 made visible) is
the affordance; this guard is the correctness, because `fireEvent.submit` in jsdom bypasses
constraint validation and because a `required` attribute is a UX affordance, not a rule.

#### Q2c — **The exhaustive outcome table** (every combination, each failing)

`✓` = 2xx, `✗` = any modelled failure.

| # | nombre/email changed | passwordNueva typed | Calls issued, in order | Server state after | Form fields after | Message (verbatim) | Region |
|---|---|---|---|---|---|---|---|
| 1 | no | no | **none** | unchanged | untouched | `No hay cambios para guardar.` | polite |
| 2 | no | no, but `passwordActual` typed | **none** | unchanged | untouched | `No hay cambios para guardar.` | polite |
| 3 | email changed, `passwordActual` empty | any | **none** | unchanged | all kept | `Ingresa tu password actual.` | alert |
| 4 | no | yes, `passwordActual` empty | **none** | unchanged | all kept | `Ingresa tu password actual.` | alert |
| 5 | yes | no | `PATCH /api/perfil` ✓ | profile saved | name/email re-derive clean from the refetch | `Cambios guardados.` | polite |
| 6 | yes | no | `PATCH /api/perfil` ✗ | unchanged | **all kept**, incl. `passwordActual` | the profile error row of Q8 | alert |
| 7 | no | yes | `PATCH /api/perfil/password` ✓ | password rotated, other sessions revoked | both password fields **cleared** | `Cambios guardados. Se cerraron tus otras sesiones.` | polite |
| 8 | no | yes | `PATCH /api/perfil/password` ✗ | unchanged | password fields kept | the password error row of Q8 | alert |
| 9 | yes | yes | `perfil` ✓ → `password` ✓ | both applied | name/email clean, password fields cleared | `Cambios guardados. Se cerraron tus otras sesiones.` | polite |
| 10 | yes | yes | `perfil` ✗ — **`password` never called** | unchanged | all kept | the profile error row of Q8, **one message only** | alert |
| 11 | yes | yes | `perfil` ✓ → `password` ✗ | **profile only** | name/email re-derive clean; **password fields kept** | two lines: `Se guardaron tus datos, pero no se pudo cambiar la password.` then the password error row of Q8 | alert |

- **Row 10 is the abort rule.** The proposal's argument holds and is worth restating in its sharpest
  form: if the profile call failed because the email was taken *with a correct password*, the
  password call would **succeed** — silently rotating the user's password and revoking their other
  sessions while the page reports a failure. That is not a degraded outcome, it is a different
  operation than the one the user got told about.
- **Row 11 is the only reachable partial.** The mirror — password saved, profile not — has no row and
  **cannot be given one**: the password call is physically after the profile call's `return`.
- **Rows 5/9/11: `nombre`/`email` "re-derive clean" is not a reset.** It falls out of Q2a comparing
  against the invalidated-then-refetched cache. No code clears those inputs.
- **Row 11's next submit sends only the password call**, by the same mechanism. It is idempotent by
  construction, with no retry state.

**In flight**: `Guardar cambios` is `disabled={mutation.isPending}` (`LoginForm`'s
`estado === 'submitting'` idiom, but TanStack owns the flag). This also prevents a double-submit
racing the password rotation against itself — which would produce a second call whose
`passwordActual` is already stale.

#### Q2d — **CORRECTION: the mutation resolves its failures; it does not throw them**

The proposal says the mutation follows "the `useEliminarIngesta` idiom" (`mutationFn` throws
`result.error`). That idiom is right when there is exactly one failure shape. Here there is not:
`{ perfilGuardado: true, password failed }` is a **partial success**, and forcing it through
`onError` means throwing an error object that carries good news — a reviewer would have to read the
error to learn that a write succeeded.

**Decision: `mutationFn` resolves `ResultadoGuardado` for every modelled outcome and rejects only
for genuinely unmodelled throws (i.e. a bug).**

```ts
export type ResultadoGuardado =
  | { tipo: 'sin-cambios' }
  | { tipo: 'falta-password-actual' }
  | { tipo: 'perfil-fallo';   error: ApiError }
  | { tipo: 'password-fallo'; perfilGuardado: boolean; error: ApiError }
  | { tipo: 'ok'; perfilGuardado: boolean; passwordCambiada: boolean };
```

`mutation.error` therefore keeps a single honest meaning: *something we did not model happened*.
`mutation.isPending` still drives the disabled button, which is the only reason to use `useMutation`
here at all.

**Cache policy lives in `onSuccess`, not in the sequence** — SRP: the sequence orchestrates two HTTP
calls, the hook owns cache invalidation.

```ts
onSuccess: (r) => {
  const identidadCambio =
    (r.tipo === 'ok' && r.perfilGuardado) ||
    (r.tipo === 'password-fallo' && r.perfilGuardado);
  if (identidadCambio) queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
```

Note `password-fallo` **does** invalidate when `perfilGuardado` — the identity really did change, so
the cache must not keep the old name. That is row 11's "cache" line, and it is why rows 5/9/11 share
one mechanism.

A password-only success (`perfilGuardado: false`) invalidates **nothing**: no field of `MeDto`
changed. Invalidating anyway would spend a round trip to fetch a byte-identical payload.

---

### Q3 — `useMe()`, the query key, priming, and invalidation

#### Q3a — The hook

```ts
// apps/web/src/api/use-me.ts
export const ME_QUERY_KEY = ['auth-me'] as const;

export function meQueryOptions() {
  return queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<MeDto> => {
      const result = await fetchMe();
      if (!result.ok) throw result.error;   // `query.error` is a typed ApiError
      return result.value;
    },
  });
}

export function useMe() { return useQuery(meQueryOptions()); }
```

`['auth-me']`, not `['me']`: it is namespaced by the endpoint it mirrors, matching `['resumen']`,
`['ingestas']`, `['detalle-bucket']`. Nothing else in the app holds identity, so there is exactly one
key to invalidate — that is the whole of CA-03's "invalidation".

Lives in `src/api/` beside `use-eliminar-ingesta.ts` / `use-resumen.ts`, the app's existing home for
query hooks.

#### Q3b — Priming, so there is exactly one `/api/auth/me` per visit

`_authenticated.tsx`'s `beforeLoad` already owns the single `fetchMe()` round trip and throws away
everything but `esDemo`. Adding a naive `useQuery` would make that two fetches per visit.

```ts
beforeLoad: async ({ location, context }) => {
  const me = await requireSession(fetchMe, location.href);
  context.queryClient.setQueryData(ME_QUERY_KEY, me);
  return { esDemo: me.esDemo };
},
```

`setQueryData` stamps `dataUpdatedAt = now`; the production client's `staleTime` is **30 s**
(`main.tsx:63`), so `useMe()` mounting inside the same navigation reads a fresh entry and issues no
request. The guard keeps its one round trip and the page gets full identity for free.

This requires `__root.tsx` to become
`createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: RootComponent })`.
`main.tsx:71` already passes `context: { queryClient }` — it is simply untyped today.

**`beforeLoad`'s return stays `{ esDemo: me.esDemo }`.** Unchanged on purpose: `_authenticated/subir.tsx`
reads it, and widening the context to carry the whole `me` would create two sources of truth for
identity that drift the instant a mutation invalidates one of them.

*Rejected:* passing `me` from route context as `initialData` to `useMe()`. Avoids the `__root.tsx`
change and reintroduces exactly that dual truth.

#### Q3c — **CORRECTION: the "exactly once" assertion needs the production `staleTime`, and the three route-tree tests break twice, not once**

Two consequences the proposal does not name:

1. **Existing route-tree tests build their own `QueryClient` with no `staleTime`**
   (`demo-banner-layout.test.tsx:38-40` uses only `retry: false`). TanStack's default `staleTime` is
   **0**, so under a test client the primed entry is stale on arrival and `useMe()` refetches — the
   call-count assertion would fail for a reason that has nothing to do with the app.
   **Decision: extract the production defaults into `src/api/query-client-defaults.ts`, imported by
   both `main.tsx` and the tests.** Six lines. Justified by `dry`'s own test — "if this value changes
   tomorrow, how many files must change?" — where the answer today is two, with no link between them
   and a silent test-invalidation as the failure mode. `main.tsx` cannot be imported by a test: it
   calls `createRoot` at module scope.
2. **The three route-tree tests break a second, distinct way.** They call
   `createRouter({ routeTree })` with **no `context`** (`demo-banner-layout.test.tsx:41-44`). Once
   `beforeLoad` reads `context.queryClient`, that is a `TypeError` on `undefined.setQueryData` — an
   unrelated red across all three. `createRootRouteWithContext` makes the missing `context` a **type**
   error at `createRouter`, so `pnpm web typecheck` catches it rather than a confusing runtime
   failure. Each of the three files therefore takes **two** edits: the payload (Q4) and
   `context: { queryClient }`.

#### Q3d — Invalidation, and the round trip it costs

After a save that changed identity, `invalidateQueries({ queryKey: ME_QUERY_KEY })` marks the entry
stale and refetches the active observer — i.e. **one extra `GET /api/auth/me` after a successful
profile save**. That is correct, and it is not a violation of the "exactly once" criterion, which is
about *landing on the page*. Stated here so a reviewer does not read the refetch as a regression.

---

### Q4 — `esMeDto` hardening, its three stubs, and the rollback-ordering constraint

#### Q4a — The exact guard change

`apps/web/src/api/auth.ts:82-88`, two lines added to the existing predicate:

```ts
  if (
    typeof candidato.userId !== 'string' ||
    typeof candidato.nombre !== 'string' ||            // ← new
    typeof candidato.esDemo !== 'boolean' ||
    typeof candidato.googleVinculado !== 'boolean' ||  // ← new
    (candidato.email !== null && typeof candidato.email !== 'string')
  ) {
    return false;
  }
  return candidato.esDemo ? true : typeof candidato.email === 'string';
```

The cross-field `esDemo ⇔ email` invariant and its docblock are untouched.

**`nombre` is deliberately NOT length-validated here.** The guard's job is *shape*; PERF040-01's
1..80 rule is a domain rule and lives server-side (ADR-024). An empty-string `nombre` from the API is
a server bug, and rejecting it would fail-closed the entire authenticated app over a cosmetic
problem. Stated so nobody "improves" the guard later.

**Both fields are rejected, not defaulted** — the proposal's argument stands (a `googleVinculado ??
false` renders a false statement about the user's account security and offers a button guaranteed to
`409`; a `nombre ?? ''` lets `Guardar cambios` write a blank name over a good one). One more
argument: the guard is the *only* runtime check on this payload. If it does not check, `MeDto` is a
lie that every future consumer inherits — and every other guard in `client.ts` rejects rather than
defaults. Consistency across the boundary outweighs this one route.

#### Q4b — **The three breaking stubs (and the CORRECTION from Q3c)**

| File | Payload edit | Router-context edit |
|---|---|---|
| `src/test/redirect-after-login.test.tsx:38-42` | add `nombre`, `googleVinculado` | add `context: { queryClient }` |
| `src/test/demo-banner-layout.test.tsx:19-23` | `buildFetchStub`'s **param type** and the payload | idem, plus build the client from `QUERY_CLIENT_DEFAULTS` |
| `src/test/app-shell-layout.test.tsx:20` | add both fields | idem |

`src/api/auth.test.ts` and `src/lib/require-session.test.ts` fixtures **already carry** both fields
(US-041 repaired them) — they are the standing proof that the hardened guard is satisfiable.

#### Q4c — The rollback-ordering constraint, stated plainly

`lib/require-session.ts:35-45` is:

```ts
const result = await fetchMe();
if (result.ok) return result.value;
throw redirect(/* → /login */);
```

It **does not discriminate `error.tag`**. A `{ tag: 'parse' }` from the hardened `esMeDto` is
therefore indistinguishable from `{ tag: 'unauthorized' }` and produces the same `/login` redirect.

**Consequence, in plain words: if `GET /api/auth/me` ever stops returning `nombre` or
`googleVinculado`, every `_authenticated` route bounces to `/login`; the user logs in successfully
and is bounced straight back, with no error message. The whole authenticated app is locked, for
everyone, with no client-side recovery.**

What that implies for deploy order:

1. **Forward deploys are order-free.** The API already sends both fields (US-040/US-041, deployed).
   The web change only tightens a check against a contract that already holds.
2. **An API rollback is NOT order-free.** Rolling `apps/api` back past US-040/US-041 while this web
   build is live produces the lockout above. **Rule: revert the web `esMeDto` hardening first, or in
   the same window — never API-first.**
3. **Nothing enforces this.** `apps/api` (Render) and `apps/web` (Vercel) deploy independently by git
   integration from `main` (ADR-030); there is no coupling that could refuse the wrong order. The
   enforcement is documentation in front of the person pressing revert. **The tasks phase MUST put
   this sentence in the PR description of the PR that carries the hardening**, not only in
   `proposal.md`'s rollback plan — a rollback plan in an SDD artifact is not where an on-call person
   looks.
4. It is an *ordering* constraint, not a coupling constraint. No other part of this change has one.

**Considered and rejected for this change: teach `requireSession` to discriminate `parse` and render
an error page instead of redirecting.** It would turn the lockout into a legible message. Rejected
because it changes the behaviour of the most security-relevant function in the web app to improve a
scenario that requires an API rollback to occur, and it needs its own test matrix (what does a
`parse` at `beforeLoad` render? does it retry? does it still protect the route?). **Recorded as a
follow-up with an explicit trigger**: the first `parse` result observed in production telemetry
(ADR-019, when it lands).

---

### Q5 — **CORRECTION: `PATCH` through the Vercel proxy is already proven in production**

The proposal rates this Medium/High and flags that "`POST`/`DELETE` are proven; `PATCH` has no
precedent in this app". **Verified false.**

`apps/web/src/api/client.ts:411-424` — `postReclasificarCategoria` — issues:

```ts
res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, … });
```

against `/api/transacciones/:id/categoria`. It reaches the browser through
`BucketDetailList.tsx:151` → `ReclasificarCategoriaControl`, on the shipped `/buckets/$bucket` route
(US-013 S6b, in `main`). It is the same same-origin `/api/*` path, through the same rewrite, through
the same function.

Structural confirmation, so the claim is mechanism and not just "it exists in the code":

| Layer | Evidence it is method-agnostic |
|---|---|
| `vercel.json:5` | `{ "source": "/api/(.*)", "destination": "/api/proxy?upstream=$1" }` — no method predicate; Vercel rewrites do not discriminate by method |
| `apps/web/api/proxy.ts:68` | forwards `req.method ?? 'GET'` verbatim; there is **no method allowlist anywhere in the file** |
| `proxy.ts:81-125` | `forwardToBackend` uses `node:http`'s `request`, which sends whatever method it is given |
| `proxy.ts:179-189` | `readRequestBody` skips the body only for `GET`/`HEAD`, so a `PATCH` body is read and written (`:122`) |

**Risk downgraded from Medium/High to Low/High.** Low, because the mechanism is proven and shared;
the impact stays High, because a failure here invalidates the whole page.

#### Q5a — The pre-flight, kept but cheapened, and moved to task zero

The pre-flight survives — not as a spike, as a two-minute confirmation. It runs **before any new file
is written**, purely because it is cheap and its failure would invalidate everything after it.

On a Vercel preview deployment of the branch, with a real session, from the browser console:

```js
await fetch('/api/perfil', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nombre: 'Preflight' }),
}).then(r => r.status);
```

- **Pass**: `200`, with the updated `nombre` echoed in the body.
- **Fail**: `405`/`501`/`502`, or a `200` whose `content-type` is `text/html` (that is the SPA shell
  — the request never reached the API).
- `nombre`-only is deliberate: PERF040-01 makes it the one profile mutation that needs no
  `passwordActual` and touches no email column, so it is trivially reversible.
- **The observed status code goes in the task list.** A pre-flight whose result is not recorded is a
  checkbox, not evidence.

#### Q5b — Fallback, in escalation order

1. **Diagnose before fixing.** A `200` returning `index.html` is a *routing* failure (the rewrite lost
   the request), not a method failure — fixed in `vercel.json`, not in the client.
2. **If our own function is the blocker**: add an explicit method passthrough in
   `apps/web/api/proxy.ts`. There is currently nothing to add, which is itself evidence this branch
   will not be taken.
3. **`POST` + `X-HTTP-Method-Override` is REJECTED**, not deferred. It requires an `apps/api` change
   (middleware honouring the header), and this change's hardest boundary is *zero API files*. It
   would also permanently weaken the API's method surface for every client, to work around a problem
   in one deployment layer.
4. **If the refusal is in Vercel's platform layer and cannot be configured away, the change is
   BLOCKED** — escalate to the user. Do not invent a workaround that mutates the API contract. This
   is the one genuinely blocking discovery this change is capable of making, which is exactly why the
   check is task zero.

---

### Q6 — The `?google=` return contract

#### Q6a — Literal-union validation, and what an unexpected value does

```ts
export const Route = createFileRoute('/_authenticated/configuracion')({
  validateSearch: (search: Record<string, unknown>): { google?: 'vinculado' | 'error' } => {
    const valor = search.google;
    return valor === 'vinculado' || valor === 'error' ? { google: valor } : {};
  },
  component: ConfiguracionRoute,
});
```

Narrowing by construction: anything else — a typo, a hostile string, an array, an object — yields
`{}`, i.e. `google: undefined`.

**An unexpected value renders no message and no error.** It is not an error state: a stray query
parameter is not something the user did wrong, and an error message for it would be the UI inventing
a failure the system did not have. It is also the `sanitizeRedirect` discipline the `/login` route
already applies: **the URL selects a client constant; it never supplies content.** The parameter
value is never rendered, never interpolated into copy, never logged.

#### Q6b — Single surfacing, URL cleanup, and why the message survives it

```tsx
function ConfiguracionRoute() {
  const { google } = Route.useSearch();
  const router = useRouter();
  const [avisoGoogle, setAvisoGoogle] = useState(google);   // captured on FIRST render

  useEffect(() => {
    if (google === undefined) return;
    markSkipNextAuthRefetch();               // see Q6c
    router.history.replace('/configuracion');
  }, [google, router]);
  …
}
```

- `useState(google)` captures the value on the **first render**, before the effect strips the URL. The
  message therefore lives in state, not derived from the URL, and survives the rewrite.
- `router.history.replace('/configuracion')` rewrites the URL through TanStack Router's own history
  wrapper, so `router.state.location`, the address bar, and back/forward all stay coherent, and — like
  `navigate({ replace: true })` — Back does not return to the parameterised URL: the message cannot
  reappear through history.
- Refreshing the cleaned URL shows nothing. Correct: the confirmation reports an **event that just
  happened**, not a property of the page.
- **Dismissal rule**: `setAvisoGoogle(undefined)` when a Google dialog opens, so a stale
  "Vinculaste tu cuenta de Google." never sits beside a fresh failure (Q1c).

Copy: `vinculado` → `Vinculaste tu cuenta de Google.` (polite) · `error` →
`No se pudo vincular tu cuenta de Google. Intenta nuevamente.` (alert).

#### Q6c — Identity refetch: exactly once, via a one-tick guard (revised in PR#2)

The callback is a `302` from `api.moneydiary.cl` to `app.moneydiary.cl/configuracion?google=…` — a
**full document load**. React mounts, the router runs `_authenticated`'s `beforeLoad`,
`requireSession` fetches `/api/auth/me` fresh, and Q3b primes `['auth-me']` with the **post-link**
identity.

The naive assumption — "that's the only `beforeLoad` run for this landing" — is wrong: `router.history.
replace(...)` in Q6b is still a REPLACE history event, and TanStack Router's `Transitioner` re-runs
`beforeLoad` for **any** REPLACE/PUSH, including one the router's own history wrapper raises (there is
no public API that changes the URL without doing so). Left unguarded, `_authenticated`'s `beforeLoad`
would call `fetchMe()` a second time for the same landing.

The fix shipped in PR#2 first tried making `beforeLoad` **cache-backed** (`queryClient.
ensureQueryData`) so any re-run within the `['auth-me']` `staleTime` was a cache hit. Blind review
caught the regression this introduced: `ensureQueryData` never revalidates a stale-but-present entry
without `revalidateIfStale`, so **every** subsequent `beforeLoad` across the whole SPA session became a
cache hit too — a revoked server session stopped bouncing the user to `/login` at the route boundary.
That approach was reverted.

The shipped mechanism is a **purpose-built one-tick guard**
(`lib/skip-next-auth-refetch.ts`, `markSkipNextAuthRefetch`/`consumeSkipNextAuthRefetch`), armed by
exactly one call site — the Q6b cleanup effect, right before `router.history.replace(...)` — and
consumed by exactly one other call site — `_authenticated`'s `beforeLoad`, on the very next run. When
armed, `beforeLoad` reads the identity already primed in `['auth-me']` moments ago instead of paying
for a second `/api/auth/me`; every other `beforeLoad` run — including a genuine navigation to a
different authenticated route — keeps calling the raw `fetchMe()` unconditionally, exactly as before
this change. Pinned as tests: **on a `?google=vinculado` landing, `/api/auth/me` is fetched exactly
once**, and **a genuine navigation between two authenticated pages still fetches `/api/auth/me`
again.**

---

### Q7 — a11y: the eslint override, the rules that matter, and the hand-rolled dialog

#### Q7a — The eslint override shape

Appended to `apps/web/eslint.config.js` **after** the base block and **before**
`eslintPluginPrettierRecommended` (which must stay last so `eslint-config-prettier` wins).

```js
  // App-wide at WARN — starts the ADR-018 burn-down without making THIS change
  // absorb the app's pre-existing a11y debt. `pnpm web lint` is `eslint .` with
  // no `--max-warnings`, so warnings cannot fail CI.
  {
    files: ['**/*.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([regla, valor]) => {
        const [severidad, ...opciones] = Array.isArray(valor) ? valor : [valor];
        return [regla, severidad === 'off' ? 'off' : ['warn', ...opciones]];
      }),
    ),
  },
  // Scoped ERROR — the files this change authors. Globs the DIRECTORY, not
  // individual files, so a component added here later is gated automatically
  // (the proposal's "rules quietly stop applying" mitigation).
  {
    files: [
      'src/components/configuracion/**/*.tsx',
      'src/routes/_authenticated/configuracion.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
```

The severity derivation is drift-proof across plugin upgrades; hand-listing ~30 rule names at `warn`
would be the real anti-pattern (`dry`: it would need re-syncing on every upgrade). The plugin ships
no `warn` preset today — **if a future version does, replace the derivation with it**, and this note
is the trigger.

> **Corrected 2026-08-13 (judgment-day, PR #1a).** The derivation above originally read
> `Object.keys(...).map((regla) => [regla, 'warn'])`. That flattening was a bug: of the plugin's 34
> recommended rules, **3 ship as `'off'`** (`anchor-ambiguous-text`, `control-has-associated-label`,
> `label-has-for` — the last deprecated in favour of `label-has-associated-control`) and **7 ship as
> `[severity, options]` tuples**. Mapping every key to a bare `'warn'` turned the 3 off-rules on and
> discarded the 7 rules' options, producing 6 warnings in files the change never touched. Preserve
> `'off'` and re-attach `...opciones`, as shown. `apps/web/eslint.config.js` is the source of truth —
> do not copy this sample without checking it.

#### Q7b — Which rules actually matter here (not a gesture at "a11y")

| Rule | What it catches on this page |
|---|---|
| `jsx-a11y/label-has-associated-control` | the four `<label>`-wrapped inputs — the exact mechanism CA-05's `getByLabelText` depends on |
| `jsx-a11y/control-has-associated-label` | the icon-only sidebar-footer link has an accessible name |
| `jsx-a11y/anchor-is-valid` | that entry point is a router `<Link>`, not a `<div onClick>` |
| `jsx-a11y/no-autofocus` | the dialog moves focus with a `ref` in an effect, not `autoFocus` (which fires before the dialog is announced) |
| `jsx-a11y/aria-role`, `aria-props`, `role-has-required-aria-props` | `role="alertdialog"`, `role="alert"`, `role="note"` are spelled right and carry what they require |
| `jsx-a11y/no-noninteractive-element-interactions` | the dialog's `onKeyDown` sits on an element that actually has an interactive role |

**What eslint cannot catch, and therefore what the tests must** (Q9): whether focus actually moves,
whether it is actually restored, whether a live region actually updates, and whether an `aria-label`
is *truthful*. CA-05 reads as if the lint rule is the acceptance bar; it is a static-structure gate,
not an a11y test. Both layers ship.

#### Q7c — The hand-rolled dialog, wired explicitly (no library is doing this)

```tsx
<div
  role="alertdialog"
  aria-modal="false"
  aria-labelledby={tituloId}
  aria-describedby={descripcionId}
  onKeyDown={(e) => { if (e.key === 'Escape') cancelar(); }}
>
```

- **`aria-modal="false"`, explicit, not omitted.** This is an *inline* widget, like
  `EliminarIngestaControl` — the rest of the page stays reachable and there is **no focus trap**.
  Claiming `aria-modal="true"` without trapping focus is a lie to assistive tech that produces a
  worse experience than being honest about it. Same scoping decision the precedent already documents
  ("No full focus-trap").
- **Focus in → the password input.** *Deliberate divergence from the precedent*, which focuses
  `Confirmar` because its dialog needs no input. Here the first thing the user must do is type a
  password; focusing `Confirmar` would force a keyboard user to shift-Tab backwards to find the
  field. `useEffect(() => { if (abierto) passwordRef.current?.focus(); }, [abierto])`.
- **Focus out → the trigger, unconditionally.** `Escape`, `Cancelar` and a successful close all call
  `triggerRef.current?.focus()`. Restoration is **not** conditional on how the dialog closed — a
  keyboard user must never be dropped on `<body>`. One exception, by nature: the **link** path
  navigates away entirely, so there is nothing to restore to.
- **`aria-labelledby` + `aria-describedby`, not `aria-label`.** The description carries the
  load-bearing warning (`Vas a salir de MoneyDiary para autorizar en Google. Los cambios sin guardar
  se perderán.`), and a description that exists only visually is not announced when the dialog opens.
  The precedent uses `aria-label` + a visible `<p>`; this one needs the `<p>` announced. Divergence
  with a reason.
- **Error inline via `role="alert"` inside the dialog**, so a failed confirm is announced without
  moving focus and the dialog stays open for a retry (the `EliminarIngestaControl` divergence, reused
  here for the same reason).
- **`Confirmar` is `disabled` while pending; the password input is NOT.** Disabling an input drops
  focus, and the user may want to correct it.

#### Q7d — The two message regions

Both are **always mounted**, empty when there is no message — not conditionally rendered:

```tsx
<p aria-live="polite" className="…">{mensajeOk}</p>
<p role="alert"      className="…">{mensajeError}</p>
```

`role="alert"` is assertive and interrupts — correct for "your save failed", wrong for "saved", which
should not interrupt whatever the user is reading. A polite region that mounts at the same instant
its content appears is frequently missed by screen readers; always-mounted with swapped content is
announced reliably. This is a **deliberate divergence from `LoginForm`**'s
`{estado === 'error' && <p role="alert">}`, which is fine there because it has exactly one message
that never changes; here the content changes between submits and must be announced each time.

#### Q7e — The tab list

`Perfil` renders `aria-current="page"` plus a visual treatment (proposal §7: a tab list that does not
say which panel is showing is an a11y defect, not a style choice).

`Categorías` matches the `NavItem` placeholder treatment verbatim (`NavItem.tsx:56-68`): a native
`<button type="button" disabled aria-disabled="true">` — no `href`, not focusable, not in the tab
order, announced as disabled out of the box. US-043 flips it to a link in one line, exactly as the
nav placeholder flips here.

---

### Q8 — The error/copy table, corrected to a **total** function

#### Q8a — **CORRECTION: the proposal's table is not total against the API's translator**

`apps/api/src/infrastructure/http-express/routes/perfil-http-error.ts` emits exactly eight codes.
The proposal's §4 table covers five and omits three:

| Code | Status | In the proposal's table? |
|---|---|---|
| `NOMBRE_INVALIDO` | 400 | ✅ |
| `PASSWORD_INVALIDA` | 400 | ✅ |
| **`EMAIL_INVALIDO`** | 400 | ❌ **missing** |
| `PERFIL_RECHAZADO` | 403 | ✅ |
| `DEMO_SOLO_LECTURA` | 403 | ✅ |
| `VINCULO_REQUIERE_PASSWORD` | 403 | ✅ |
| **`GOOGLE_YA_VINCULADO`** | 409 | ❌ **missing** |
| **`GOOGLE_NO_DISPONIBLE`** | 503 | ❌ **missing** |

A missing row is not a cosmetic gap: it falls through to
`Ocurrió un error inesperado. Intenta nuevamente.` for a failure the API took the trouble to make
actionable. Two of the three are reachable by an ordinary user (`EMAIL_INVALIDO` on a typo;
`GOOGLE_YA_VINCULADO` on a stale tab clicking `Vincular` twice).

#### Q8b — The closed table

Register: neutral es-CL, no voseo, matching `Ocurrió un error inesperado. Intenta nuevamente.` and
`Credenciales inválidas.` already shipped.

| Outcome (status + body `code`) | Verbatim copy | Region |
|---|---|---|
| Save ✓, no password change | `Cambios guardados.` | polite |
| Save ✓, password changed | `Cambios guardados. Se cerraron tus otras sesiones.` | polite |
| Nothing changed | `No hay cambios para guardar.` | polite |
| Missing `Password actual` (local gate) | `Ingresa tu password actual.` | alert |
| Profile ✓, password ✗ | `Se guardaron tus datos, pero no se pudo cambiar la password.` **+ the password row below** | alert |
| `403 PERFIL_RECHAZADO` on the profile call | `No se pudieron guardar los cambios. Revisa tu password actual y el email.` | alert |
| `403 PERFIL_RECHAZADO` on the password call | `No se pudo cambiar la password. Revisa tu password actual.` | alert |
| `400 NOMBRE_INVALIDO` | `El nombre debe tener entre 1 y 80 caracteres.` | alert |
| `400 EMAIL_INVALIDO` | `El email no es válido.` | alert |
| `400 PASSWORD_INVALIDA` | `La password nueva no cumple los requisitos mínimos.` | alert |
| `403 DEMO_SOLO_LECTURA` | `Estás en una cuenta de demostración. Crea una cuenta real para editar tu perfil.` | alert |
| `403 VINCULO_REQUIERE_PASSWORD` | `No puedes desvincular Google sin una password en tu cuenta.` | alert |
| `409 GOOGLE_YA_VINCULADO` | `Tu cuenta ya tiene Google vinculado.` | alert |
| `503 GOOGLE_NO_DISPONIBLE` | `El ingreso con Google no está disponible por ahora. Intenta más tarde.` | alert |
| `tag: 'network'` | `No se pudo conectar con el servidor.` | alert |
| Any other non-2xx | `Ocurrió un error inesperado. Intenta nuevamente.` | alert |
| `tag: 'unauthorized'` (401) | *no message* — `navigate({ to: '/login' })` | — |
| Google return `?google=vinculado` | `Vinculaste tu cuenta de Google.` | polite |
| Google return `?google=error` | `No se pudo vincular tu cuenta de Google. Intenta nuevamente.` | alert |
| Unlink ✓ | `Desvinculaste tu cuenta de Google.` | polite |

**The anti-enumeration constraint, honoured.** PERF040-04 makes "wrong current password" and "that
email belongs to someone else" byte-identical, so the UI may not name a cause. It names the two
**inputs involved**, which is true in both cases and actionable in both. `400` is safely
distinguishable from `403`: only the *cause within* a `403` is deliberately indistinguishable, and
`400` bodies carry a code — so those rows are earned, not guessed.

**Nothing renders a server-supplied string.** Every message is a client constant selected by
`status + code`. This is a deliberate divergence from `postIngesta`, which passes `body.message`
verbatim (correct there — the backend owns those distinctions and the client cannot reconstruct
them). Here the backend *deliberately* collapses distinctions, so echoing its message would be
copying a string chosen for a different purpose.

#### Q8c — The translator shape

`components/configuracion/mensajes.ts` exports:

```ts
export type Mensaje = { readonly tono: 'ok' | 'error'; readonly lineas: readonly string[] };
export function mensajeDeResultado(r: ResultadoGuardado): Mensaje       // total over the union
export function mensajeDeApiError(e: ApiError, origen: 'perfil' | 'password' | 'google'): string
```

`mensajeDeResultado` closes with `const _exhaustive: never = r;` — the `aPerfilHttpError` idiom on
the API side, applied client-side. Adding a member to `ResultadoGuardado` without a copy row stops
compiling. That is the mechanism that keeps the table total *over time*, not just today.

`origen` exists because `PERFIL_RECHAZADO` needs two different messages depending on which call
produced it (rows 6/7). It is a parameter, not two functions: the two differ by one sentence, and two
near-identical translators would drift.

---

### Q9 — Testing strategy and the mandatory gates

Per the repo (`use-eliminar-ingesta.test.tsx`, `demo-banner-layout.test.tsx`): Vitest + RTL + jsdom,
`vi.stubGlobal('fetch', vi.fn())`, a fresh `QueryClientProvider` per test via a local `crearWrapper`,
**no MSW**.

#### Q9a — The test that would FAIL if the save order were reversed

Sequence must be asserted as a **sequence**, not as "both endpoints were called" — the weaker
assertion passes under a reversed implementation, which is exactly the bug the forced order exists to
prevent.

```ts
const llamadas: string[] = [];
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  llamadas.push(`${init?.method ?? 'GET'} ${url}`);
  …
});

// row 9 — both changed, both succeed
expect(llamadas).toEqual([
  'PATCH /api/perfil',
  'PATCH /api/perfil/password',
]);
```

`toEqual` on the whole array rather than `toHaveBeenNthCalledWith`: exact array equality also fails if
a third call sneaks in, and it reads as the contract. Under a reversed implementation it fails on the
first element.

**The stronger companion — the abort rule (row 10):**

```ts
// PATCH /api/perfil responds 403 PERFIL_RECHAZADO
expect(llamadas).toEqual(['PATCH /api/perfil']);   // exactly one call, ever
```

This one cannot pass under a reversed implementation either, and it is the row-10 guarantee stated as
code.

**The third, which proves "retry is idempotent by construction" (row 11):**

```
submit #1 → ['PATCH /api/perfil', 'PATCH /api/perfil/password']   (the second 403s)
  … the /api/auth/me refetch returns the NEW nombre …
submit #2 → ['PATCH /api/perfil/password']    ← the profile is clean, so it is NOT re-sent
```

This fails if change detection ever compares against a mount-time snapshot instead of the query cache
(Q2a). It is the test that protects the mechanism, not just the outcome.

#### Q9b — **CORRECTION: the error table is tested as a pure function, not as 16 renders**

The proposal says "one test per outcome, asserting the verbatim string". Sixteen component renders
for sixteen strings is slow and tests the same wiring sixteen times.

**Decision**: `mensajeDeResultado` / `mensajeDeApiError` are table-driven `it.each` tests over
**pure functions** (which is where totality lives — the `never` guard), plus **three** component
tests that prove the wiring: one `ok` → the polite region, one `error` → the alert region, one
partial → two lines in the alert region. Same coverage, a fraction of the runtime, and a failure
points at either the copy or the wiring instead of at both.

#### Q9c — The full matrix

| Target | Asserted |
|---|---|
| `esMeDto` | Rejects: missing `nombre`; missing `googleVinculado`; `nombre: 42`; `googleVinculado: 'si'`. Accepts the two valid fixtures. The existing cross-field cases keep passing |
| The three route-tree stubs | Green after **both** edits (payload + `context: { queryClient }`) — the proof that the hardened guard does not break the app |
| `useMe` + priming | Landing on `/configuracion` fetches `/api/auth/me` **exactly once**, using a client built from `QUERY_CLIENT_DEFAULTS` (Q3c) |
| Sequential save | Q9a's three tests, plus rows 1–8 of Q2c (no-op makes **zero** requests; missing-password gate makes zero requests; password-only sends one call and clears both password fields) |
| Invalidation | A profile-touching success invalidates `['auth-me']`; a password-only success invalidates **nothing** |
| Error mapping | Q9b |
| `?google=` | Both values render their message; an unknown value renders none and no error; the URL is cleaned (`router.state.location.search` is empty); the message survives the cleaning; `/api/auth/me` still exactly once |
| Google dialogs | Focus lands on the **password input**; Escape restores focus to the trigger; the leaving-the-app sentence is present **and is the `aria-describedby` target**; `window.location.assign` is called with the returned `urlAutorizacion` |
| Demo | Controls `disabled` + the `role="note"` explanation present; the `403 DEMO_SOLO_LECTURA` mapping still selects the demo copy (asserted on the translator, not through a disabled button) |
| a11y (CA-05) | Every input reachable by `getByLabelText` — RTL's label query **is** the label-association assertion. Plus `pnpm web lint` clean under the scoped `error` rules |

**jsdom gotcha, and the design constraint it imposes**: `window.location.assign` cannot be replaced
by assignment in current jsdom. The link handler therefore calls `window.location.assign(url)` — a
**method**, precisely so it is spy-able (`vi.spyOn` / `vi.stubGlobal`). Choosing the seam a test can
hold is an implementation constraint driven by testability, recorded so it is not "simplified" to
`window.location.href = url` later.

#### Q9d — Strict TDD and the one place it needs a rule

Strict TDD is active. Red → green → refactor per unit, with one unavoidable exception:

**The route file cannot be red-first.** `NavRoute = FileRouteTypes['to']` comes from
`routeTree.gen.ts`, which only learns about `/configuracion` after `tsr generate` runs. So the order
for that unit is: create the route file → `pnpm web typecheck` (which regenerates the tree) → write
the route-tree test → implement the component. Stated here so the tasks phase does not produce an
impossible red-first step and then quietly skip it. Every other unit — guards, translators, the
orchestration, the form, the dialog — is red-first with no exception.

#### Q9e — The gates, in order

```
# 0. Before any file is written
   the PATCH pre-flight (Q5a), with its status code recorded

pnpm web typecheck   # tsr generate && tsc -b — the ONLY typecheck. REQUIRED: this change adds a route file
pnpm web test        # vitest run — does NOT typecheck
pnpm web lint        # eslint . — the new jsx-a11y scope
```

`pnpm web test` passing means **nothing** about types. US-040 shipped a CI break exactly this way and
`VINC041-11` wrote the rule down; `esMeDto` and the `__root.tsx` context change are both
typecheck-only failure surfaces here.

---

### Q10 — Delivery constraints for the tasks phase

Confirms the proposal's two-PR split. `sdd-tasks` owns the binding forecast; this design owns the
**ordering** and one prohibition.

**PR #1 — Page and profile.** Internal order is not cosmetic: steps 1–3 are type-level changes whose
fallout `tsc` enumerates. **Do not hunt references by grep** (the US-039/040/041 precedent).

| # | Content | Why here |
|---|---|---|
| 0 | The `PATCH` pre-flight (Q5a) | A recorded result, not code. Its failure invalidates everything after it |
| 1 | `__root.tsx` context typing · `query-client-defaults.ts` · `use-me.ts` · priming in `_authenticated.tsx` | `createRootRouteWithContext` turns the three tests' missing `context` into a **type** error |
| 2 | `esMeDto` hardening + the three stub repairs (payload **and** router context) | The lockout risk gets a review of its own, with Q4c in front of the reviewer |
| 3 | Route file + `validateSearch`, then `pnpm web typecheck` | Regenerates the tree so `NavRoute` accepts `/configuracion` |
| 4 | Nav flip + sidebar-footer link | Only compiles after step 3 — they are in the same PR **by construction** |
| 5 | jsx-a11y wiring | Must be in place before the form is authored, or the scoped `error` rules gate nothing |
| 6 | `perfil.ts`: `patchPerfil`, `patchPassword`, guards, `403`-code mapping | — |
| 7 | `PerfilForm` + `use-guardar-perfil.ts` + `mensajes.ts` | Ships CA-01, CA-02's first two blocks, CA-03, CA-05 end to end |

**PR #2 — Google and layout.** `perfil.ts` gains `postVincularGoogle`/`postDesvincularGoogle`;
`use-google-vinculo.ts`; `GoogleVinculoSection` + `ConfirmarPasswordDialog`; `?google=` handling; the
two pill tokens; the fluid T1 grid and the stacked sub-`lg` layout. Ships CA-02's third block and
CA-04. Depends on #1 only for the page shell it plugs into.

**Budget.** PR #1 is the larger and the riskier. If it forecasts past 400 changed lines, **the only
sanctioned further split is between step 5 and step 6** — an infrastructure PR (context typing,
`use-me`, hardening, stub repairs, route, nav flip, a11y config) and a form PR.

**Prohibition: the save orchestration must never be split across PRs.** A half-wired sequential save
— the profile call shipped, the password call and the abort rule pending — is a page that silently
does less than its button says, and it is worse than a large diff.

**The window between the two PRs, named so a reviewer does not ask.** After PR #1, `/configuracion`
exists, so US-041's redirect target stops 404ing even though the Google section is not built.
`?google=vinculado` lands on a page that **silently drops the parameter** (`validateSearch` returns
`{}` and PR #1 renders no aviso). The user sees their profile page with a clean URL: no crash, no
error, no false statement. Acceptable. Deliberately **not** mitigated by shipping the `?google=`
message in PR #1 — a "Vinculaste tu cuenta de Google" banner on a page with no Google section is
worse than silence.

---

### Resolutions of the proposal's own open questions

| # | Question | Resolution |
|---|---|---|
| **P1** | Does the `Vinculada:` pill show the account email or no address? | **Show it, verbatim per the wireframe.** The API cannot supply the Google address (VINC041-08), and a bare `Vinculada` tells the user nothing about *which* account is affected. The account email is the true, available answer to "what does this link attach to". The residual ambiguity ("is that my Google address?") is **accepted and recorded**, not designed away, because binding decision "wireframe copy verbatim" outranks it. **Totality**: when `me.email === null` the label renders `Vinculada` with no colon and no address — unreachable today (a demo account can never be linked) but the render must not produce a dangling `Vinculada: `. |
| **P2** | Which token pairing carries the green pill? | **Alias, per §Q11 below.** |
| **P3** | Does `Guardar cambios` need the leaving-the-app warning? | **No.** It does not navigate away. The loss happens on `Vincular con Google`, and the dialog says so verbatim before the user confirms — the warning belongs where the loss is caused. A blocking `beforeunload` is rejected: it fires on every navigation including legitimate ones, cannot be styled or worded, and is a worse experience than the sentence already shipping. |
| **P4** | Does the password-success line mention revoked sessions? | **Yes** — `Cambios guardados. Se cerraron tus otras sesiones.` PERF040-06 is a real, surprising consequence (a user's phone silently logs out); silence about it generates support questions and looks like a bug. |
| **P5** | `Categorías` placeholder affordance | **Match `NavItem`'s placeholder** verbatim (`NavItem.tsx:56-68`): `<button type="button" disabled aria-disabled="true">`. No "Próximamente" hint — the app already has one established way to say "not built yet", and inventing a second one for the same concept is the `dry` failure the nav's discriminated union exists to prevent. US-043 flips it in one line. |

---

### Q11 — The green pill: **alias the verified pair under a semantic name**

**The facts.** `index.css` has exactly one AA-verified fill+text pair: `--color-ingreso: #d1fae5` /
`--color-ingreso-foreground: #065f46`, documented at **6.78:1 (AA)** and named for *income*
(DCR-01/03/06). The bucket pastels are explicitly **fills only, never text** (the two-tier colour
rule, `index.css:47-54`), so none of them can carry a label.

| Option | Verdict |
|---|---|
| Reuse `--color-ingreso` / `-foreground` directly on the pill | **Rejected.** It passes contrast but lies by name: a future reader greps `ingreso` expecting money and finds an auth widget, and a future restyle of the income card would silently restyle account-security state. This is `dry`'s *wrong* DRY — unifying two concepts that merely share a value today |
| Invent a new colour | **Rejected.** A new hex needs its own contrast verification and grows a palette DCR-03 keeps deliberately small, for one pill |
| **Alias the verified pair under a semantic name** | **Chosen** |

```css
  /*
   * Estado de vínculo de identidad externa (US-042). MISMOS valores verificados
   * del par `ingreso` (6.78:1, AA — DCR-06): no se introduce un color nuevo, se
   * le da NOMBRE al segundo concepto que lo usa. Los valores están literales, NO
   * como `var(--color-ingreso)`: un alias por referencia haría de la tarjeta de
   * ingresos la fuente de verdad del color de un estado de seguridad. Si mañana
   * cambia el color de ingresos, este par NO debe seguirlo.
   */
  --color-vinculo-activo: #d1fae5;
  --color-vinculo-activo-foreground: #065f46;
```

The literal duplication is the point and the docblock is what stops someone "fixing" it — two
duplicated hex values are the cheaper mistake than the wrong coupling (`dry` limits, `kiss`'s
tolerance for small duplication).

**Not-linked pill**: existing neutrals, `bg-muted text-muted-foreground` (`#f3f3f3` / `#44474e`,
~8.9:1 per `index.css:69`). No new token, symmetric structure, different tone, both AA.

**Colour is not the only carrier**: the linked pill also has a check icon and the word `Vinculada`;
the unlinked one reads `No vinculada`. Meaning survives without colour (WCAG 1.4.1).

**Acceptance**: DCR-06. The tasks phase records the measured ratio as shipped — it is the same pair,
so 6.78:1 carries over, but the number goes in the task so it is **checked** rather than inherited.

---

## 2. Architecture decisions (D-numbered)

### D-01 — The page is a composition of narrow presentational components over one query and local drafts

No store, no reducer, no page-scoped context. The state rule of §1/Q1b is the entire state
architecture: query cache for identity, local `useState` for drafts and outcomes, route context for
`esDemo`, URL for nothing that must survive. Every component below `ConfiguracionPage` receives what
it needs as props and owns only what it alone can own.

Justification against the alternative: a `useConfiguracionPage()` hook or a Zustand slice would make
every component's test require the whole page's stubs. The current split lets `CampoTexto`,
`ConfirmarPasswordDialog` and `mensajes.ts` be tested with **zero** network stubbing.

### D-02 — `ConfirmarPasswordDialog` does not know what it is confirming

Props only: `titulo`, `descripcion`, `textoConfirmar`, `pendiente`, `error`, `onConfirmar(password)`,
`onCancelar`. Link and unlink are two callers, not two branches. A third password-gated action costs
zero changes (OCP), and there is one dialog test suite instead of two near-identical ones.

**Rejected**: a `modo: 'vincular' | 'desvincular'` prop. It would put a `switch` inside the dialog
that grows with every caller — the `solid` "growing `switch` in the detector" anti-pattern, at the
component level.

### D-03 — Sequence is the state; the partial outcome is a value, not an exception

§1/Q2b's function is the whole orchestration: two `if`s, two early returns, two levels of nesting.
The forced order is the physical order of the blocks; the abort rule is the first `return`.

`ResultadoGuardado` makes the one reachable partial a first-class value. **Corollary that matters for
review**: `mutation.error` on this page means *unmodelled*, i.e. a bug — not "the save failed".

### D-04 — The copy table is a total function closed by a `never` guard

Every message is a client constant selected by `status + code`; no server string is ever rendered
(§1/Q8b's divergence from `postIngesta`, with its reason). `mensajeDeResultado` closes with
`const _exhaustive: never = r;`, so adding an outcome without copy stops compiling. That is what keeps
the table total **over time**, which is the part a table alone cannot guarantee.

### D-05 — The identity guard is fail-closed, and its blast radius is a documented deploy-ordering rule

§1/Q4. Fail-closed matches every other guard in `client.ts`; the lockout is real, is a function of
`requireSession` not discriminating `parse`, and is mitigated by documentation in the PR description
plus a recorded follow-up with an explicit trigger. **Softening the guard is not on the table**; the
alternative that *is* recorded is making `requireSession` legible about `parse`, deferred with a
reason.

### D-06 — One `/api/auth/me` per visit, by priming rather than by coordination

`beforeLoad` writes the cache it already paid for. No `initialData`, no shared context field, no
"skip the query if route context has it" flag. The 30 s `staleTime` that makes it work is now a
**shared constant** (§1/Q3c) so a test client cannot silently contradict production and invalidate
the very assertion that proves the property.

### D-07 — Every structural change is a compile error when omitted

The tasks phase sequences by making each type change first and letting `tsc --noEmit` enumerate the
fallout. **Do not hunt references by grep.**

| Type change | What deliberately breaks |
|---|---|
| `createRootRouteWithContext<{ queryClient }>` | every `createRouter({ routeTree })` without a `context` — exactly the three route-tree tests |
| `esMeDto` hardening | **nothing at compile time** — it is a runtime guard. Caught by `pnpm web test`, which is why the three stub payloads are named explicitly (§1/Q4b) rather than left to `tsc` |
| `NAV_ITEMS` placeholder → link | does not compile until the route file exists (`NavRoute = FileRouteTypes['to']`) |
| A new member of `ResultadoGuardado` | `mensajeDeResultado`'s `never` guard |

The second row is the one to watch: it is the only change in this design whose omission produces a
**green typecheck and a red test suite**, which is the opposite of the usual order here.

### D-08 — No new dependency, no new breakpoint tier, no shell surgery

Binding decisions 5 and 6, plus proposal §0. `layout.ts`, `AppShell.tsx`, `Sidebar.tsx` and
`BottomTabs.tsx` are **untouched**; the sidebar-footer entry point rides the existing `sidebarFooter`
prop from `_authenticated.tsx`, which is a one-call-site change. The page's own grid is fluid
(`max-w-*` container + a `grid` with a fixed first track and a flexible second), reproducing T1 at
T1's width and every width between.

---

## 3. Module map

| File | Action | Detail |
|---|---|---|
| `src/routes/_authenticated/configuracion.tsx` | **New** | `validateSearch` (Q6a) + the `?google=` read/clean effect (Q6b). Thin |
| `src/components/configuracion/ConfiguracionPage.tsx` (+ test) | **New** | Fluid grid, tab list, panel, the Google message region |
| `src/components/configuracion/ConfiguracionTabs.tsx` (+ test) | **New** | `Perfil` (`aria-current="page"`) + `Categorías` (inert, `NavItem` treatment) |
| `src/components/configuracion/PerfilForm.tsx` (+ test) | **New** | Four fields, `Guardar cambios`, two message regions |
| `src/components/configuracion/CampoTexto.tsx` (+ test) | **New** | `<label>`-wrapped `<input>`, four usages |
| `src/components/configuracion/GoogleVinculoSection.tsx` (+ test) | **New** (PR #2) | Pill + button, symmetric states |
| `src/components/configuracion/ConfirmarPasswordDialog.tsx` (+ test) | **New** (PR #2) | Hand-rolled `role="alertdialog"` (Q7c) |
| `src/components/configuracion/mensajes.ts` (+ test) | **New** | The closed copy table + the two total translators |
| `src/api/perfil.ts` (+ test) | **New** | `patchPerfil`, `patchPassword` (PR #1); `postVincularGoogle`, `postDesvincularGoogle` (PR #2). Never-throw `ApiResult<T>`, `credentials: 'same-origin'`, `403` mapped by body `code`, each response guarded |
| `src/api/use-me.ts` (+ test) | **New** | `ME_QUERY_KEY`, `meQueryOptions`, `useMe` |
| `src/api/use-guardar-perfil.ts` (+ test) | **New** | The sequential orchestration + `ResultadoGuardado` + `onSuccess` invalidation |
| `src/api/use-google-vinculo.ts` (+ test) | **New** (PR #2) | Link/unlink mutations |
| `src/api/query-client-defaults.ts` | **New** | `QUERY_CLIENT_DEFAULTS`, imported by `main.tsx` and the route-tree tests (Q3c) |
| `src/api/auth.ts` (+ test) | Modify | `esMeDto` hardening (Q4a) |
| `src/routes/__root.tsx` | Modify | `createRootRouteWithContext<{ queryClient: QueryClient }>` |
| `src/routes/_authenticated.tsx` | Modify | Prime `['auth-me']`; sidebar footer gains the account link |
| `src/main.tsx` | Modify | Consume `QUERY_CLIENT_DEFAULTS` |
| `src/components/app-shell/nav-items.ts` (+ test) | Modify | Placeholder → link. **One line** |
| `src/index.css` | Modify | Two `--color-vinculo-activo*` tokens (Q11) |
| `src/test/{redirect-after-login,demo-banner-layout,app-shell-layout}.test.tsx` | Modify | Payload **and** `context: { queryClient }` (Q4b) |
| `apps/web/eslint.config.js`, `apps/web/package.json` | Modify | `eslint-plugin-jsx-a11y` + the two-tier override (Q7a) |
| `src/components/app-shell/{AppShell,Sidebar,BottomTabs,layout}.ts(x)` | **Unchanged** | D-08 |
| `apps/web/api/proxy.ts`, `vercel.json` | **Unchanged** | Q5 — `PATCH` already flows |
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Zero files. If a diff appears here, the design was misread |

---

## 4. Design element → requirement mapping (hand-off to `sdd-spec`)

| Design element | Suggested `WCFG-*` requirement |
|---|---|
| Route under `_authenticated`, both entry points, unauthenticated → `/login?redirect=/configuracion` | **WCFG-01** — the page exists, is session-protected, and is reachable from two places |
| §1/Q2's change detection, forced order, abort rule, and the Q2c outcome table | **WCFG-02** — one action, at most two calls, in one order, with one reachable partial |
| §1/Q8's closed copy table + the never-more-specific-than-the-API constraint | **WCFG-03** — every outcome has exactly one message, and none names a cause the API hides |
| §1/Q3's single `/api/auth/me` per visit + invalidation on identity change | **WCFG-04** — identity is read once and invalidated on change |
| §1/Q4's hardened guard | **a delta on `WAC-02`** ("Runtime Guards and Error Handling Are Unchanged") — this **is** a runtime-guard change and `WAC-02` must be re-read, per the proposal |
| §1/Q6's literal-union return contract | **WCFG-05** — the return parameter selects a constant, is surfaced once, and leaves a clean URL |
| Google section states, password gate, unsaved-edits warning | **WCFG-06** |
| Demo: proactive disable + defensive mapping | **WCFG-07** |
| §1/Q7's label association, focus in/out, live regions, scoped lint | **WCFG-08** |
| §1/Q11's tokens + AA bar | a `DCR-*` delta or a `WCFG-09` — `sdd-spec` picks, per "file it where the claim is true" |
| CA-04's fluid grid with no new `layout.ts` constant | **WCFG-10** |

---

## 5. Risks this design does not remove

| Risk | Status after this design |
|---|---|
| An API rollback past US-040/041 locks the app out | **Not removed — made explicit and given a rule** (§1/Q4c). Mitigated by the PR-description requirement, not by code |
| `PATCH` fails at the Vercel layer | **Downgraded to Low** (§Q5: proven in prod, method-agnostic by construction) and gated by a task-zero pre-flight with a recorded result. If it fails at the platform layer, the change is **blocked**, not worked around |
| The wireframe's unaccented `Configuracion`/`Categorias` | Binding decision: ships **accented**. Already resolved before this phase; recorded here so it is not re-litigated |
| Unsaved edits lost on the Google redirect | Accepted; the dialog says so verbatim (P3) |
| Two duplicated hex values in `index.css` | **Deliberate** (Q11). The docblock is the mitigation |
| `mensajes.ts` grows into a page-wide god-module | Bounded by shape: it exports only constants and two total translators, and holds no state. If it ever grows a branch on component identity, split it |
