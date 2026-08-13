# PR #1a — Infrastructure, identity guard, entry points

**Change**: `us-042-web-configuracion-perfil` · **Chain**: feature-branch-chain, targets
`feature/us-042-web-configuracion-perfil` (tracker, draft/no-merge) · **PR 1 of 3**
(`#1a` → `#1b` → `#2`, each targeting the previous branch)

## Dependency diagram

```
feature/us-042-web-configuracion-perfil (tracker, draft/no-merge)
  └── 📍 PR #1a — infra, identity guard, entry points   (this PR)
        └── PR #1b — perfil form (size:exception, see tasks.md guard decision 2026-08-13)
              └── PR #2 — Google section + layout
```

## Summary

Lays the foundation the rest of `us-042` builds on, with **zero visible product surface**:

- `useMe()` query hook (`['auth-me']`) + priming, so identity is fetched exactly once per visit
  (`_authenticated.tsx`'s `beforeLoad` primes the cache; `useMe()` reads it fresh under the shared
  30s `staleTime`).
- `esMeDto` hardened to **reject** (never default) a payload missing or mistyping `nombre` /
  `googleVinculado` — both required in the generated `MeDto` contract, both previously unchecked.
- `/configuracion` route (session-protected for free by `_authenticated`), wired into both nav entry
  points (`Configuración` sidebar/bottom-tab link + a new sidebar-footer icon link). Thin placeholder
  component — no form, no Google section yet (those land in PR #1b/#2).
- `eslint-plugin-jsx-a11y` installed, scoped `error` on `src/components/configuracion/**` + the route
  file, `warn` app-wide (starts the ADR-018 burn-down without absorbing the app's existing debt).

## ⚠️ Deploy-ordering constraint — read before any `apps/api` rollback

**Hardening `esMeDto` to reject a payload missing `nombre`/`googleVinculado` creates a rollback
ordering constraint that nothing in the toolchain enforces:**

`lib/require-session.ts` maps **any** non-ok `fetchMe()` result — including `{ tag: 'parse' }` — to a
redirect to `/login`, with no discrimination by `error.tag`. Forward deploys are order-free (the API
already sends both fields, deployed since US-040/US-041). But **an API rollback past US-040/US-041
while this web build is live produces an app-wide lockout**: every `_authenticated` route bounces to
`/login`, the user logs in successfully, and is bounced straight back — with no client-side recovery
and no error message, for every user.

**Rule: an API rollback past US-040/US-041 must revert this web hardening first or in the same
window, never API-first.**

`apps/api` (Render) and `apps/web` (Vercel) deploy independently via git integration from `main`
(ADR-030) — there is no coupling that could refuse the wrong order. This sentence is the mitigation:
documentation in front of whoever presses revert.

## Pre-flight status (task 0.1)

**Not yet run — this is a required gate before merge, not before opening this PR as a draft.** The
`PATCH /api/perfil` proxy pre-flight (design.md §Q5a) needs a real browser session on a Vercel
preview deployment of this branch and cannot be automated from an apply session. Record the observed
status code in `tasks.md` task 0.1 before merging. Pass = `200` with the updated `nombre` echoed. A
platform-layer refusal blocks the change — escalate, do not add `X-HTTP-Method-Override`.

(Note: the underlying risk is independently downgraded to Low/High by design.md §Q5 — `PATCH` already
flows through the same proxy mechanism as the shipped `postReclasificarCategoria`, method-agnostic by
construction. The pre-flight remains required as a cheap, two-minute confirmation.)

## Gates

- [x] `pnpm web typecheck` — green (adds a new route file; `tsr generate` regenerates the tree)
- [x] `pnpm web test` — green, 576/576
- [x] `pnpm web lint` — green, 0 errors (6 pre-existing app-wide `jsx-a11y` warnings, unrelated to
      this change — the burn-down PR #1a's `warn` tier now enables)
- [x] Zero diffs under `apps/api/**` and `apps/mobile/**`
- [ ] Task 0.1 pre-flight recorded (user-gated, see above)

## Out of scope (this PR)

- The Perfil form, sequential save orchestration, error/copy table — PR #1b.
- The Google section, link/unlink dialogs, `?google=` message wiring, the fluid T1 layout — PR #2.
- Any `apps/api` change — both contracts (`perfil-usuario`, `vinculacion-google`) are already
  deployed and canonical.

## Rollback

`git revert` + redeploy. No migration, no server state. See the deploy-ordering constraint above for
the one real trap.
