# PR #1b — Perfil form

Part of #276 (US-042). **Does not close it** — this is PR 2 of 3 in a chain; the tracker branch
closes the issue once all three are integrated.

**Change**: `us-042-web-configuracion-perfil` · **Chain**: feature-branch-chain, targets
`feat/us-042-pr1a-infra` (PR #1a's branch) · **PR 2 of 3** (`#1a` → `#1b` → `#2`, each targeting the
previous branch)

## Dependency diagram

```
feat/us-042-web-configuracion-perfil (tracker, draft/no-merge)
  └── PR #1a — infra, identity guard, entry points
        └── 📍 PR #1b — perfil form (size:exception)   (this PR)
              └── PR #2 — Google section + layout
```

## `size:exception` — read before reviewing

**This PR is accepted at ~1950 changed lines, well over the 400-line review budget, as a documented
`size:exception`.** See `openspec/changes/us-042-web-configuracion-perfil/tasks.md`, the **"Guard
decision (2026-08-13)"** block right above the PR #1b task list:

> **Guard decision (2026-08-13): option (a) accepted.** PR #1b ships as a documented `size:exception`
> slice inside the chain. Rationale: design §10 prohibits splitting `use-guardar-perfil.ts` from
> `PerfilForm.tsx`, so the only alternative to a large diff is a half-wired sequential save. PR #1b's
> description must carry the `size:exception` label and cite this line. PR #1a and PR #2 stay within
> the normal 400-line budget and get no exception.

In plain words: the sequential profile+password save (task 4.6-4.9 — `use-guardar-perfil.ts` +
`PerfilForm.tsx` + `mensajes.ts`) is one indivisible unit of correctness. Shipping the profile call
without the password call's abort rule, or vice versa, would be a page that silently does less than
its button says — worse than a large diff. No further split was sanctioned by design.

## Summary

The Perfil form end to end — CA-01/CA-02's first two blocks, CA-03, CA-05:

- **`src/api/perfil.ts`** — `patchPerfil`/`patchPassword`, never-throw `ApiResult<void>`, `403`/`400`/
  `409`/`503` mapped to `{ tag: 'server', status, code }` (widened `ApiError`, additive).
- **`src/components/configuracion/mensajes.ts`** — the closed, verbatim copy table (spec WCFG-09):
  eight documented API error codes + the local `sin-cambios`/`falta-password-actual` gates + the
  five-outcome `ResultadoGuardado` union, all closed with a compile-time `never` guard. No server
  string is ever rendered.
- **`src/api/use-guardar-perfil.ts`** — the orchestration: `Guardar cambios` sends `PATCH /api/perfil`
  before `PATCH /api/perfil/password`, in that physical order, and aborts the password call the moment
  the profile call fails (protects against silently rotating the password when an email-taken
  rejection looks identical to a wrong-password rejection, PERF040-04). Change detection reads
  `nombre`/`email` straight from the `['auth-me']` query cache at submit time — never a mount-time
  snapshot — which is what makes a retry after a partial failure send only what's still outstanding,
  with no explicit reset code.
- **`src/components/configuracion/{CampoTexto,ConfiguracionTabs,PerfilForm,ConfiguracionPage}.tsx`** —
  the visible page: four labeled fields, `Guardar cambios` disabled while pending, two always-mounted
  message regions (`aria-live="polite"` + `role="alert"`, never one shared region), `Password actual`
  gains native `required` the instant `Email` is dirty. `PerfilForm` also gates proactively on
  `me.esDemo`: the four fields and the submit button become `disabled`, and a `role="note"` element
  carries `mensajes.ts`'s exported `MENSAJE_DEMO_SOLO_LECTURA` — the same string the reactive `403
  DEMO_SOLO_LECTURA` mapping already used, now a single source (design §Q9c, task 4.12).
- **`configuracion.tsx`** now renders `ConfiguracionPage`, replacing PR #1a's placeholder heading.

## Apply-time deviations from the task list (recorded, not scope creep)

1. **`use-guardar-perfil.ts`'s `ResultadoGuardado`/`DraftPerfil` types were declared before
   `mensajes.ts` (task 4.3)**, ahead of the `guardar`/`useGuardarPerfil` implementation (task 4.7) —
   `mensajeDeResultado`'s signature needs the type. Same type-first sequencing design.md D-07 already
   uses elsewhere in this change; not a scope change.
2. **`PerfilForm` intercepts `error.tag === 'unauthorized'` and navigates to `/login`** without
   rendering any message — the WCFG-09 copy table's last row, not spelled out as its own task
   sub-step but required by the spec.
3. **The Google-outcome placeholder region (task 4.10) ships as a single always-mounted
   `aria-live="polite"` element**, not a two-region pair — PR #2 (task 6.1) decides whether it needs
   to become symmetric with `PerfilForm`'s regions once `?google=error` is wired in.
4. **Task 4.12 (added after the initial 4.1-4.11 batch)**: design §Q9c's verification matrix
   required a proactive demo gate (`disabled` controls + `role="note"`) that the original 4.x
   breakdown never listed as a sub-step — only the reactive `403 DEMO_SOLO_LECTURA` message mapping
   was covered. Closed in this same PR: `MENSAJE_DEMO_SOLO_LECTURA` extracted as a shared exported
   constant in `mensajes.ts`, wired into `PerfilForm` behind `me.esDemo`.

## Judgment Day — APPROVED ✅ (3 rounds, 2 fix iterations)

Two blind adversarial reviewers. Round 3 closed with **zero CRITICAL and zero real WARNING** from
both. What the process actually caught, in order:

| Round | Finding | Fix |
|---|---|---|
| 1 | `onSuccess` fired `invalidateQueries` without returning it. `Mutation.execute()` awaits `onSuccess` before dispatching success, so `Guardar cambios` re-enabled **before** the identity refetch landed — a fast second submit would read a stale pre-save `me` and re-derive already-applied changes | `9e8902c` |
| 1 | Both message regions rendered lines as adjacent inline `<span>`s. The two-line partial-failure message — *"Se guardaron tus datos, pero no se pudo cambiar la password."* + the password error — ran together as one blob | `34370d7` |
| 1 | `ConfiguracionPage.test.tsx` built its `QueryClient` without `QUERY_CLIENT_DEFAULTS`, inheriting `staleTime: 0`, so it made a real unstubbed network call that passed only because `fetchMe()` swallows failures | `4719b45` |
| 2 | **The round-1 invalidation fix had zero regression coverage** — a reviewer removed the `return` and all 73 tests still passed. Nothing mounted a live `useMe()` observer, so `invalidateQueries` never had a query to refetch | `6419e66` |
| 2 | **Spec conformance gap**: `WCFG-02` names `Cambiar password` as one of three divided blocks; the string existed nowhere in the codebase — the password fields were separated only by a Tailwind gap | `6419e66` |

The invalidation regression test was mutation-verified three times independently (both judges plus
the orchestrator): with the `return` removed it fails deterministically; restored, the suite is green.
A test that passes with the bug reintroduced is not a regression test.

Remaining as INFO, not fixed: two `(Q1c)` citations in `PerfilForm.tsx`/`PerfilForm.test.tsx` that
should read `(Q2b)`, and `mensajeDeApiError` lacking the `const _exhaustive: never` guard its sibling
`mensajeDeResultado` has (`noImplicitReturns` is off, so a future `ApiError` tag would silently return
`undefined` rather than fail the build).

**Product decision, resolved by the maintainer (2026-08-13): `passwordActual` is now cleared on any
`ok` result.** Two judges raised it across two rounds and `design.md` Q2c was silent on the sub-case,
so it was held open rather than settled by a fix agent. Decision: `Password actual` authorizes the
email change (Q1c); once the save succeeds its purpose is spent, and keeping the typed credential in
component state and in the DOM is retention with no function.

The clearing condition went from `r.tipo === 'ok' && r.passwordCambiada` to `r.tipo === 'ok'`.
`passwordNueva` is already empty in that branch — with both password fields filled the result would be
`ok` + `passwordCambiada` or `password-fallo` — so clearing both is equivalent to branching, and
simpler. **Non-`ok` results still clear nothing**: Q2c rows 8/10/11 require the typed password to
survive a partial failure so the retry can send only the password call, and those tests stay green.

Written red-first: the new test (`éxito de email (sin cambio de password)…`) was verified to fail
against the old condition before the one-line change landed.

## Gates

- [x] `pnpm web typecheck` — green
- [x] `pnpm web test` — green, **658/658** (72 files, +76 tests over PR #1a's 582 — includes 3 tests
      from the judgment-day fix iteration 2: the `Cambiar password` fieldset/legend grouping, the
      `mensajes.test.ts` `unauthorized` row, and the `invalidateQueries`-pending regression test)
- [x] `pnpm web lint` — green, 0 errors, 2 warnings (identical pre-existing
      `no-noninteractive-element-interactions` findings from PR #1a's baseline — untouched by this PR)
- [x] Zero diffs under `apps/api/**` and `apps/mobile/**`

## Out of scope (this PR)

- Google link/unlink, `ConfirmarPasswordDialog`, `?google=` handling, the two pill color tokens, the
  fluid T1 grid — PR #2.
- Any `apps/api` change — both contracts (`perfil-usuario`, `vinculacion-google`) are already deployed
  and canonical.

## Rollback

`git revert` + redeploy. No migration, no server state, no deploy-ordering constraint (that one is
PR #1a's `esMeDto` hardening, already merged/in review).
