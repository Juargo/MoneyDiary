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

## Gates

- [x] `pnpm web typecheck` — green
- [x] `pnpm web test` — green, **654/654** (72 files, +72 tests over PR #1a's 582)
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
