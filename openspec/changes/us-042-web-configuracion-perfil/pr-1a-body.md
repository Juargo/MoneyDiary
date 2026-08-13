# PR #1a — Infrastructure, identity guard, entry points

Part of #276 (US-042). **Does not close it** — this is PR 1 of 3 in a chain; the tracker branch
closes the issue once all three are integrated.

**Change**: `us-042-web-configuracion-perfil` · **Chain**: feature-branch-chain, targets
`feat/us-042-web-configuracion-perfil` (tracker, draft/no-merge) · **PR 1 of 3**
(`#1a` → `#1b` → `#2`, each targeting the previous branch)

## Dependency diagram

```
feat/us-042-web-configuracion-perfil (tracker, draft/no-merge)
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

## Pre-flight status (task 0.1) — ✅ PASS

Run by the maintainer from the browser console against **production** (`https://app.moneydiary.cl`)
with a real session, 2026-08-13:

| Field | Observed |
|-------|----------|
| `location.origin` | `https://app.moneydiary.cl` |
| `status` | **`200`** |
| `content-type` | `application/json; charset=utf-8` |
| body | `{"userId":"usuario-fijo-moneydiary","nombre":"Preflight",…}` |

Both failure modes are affirmatively excluded: not `405`/`501`/`502`, and the response is JSON rather
than `text/html` (which would have meant the SPA shell answered and the request never reached the
API). `nombre` echoes back the value sent. **Vercel's platform layer forwards `PATCH` to the API** —
§Q5b's fallback ladder is not needed, and `X-HTTP-Method-Override` stays rejected.

Run against production rather than a branch preview because `apps/web/api/proxy.ts` and `vercel.json`
are untouched by this change, so production exercises the identical platform path.

## Judgment Day — APPROVED ✅

Two blind adversarial reviewers, two rounds. Round 1 confirmed two `WARNING (real)` findings, both
fixed and re-judged clean in round 2 (zero CRITICAL, zero real WARNING).

| Finding | Fix |
|---|---|
| The app-wide `jsx-a11y` severity derivation used `Object.keys(...).map(r => [r, 'warn'])`, which turned on the 3 rules the plugin ships as `'off'` and discarded the options on 7 tuple-valued rules — producing 6 warnings in files this PR never touches | `73d8ccd` — switched to `Object.entries(...)`, preserving `'off'` and re-attaching each tuple's options |
| `configuracion.tsx`'s `validateSearch` had no direct test, unlike `/login`'s equivalent `?error=` narrowing | `29f2bbd` — added `src/test/configuracion-validate-search.test.tsx`, mutation-verified to fail against a pass-through implementation |
| `design.md` §Q7a still showed the buggy derivation verbatim — a future reader copying the binding artifact would have reintroduced the bug | `fefea84` — sample corrected, with a note pointing at `eslint.config.js` as source of truth |

Both tiers verified empirically with `eslint --print-config`, not by reading the config: route file →
31 error / 0 warn / 3 off; untouched component → 0 error / 31 warn / 3 off, with `label-has-for` at
`[0]` and `no-noninteractive-element-interactions` at `[1, {handlers…}]`.

## Gates

- [x] `pnpm web typecheck` — green (adds a new route file; `tsr generate` regenerates the tree)
- [x] `pnpm web test` — green, **582/582** (65 files)
- [x] `pnpm web lint` — green, 0 errors, 2 warnings. Both are legitimate
      `no-noninteractive-element-interactions` findings in components this PR does not touch, surfaced
      by the new `warn` tier and deliberately not silenced — the start of the ADR-018 burn-down.
- [x] Zero diffs under `apps/api/**` and `apps/mobile/**`
- [x] Task 0.1 pre-flight recorded — `200`, see above

## Out of scope (this PR)

- The Perfil form, sequential save orchestration, error/copy table — PR #1b.
- The Google section, link/unlink dialogs, `?google=` message wiring, the fluid T1 layout — PR #2.
- Any `apps/api` change — both contracts (`perfil-usuario`, `vinculacion-google`) are already
  deployed and canonical.

## Rollback

`git revert` + redeploy. No migration, no server state. See the deploy-ordering constraint above for
the one real trap.
