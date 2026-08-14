# Tasks: US-042 — Web Configuración page, Perfil section

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR #1a ~350-450 · PR #1b ~900-1100 (incl. tests) · PR #2 ~450-550 · Total ~1700-2100 |
| 400-line budget risk | High (all three slices) |
| Chained PRs recommended | Yes |
| Suggested split | PR #1a (infra/guard/entry) → PR #1b (perfil form) → PR #2 (Google/layout) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (tracker branch, cached) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Flag for the user before apply**: even after design's one sanctioned split point (between step 5
and step 6), PR #1b alone is forecast at ~900-1100 lines because the save orchestration and its form
must ship together — design explicitly **prohibits** splitting `use-guardar-perfil.ts` from
`PerfilForm.tsx` across PRs (a half-wired sequential save is worse than a large diff). No further
split is sanctioned. Options: (a) accept PR #1b as a documented `size:exception` slice within the
chain, or (b) request maintainer sign-off before apply. This is the one decision the guard requires.

**Guard decision (2026-08-13): option (a) accepted.** PR #1b ships as a documented `size:exception`
slice inside the chain. Rationale: design §10 prohibits splitting `use-guardar-perfil.ts` from
`PerfilForm.tsx`, so the only alternative to a large diff is a half-wired sequential save. PR #1b's
description must carry the `size:exception` label and cite this line. PR #1a and PR #2 stay within
the normal 400-line budget and get no exception.

### Suggested Work Units

| Unit | Goal | PR | Base branch |
|------|------|----|-------------|
| 1 | Query foundation, `esMeDto` hardening, route/nav/a11y wiring | PR #1a | `feat/us-042-web-configuracion-perfil` (tracker, draft/no-merge) |
| 2 | `perfil.ts` (profile/password) + sequential save + `PerfilForm` + page composition | PR #1b | PR #1a's branch |
| 3 | Google link/unlink + `?google=` contract + fluid T1 layout | PR #2 | PR #1b's branch |

Tracker merges to `main` only after all three are reviewed and integrated (feature-branch-chain).

---

## PR #1a — Infrastructure, identity guard, entry points

### Phase 0: Pre-flight (before any file is written)

- [x] 0.1 **PASS — observed status `200`.** Run the `PATCH /api/perfil` snippet from design §Q5a with
  a real session. Pass = `200` with updated `nombre` echoed. Fail (`405`/`501`/`502`, or `200` with
  `text/html`) = diagnose per §Q5b before writing code; a platform-layer refusal **blocks the
  change** — escalate, do not add `X-HTTP-Method-Override` (rejected, needs an API change).
  [design Q5a/Q5b]

  **Recorded evidence (2026-08-13, executed by the maintainer from the browser console):**

  | Field | Observed |
  |-------|----------|
  | `location.origin` | `https://app.moneydiary.cl` (production Vercel deployment) |
  | `status` | **`200`** |
  | `content-type` | `application/json; charset=utf-8` |
  | body | `{"userId":"usuario-fijo-moneydiary","nombre":"Preflight","esDemo":false,"googleVinculado":true,…}` |

  Both failure modes are affirmatively excluded: the status is not `405`/`501`/`502`, and the
  `content-type` is JSON rather than `text/html`, so the request reached the API instead of being
  answered by the SPA shell. `nombre` echoes back the value sent. **Vercel's platform layer forwards
  `PATCH` to the API — the change is unblocked and §Q5b's fallback ladder is not needed.**

  Ran against the **production** deployment rather than a branch preview: `apps/web/api/proxy.ts` and
  `vercel.json` are untouched by this change, so production exercises the identical platform path.
  Note the earlier false start — `method: 'PATH'` (typo) returns `400`, and a run against
  `localhost:5173` proves nothing, since Vite's dev proxy is not the Vercel function under test.

### Phase 1: Query foundation (type-level — let `tsc` enumerate the fallout, do not grep)

- [x] 1.1 Extract `src/api/query-client-defaults.ts` exporting `QUERY_CLIENT_DEFAULTS` mirroring
  `main.tsx:63`'s `staleTime: 30_000`. [design Q3c, D-06]
- [x] 1.2 Wire `main.tsx` to consume `QUERY_CLIENT_DEFAULTS`. Verify: `pnpm web typecheck`.
- [x] 1.3 RED: `src/api/use-me.test.ts` for `ME_QUERY_KEY = ['auth-me']`, `meQueryOptions`, `useMe`.
  (Written as `use-me.test.tsx` — the wrapper needs JSX, `.ts` cannot parse it; same extension as
  every other hook test in `src/api/`.)
- [x] 1.4 GREEN: `src/api/use-me.ts`. Verify: `pnpm web test src/api/use-me.test.ts`. [WCFG-03]
- [x] 1.5 `src/routes/__root.tsx` → `createRootRouteWithContext<{ queryClient: QueryClient }>()`.
  This is the type-level change that turns the 3 route-tree tests' missing `context` into a compile
  error. [design D-07, Q3c]
- [x] 1.6 Prime the cache in `_authenticated.tsx`'s `beforeLoad`:
  `context.queryClient.setQueryData(ME_QUERY_KEY, me)`; keep the return `{ esDemo: me.esDemo }`
  unchanged. [WCFG-03, design Q3b]
- [x] 1.7 RED+GREEN: route-tree test — `/api/auth/me` fetched exactly once landing on an
  authenticated route, using a `QueryClient` built from `QUERY_CLIENT_DEFAULTS`. [WCFG-03]
  (`src/test/use-me-priming.test.tsx`.)

### Phase 2: `esMeDto` hardening (runtime guard — NOT caught by `tsc`)

- [x] 2.1 RED: extend `src/api/auth.test.ts` — reject missing/mistyped `nombre`/`googleVinculado`,
  accept valid fixtures, keep the `esDemo ⇔ email` cases green. [WCFG-04]
- [x] 2.2 GREEN: add both checks to `esMeDto` (`src/api/auth.ts:82-88`) per design Q4a — **reject,
  never default**.
- [x] 2.3 Repair `src/test/redirect-after-login.test.tsx:38-42`: add `nombre`+`googleVinculado` to
  the stub payload **AND** add `context: { queryClient }` to `createRouter` — two edits, easy to miss
  the second. Verify: `pnpm web test src/test/redirect-after-login.test.tsx`.
- [x] 2.4 Repair `src/test/demo-banner-layout.test.tsx:19-23`: fix `buildFetchStub`'s param type +
  payload **AND** build the router's `QueryClient` from `QUERY_CLIENT_DEFAULTS` + add
  `context: { queryClient }`. Verify: `pnpm web test src/test/demo-banner-layout.test.tsx`.
- [x] 2.5 Repair `src/test/app-shell-layout.test.tsx:20`: add both fields **AND**
  `context: { queryClient }`. Verify: `pnpm web test src/test/app-shell-layout.test.tsx`.
  **Apply-time finding (not in design's three-file table): `src/test/login-error-param.test.tsx`
  also builds `createRouter({ routeTree })` with no `context` and needed the same `context: {
  queryClient }` repair (no payload change — it never visits `/api/auth/me`). Design's own rule
  ("every `createRouter({ routeTree })` without a `context`", D-07) covers it; the file just wasn't
  named. Fixed as part of this task and recorded here + in apply-progress.**
- [x] 2.6 Write the PR description with the exact rollback-ordering sentence: *an API rollback past
  US-040/041 must revert this web hardening first or in the same window, never API-first.* Nothing in
  the toolchain enforces this — the sentence is the mitigation. [design Q4c, D-05]
  (Drafted in `pr-1a-body.md`.)

### Phase 3: Route, nav entry points, a11y wiring

- [x] 3.1 Create `src/routes/_authenticated/configuracion.tsx` with `validateSearch` narrowing
  `google` to `'vinculado' | 'error' | undefined`. Component may be a thin placeholder — full
  composition lands in PR #1b. [design Q6a]
- [x] 3.2 Run `pnpm web typecheck` to regenerate `routeTree.gen.ts` so `FileRouteTypes['to']` gains
  `/configuracion`. Do this before 3.3 — the one unit exempt from red-first (route file must exist
  before `tsr generate` can run). [design Q9d]
- [x] 3.3 Flip `src/components/app-shell/nav-items.ts`'s `Configuración` placeholder to
  `{ kind: 'link', to: '/configuracion', icon: Settings }` (one line) — compiles only after 3.2.
  Update its test. (`Sidebar.test.tsx` + `BottomTabs.test.tsx`: moved `Configuración` out of the
  placeholder loop into its own link assertion.)
- [x] 3.4 Add the sidebar-footer icon link in `_authenticated.tsx` via the existing `sidebarFooter`
  prop, `aria-label="Configuración de la cuenta"`, no user name. Do **not** touch `Sidebar.tsx` or
  `AppShell.tsx`. [WCFG-01]
- [x] 3.5 RED+GREEN: unauthenticated visit to `/configuracion` redirects to
  `/login?redirect=/configuracion`; both entry points navigate to `/configuracion`. [WCFG-01]
  (`src/test/configuracion-entry-points.test.tsx`.)
- [x] 3.6 Install `eslint-plugin-jsx-a11y`; add the two-tier override to `apps/web/eslint.config.js`
  (app-wide `warn` derived from `jsxA11y.flatConfigs.recommended.rules` keys; scoped `error` on
  `src/components/configuracion/**` + the route file; both before
  `eslintPluginPrettierRecommended`). Must land before Phase 4 authors any file under that glob.
  Verify: `pnpm web lint`. [WCFG-12, design Q7a]

**PR #1a status (2026-08-13): tasks 1.1–3.6 complete. `pnpm web typecheck && pnpm web test && pnpm
web lint` all green (582 tests, 0 lint errors — 2 pre-existing app-wide jsx-a11y warnings, unrelated
to this change). The app-wide severity derivation (3.6) was hardened post-review to preserve `'off'`
rules and per-rule options from `jsxA11y.flatConfigs.recommended.rules` instead of flattening every
key to `'warn'`; that bug had spuriously turned on `label-has-for` (5 of the original 6 warnings) and
dropped `no-noninteractive-element-interactions`'s options. Task 0.1 remains unchecked and is a gate
the user must run and record before the PR is opened — not automatable from an apply session.**

---

## PR #1b — Perfil form (base: PR #1a's branch)

**Prohibition: 4.6-4.9 (the save orchestration) must never be split across PRs or deferred — a
half-wired sequential save is worse than a large diff.** [design §10]

- [x] 4.1 RED: `src/api/perfil.test.ts` for `patchPerfil`/`patchPassword` — never-throw `ApiResult<T>`,
  `credentials: 'same-origin'`, `403` mapped by body `code` (`PERFIL_RECHAZADO`, `DEMO_SOLO_LECTURA`),
  each response guarded.
- [x] 4.2 GREEN: `src/api/perfil.ts` — `patchPerfil`/`patchPassword`.
- [x] 4.3 RED+GREEN: `src/components/configuracion/mensajes.ts` (+test) — `it.each` over
  `mensajeDeResultado`/`mensajeDeApiError` as pure functions, closed with `const _exhaustive: never
  = r`. Use the **eight-code** table (spec WCFG-09 / design Q8b), including the three the proposal's
  table omitted: `EMAIL_INVALIDO` (400), `GOOGLE_YA_VINCULADO` (409), `GOOGLE_NO_DISPONIBLE` (503).
  [WCFG-09]
  **Apply-time dependency (not named in design's task order): `mensajeDeResultado`'s signature needs
  `ResultadoGuardado`, whose type only gets defined in `use-guardar-perfil.ts` (task 4.6/4.7). Resolved
  by declaring `ResultadoGuardado`/`DraftPerfil` as type-only exports in `use-guardar-perfil.ts`
  BEFORE 4.3, then adding the `guardar`/`useGuardarPerfil` implementation in the same file at 4.7 —
  same type-first sequencing design.md D-07 already prescribes elsewhere.**
- [x] 4.4 `src/components/configuracion/CampoTexto.tsx` (+test) — `<label>`-wrapped `<input>`, pure
  presentational, 4 usages. [WCFG-12]
- [x] 4.5 `src/components/configuracion/ConfiguracionTabs.tsx` (+test) — `Perfil` with
  `aria-current="page"`; `Categorías` as `<button type="button" disabled aria-disabled="true">`
  (verbatim `NavItem` placeholder treatment).
- [x] 4.6 RED: `src/api/use-guardar-perfil.test.ts` — write these three sequence tests BEFORE the
  implementation: (a) **order** test asserting the call-order **array** via
  `toEqual(['PATCH /api/perfil', 'PATCH /api/perfil/password'])` — NOT "both were called", which
  passes under a reversed implementation; (b) **abort** test asserting exactly one call
  (`toEqual(['PATCH /api/perfil'])`) when the profile call 403s; (c) **retry-idempotent** test — after
  a partial failure, a second submit sends only the password call, because change detection compares
  the draft against the **query cache**, never a mount-time snapshot. [WCFG-06, WCFG-07, design Q9a,
  Q2a]
  (Written as `use-guardar-perfil.test.tsx` — needs JSX for the `QueryClientProvider` wrapper, same
  reason `use-me.test.tsx` is `.tsx` not `.ts`, PR #1a task 1.3.)
- [x] 4.7 GREEN: implement `construirPerfilPatch` + the `guardar` orchestration in
  `use-guardar-perfil.ts` exactly per design Q2b's shape — profile block physically first, password
  block second, abort as the first early return. `onSuccess` owns cache invalidation (invalidate on
  any `perfilGuardado`, never on password-only success). [WCFG-05, WCFG-06, WCFG-07, WCFG-08]
  **`mutationFn` reads `me` directly from `queryClient.getQueryData(ME_QUERY_KEY)` at submit time
  (not from a `mutate()` argument/component closure) — the most literal reading of Q2a's "compared
  against the cache, never a mount-time snapshot", and it is what makes the retry-idempotent test
  correct regardless of when React re-renders `PerfilForm` after invalidation.**
- [x] 4.8 RED+GREEN: rows 1-11 of design Q2c as discrete/`it.each` tests (no-op sends zero requests;
  missing-`passwordActual` gate sends zero requests; password-only sends one call and clears both
  password fields; partial failure keeps password fields; full success clears them). [WCFG-05..08]
  (Rows 1-6 and the invalidation matrix asserted at the hook level in `use-guardar-perfil.test.tsx`;
  rows 7/9/11's field-clearing/keeping behavior asserted at the component level in
  `PerfilForm.test.tsx`, task 4.9 — clearing is a `PerfilForm` concern, not the hook's.)
- [x] 4.9 `src/components/configuracion/PerfilForm.tsx` (+test): 4 fields via `CampoTexto`,
  `Guardar cambios` `disabled={mutation.isPending}`, **two always-mounted** message regions
  (`aria-live="polite"` + `role="alert"`) — two regions, not one, because a page-level region would
  have two writers with no ordering rule. `Password actual` gets native `required` when the email
  input is dirty. [WCFG-08, WCFG-09, WCFG-12, design Q1c, Q7d]
  **Apply-time addition beyond the task's literal wording: `PerfilForm` also intercepts
  `error.tag === 'unauthorized'` on either call and navigates to `/login` without rendering any
  message — the WCFG-09 table's last row ("no message — `navigate({ to: '/login' })`"), which the
  task list didn't call out as a sub-step but the spec requires.**

  **Maintainer decision (2026-08-13, after judgment-day): the password-field clearing condition is
  `r.tipo === 'ok'`, not `r.tipo === 'ok' && r.passwordCambiada`.** Two judges flagged across two
  rounds that `passwordActual` survived a successful save that changed no password. `design.md` Q2c
  never resolved that sub-case — it documents clearing only for rows 7/9/11 — so it was escalated
  instead of being settled by a fix agent. Rationale: `Password actual` exists to authorize the email
  change (Q1c); once the save succeeds the credential's purpose is spent and keeping it in component
  state and in the DOM is retention with no function. `passwordNueva` is already empty in that branch
  (with both filled, the outcome would be `ok`+`passwordCambiada` or `password-fallo`), so clearing
  both is equivalent to branching and simpler. **Non-`ok` results still clear nothing** — Q2c rows
  8/10/11 need the typed password to survive a partial failure so the retry sends only the password
  call; those tests were re-run and stay green. Written red-first (new test verified failing against
  the old condition). If `design.md` Q2c is ever revised, fold this in as its missing row.
- [x] 4.10 `src/components/configuracion/ConfiguracionPage.tsx` (+test): fluid grid skeleton (fixed
  first column + flexible panel, no `md:` tier), tab list + `PerfilForm`, owns the Google-outcome
  message region (empty until PR #2 wires it). [WCFG-02]
  (Google-outcome region shipped as a single always-mounted `aria-live="polite"` `<p>`,
  `data-testid="aviso-google"`, no content wired — PR #2 (task 6.1) decides whether it needs to become
  a two-tone pair like `PerfilForm`'s regions once the `?google=error` case is wired in.)
- [x] 4.11 Wire `configuracion.tsx`'s component to render `ConfiguracionPage`, replacing PR #1a's
  placeholder. Verify: `pnpm web typecheck && pnpm web test && pnpm web lint`. [WCFG-13]
- [x] 4.12 RED+GREEN: `PerfilForm` proactive demo gate — closes a design §Q9c verification-matrix
  requirement the original 4.x breakdown omitted (4.9 only wired the reactive `403
  DEMO_SOLO_LECTURA` mapping). `mensajes.ts` exports `MENSAJE_DEMO_SOLO_LECTURA` (single source for
  both halves, `dry`); `PerfilForm` disables the four `CampoTexto` and `Guardar cambios` when
  `me.esDemo`, and renders a `role="note"` element carrying that same string only in that case.
  [design Q9c]

**PR #1b status (2026-08-13): tasks 4.1-4.12 complete. `pnpm web typecheck && pnpm web test && pnpm
web lint` all green (72 test files, 658 tests, 0 lint errors — same 2 pre-existing app-wide
jsx-a11y warnings as PR #1a's baseline, unrelated to this change). Confirmed zero diffs under
`apps/api/**` and `apps/mobile/**`. `ApiError`'s `'server'` tag widened with an optional `code?:
string` field in `client.ts` (additive, non-breaking) so `perfil.ts`/`mensajes.ts` can carry
`aPerfilHttpError`'s body `code` through to the closed copy table — this is the one production file
outside `openspec/changes/us-042-web-configuracion-perfil/` and `apps/web/src/{api,components/
configuracion,routes/_authenticated}/` touched by this batch.

**judgment-day fix iteration 2 (2026-08-13): `PerfilForm`'s password fields are now grouped under a
`<fieldset>`/`<legend>Cambiar password</legend>` (WCFG-02's third-block label, verbatim) with a
`role=group` regression test; `use-guardar-perfil.test.tsx` gained a regression test that mounts an
active `useMe()` observer alongside the save flow with a manually-deferred `/api/auth/me` and pins
`mutation.isPending` staying `true` until that refetch resolves (empirically verified to fail when
the `return` on `invalidateQueries` is removed, and pass with it restored); the row-10-labeled test
at `use-guardar-perfil.test.tsx` was retitled to row 6 (assertions unchanged — they were already
correct for row 6); `mensajes.test.ts` gained the missing `unauthorized` row (`''`) in the `it.each`
table. Test count: 655 → 658 (72 files, 0 lint errors, same 2 pre-existing warnings).**

---

## PR #2 — Google section and layout (base: PR #1b's branch)

- [ ] 5.1 RED+GREEN: `src/api/perfil.ts` gains `postVincularGoogle`/`postDesvincularGoogle`
  (+ test), mapping `403 VINCULO_REQUIERE_PASSWORD` too.
- [ ] 5.2 Add two literal-hex tokens to `src/index.css`: `--color-vinculo-activo` /
  `-foreground` (`#d1fae5` / `#065f46`), **literal**, never `var(--color-ingreso)` — an alias-by-
  reference would make the income card the source of truth for a security-state color. Record the
  inherited 6.78:1 AA ratio in this task. [design Q11]
- [ ] 5.3 RED+GREEN: `src/components/configuracion/ConfirmarPasswordDialog.tsx` (+test) —
  `role="alertdialog"`, `aria-modal="false"` **explicit** (no focus trap ⇒ `"true"` would lie to
  assistive tech), focus moves to the **password input** on open (deliberate divergence from
  `EliminarIngestaControl`'s `Confirmar`-focus, because this dialog's first required action is
  typing), focus restores to the trigger unconditionally on Escape/Cancel/success, `aria-describedby`
  wired to the leaving-the-app warning paragraph (`aria-labelledby`+`aria-describedby`, not
  `aria-label`, so the warning is announced), inline `role="alert"` error, `Confirmar` disabled while
  pending but the password input stays enabled. [WCFG-08, WCFG-12, design Q7c]
- [ ] 5.4 RED+GREEN: `src/api/use-google-vinculo.test.ts` then `.ts` — link mutation calls
  `window.location.assign(urlAutorizacion)` (a **method**, not `location.href =`, so it is spy-able
  under jsdom); unlink mutation invalidates `['auth-me']` on success and announces
  `Desvinculaste tu cuenta de Google.`
- [ ] 5.5 RED+GREEN: `src/components/configuracion/GoogleVinculoSection.tsx` (+test) — linked
  (green pill `Vinculada: {me.email}` + `Desvincular`) and not-linked (neutral pill `No vinculada` +
  `Vincular con Google`) states, structurally symmetric. When `me.email === null`, render `Vinculada`
  with no colon/address — not a dangling `Vinculada: `. [WCFG-02]
- [ ] 5.6 Wire `GoogleVinculoSection` into `ConfiguracionPage.tsx`'s third block.
- [ ] 6.1 RED+GREEN: extend `configuracion.tsx`'s mount effect — capture `google` into local state on
  first render, `navigate({ to: '/configuracion', search: {}, replace: true })`, message survives the
  rewrite, does not reappear on refresh/back, unknown values render nothing. Opening a Google dialog
  clears `avisoGoogle` (the one coordination rule between the two message regions). [WCFG-10, design
  Q6b, Q1c]
- [ ] 6.2 Pin the test: landing on `?google=vinculado` still fetches `/api/auth/me` **exactly once**
  — no manual refetch added. [WCFG-03, WCFG-10, design Q6c]
- [ ] 6.3 Implement the fluid T1 grid in `ConfiguracionPage.tsx` (`max-w-*` + fixed-first-track
  `grid`) reproducing T1's measured proportions with **no** new `layout.ts` constant; below `lg` the
  two columns stack (heading+tabs above panel). [WCFG-11]
- [ ] 6.4 Full-suite verify: `pnpm web typecheck && pnpm web test && pnpm web lint`. Confirm zero
  diffs under `apps/api/**` and `apps/mobile/**`. [WCFG-13]
