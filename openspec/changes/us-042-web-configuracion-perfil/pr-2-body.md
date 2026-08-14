# PR #2 — Google section and layout

Part of #276 (US-042). **Does not close it** — this is PR 3 of 3 in a chain; the tracker branch
closes the issue once all three are integrated.

**Change**: `us-042-web-configuracion-perfil` · **Chain**: feature-branch-chain, targets
`feat/us-042-pr1b-perfil-form` (PR #1b's branch) · **PR 3 of 3** (`#1a` → `#1b` → `#2`, each
targeting the previous branch)

## Dependency diagram

```
feat/us-042-web-configuracion-perfil (tracker, draft/no-merge)
  └── PR #1a — infra, identity guard, entry points
        └── PR #1b — perfil form (size:exception)
              └── 📍 PR #2 — Google section + layout   (this PR)
```

## ⚠️ Budget flag — decision needed before this PR is opened

**This PR was forecast at ~450-550 changed lines with NO `size:exception` pre-granted** (the tasks.md
guard decision only approved one for PR #1b — see its `pr-1b-body.md`). Actual, measured against the
base branch:

```
git diff --shortstat feat/us-042-pr1b-perfil-form...HEAD -- apps/web
16 files changed, 1525 insertions(+), 56 deletions(-)   # 1581 total changed lines
```

That is **~3.5x the 400-line budget** and roughly **3x the original forecast**. Breakdown: ~605
non-test lines (implementation) vs. ~920 test lines — the same verbose, decision-carrying docblock
convention already established and exception-approved in PR #1a/#1b, applied consistently here too.

**No further split is sanctioned by design.** §10's own ordering already treats "Google link/unlink +
layout" as the smallest coherent PR #2 unit; splitting `GoogleVinculoSection` from
`ConfirmarPasswordDialog`/`use-google-vinculo.ts` across PRs would ship a visible button with no
working confirmation flow behind it — the same "half-wired feature is worse than a large diff"
reasoning PR #1b's exception already rests on.

**Resolved (2026-08-13): accepted as a second documented `size:exception`.** Recorded in `tasks.md`
under "Second guard decision". Splitting was evaluated with a measurement, not an assertion: the only
natural seam (Google section vs `?google=` + layout) yields ~1150 / ~430, leaving the big half still
~3x over — so the split buys nothing and would ship a dialog nothing invokes.

The forecast was wrong on **all three** slices of this change, always in the same direction — PR #1a
1.7x, PR #1b 1.9x, PR #2 3.1x. That is a systematic bias in the `tasks` phase, not three unlucky
slices: it sized production code while Strict TDD obliges a test suite running ~1.4x that. Recorded in
`tasks.md` so the next TDD-strict change forecasts tests explicitly.

## Judgment Day — APPROVED ✅ (3 rounds, 2 CRITICALs, 2 fix iterations)

Two blind adversarial reviewers. Round 3 closed with **zero CRITICAL and zero real WARNING** from
both. This slice was the hardest of the three; the process earned its cost here:

**Round 1 — CRITICAL, found independently by both judges.** Landing on `/configuracion?google=vinculado`
fetched `/api/auth/me` **twice**, violating `WCFG-03`'s exactly-once MUST, on 100% of Google round
trips — against an API whose free-tier cold start has been measured at 73s. The task-6.2 test that
claimed to pin the invariant used bare `router.load()` and never mounted the component whose effect
caused the second fetch, so it **could not fail**. It shipped carrying an 11-line comment arguing that
scope was correct.

**Round 2 — a WORSE CRITICAL, introduced by the round-1 fix, again found by both judges.** The fix had
rewired `beforeLoad` to `queryClient.ensureQueryData(...)`. But `ensureQueryData` does not revalidate a
stale-but-present entry without `revalidateIfStale`, and `beforeLoad`'s unconditional `setQueryData`
re-stamps `dataUpdatedAt` on every run — so once `['auth-me']` was populated, **the session guard never
validated again for the rest of the SPA session**. It had also silently inherited the app's retry
policy: 3 retries with ~7s backoff on a security boundary, invisible to the suite because every test
`QueryClient` hardcodes `retry: false`. Reverted.

**Round 3 — the narrow fix, cleared.** `beforeLoad` is back to raw `fetchMe()`; the double fetch is
solved by a purpose-built one-tick guard (`lib/skip-next-auth-refetch.ts`) armed at exactly one call
site immediately before the synthetic `router.history.replace`, consumed as `beforeLoad`'s first
statement, falling through to a real `requireSession` on cache miss. **93+/36- across 4 files**, versus
the ~2000-line blast radius of the approach it replaced. Both judges traced
`@tanstack/router-core@1.171.13` / `@tanstack/history@1.162.0` to prove arm and consume execute in one
synchronous JS turn, leaving no window for an interleaved navigation to steal the flag.

Two leads investigated and **rejected with evidence**, so nobody re-attempts them:
- `router.history.replace()` / `window.history.replaceState` do **not** avoid the re-run — the router
  intercepts both. There is no public API that changes the URL without re-running `beforeLoad`.
- `beforeLoad`'s `cause` (`'enter' | 'stay'`) cannot discriminate: under a pathless layout route it is
  `'stay'` for every navigation after the first, genuine ones included.

Both invariants are now pinned by **two separate, non-redundant tests** — reintroducing the round-2 bug
makes the companion test fail while the task-6.2 pin still passes, which is exactly why both must exist.

**Registered debt** (both judges raised it independently, deliberately deferred): carry the skip intent
in history state — `router.history.replace(path, { skipAuthRefetch: true })` read as `location.state` —
so the invariant becomes structural rather than an emergent property of synchronous execution. Full
rationale in `tasks.md` under task 6.2.

## Summary

Google link/unlink end to end — CA-02's third block, CA-04, WCFG-02/08/10/11/12:

- **`src/api/perfil.ts`** — `postVincularGoogle`/`postDesvincularGoogle`, same never-throw
  `ApiResult<T>` discipline, `403 VINCULO_REQUIERE_PASSWORD` mapped alongside the existing eight-code
  table. The PATCH-only fetch/error-mapping helper was generalized into `enviarMutacion(url, method,
  body)`, shared by PATCH and POST, so the two new endpoints don't re-duplicate the network/401/
  error-code mapping a third time.
- **`src/index.css`** — two literal-hex tokens, `--color-vinculo-activo`/`-foreground` (`#d1fae5`/
  `#065f46`), the SAME verified AA pair as `--color-ingreso` (6.78:1) but never aliased by
  `var(...)` — an alias-by-reference would make the income card the source of truth for a
  security-state color.
- **`src/components/configuracion/ConfirmarPasswordDialog.tsx`** — the hand-rolled, password-gated
  `role="alertdialog"` shared by link and unlink (it doesn't know which). `aria-modal="false"`
  explicit (no focus trap), focus lands on the password input on open, focus restores to the trigger
  unconditionally on Escape/Cancel, `aria-describedby` wires the leaving-the-app warning so it's
  actually announced.
- **`src/api/use-google-vinculo.ts`** — `useVincularGoogle` navigates via
  `window.location.assign(urlAutorizacion)` on success (a method call, not `location.href = ...`, so
  jsdom can spy on it); `useDesvincularGoogle` invalidates `['auth-me']` on success.
- **`src/components/configuracion/GoogleVinculoSection.tsx`** — the two structurally symmetric
  states (linked: green pill `Vinculada: {email}` + `Desvincular`; not-linked: neutral pill `No
  vinculada` + `Vincular con Google`), wired into `ConfiguracionPage`'s third block. Proactive demo
  gate (disabled button + shared `role="note"`) alongside the defensive `403 DEMO_SOLO_LECTURA`
  mapping.
- **`src/routes/_authenticated/configuracion.tsx`** — now `ConfiguracionRoute`, a thin wrapper that
  captures `?google=` into local state on first render (before the cleanup effect strips the URL via
  `replace: true`), so the message survives the rewrite and never reappears on refresh/back.
- **`src/components/configuracion/ConfiguracionPage.tsx`** — the fluid T1 grid (`max-w-*` + a
  fixed-first-track `grid`, only the shell's existing `lg` breakpoint, no new `layout.ts` constant);
  below `lg` heading+tabs stack above the panel.

## Apply-time deviations from the task list (recorded, not scope creep)

1. **`enviarPatch` generalized into `enviarMutacion`** (task 5.1) — not itself a task line item, but
   the natural way to add two POST endpoints without duplicating the shared network/401/error-code
   logic a third time (`dry`).
2. **`jsx-a11y/no-noninteractive-element-interactions` false-positives on `role="alertdialog"` +
   `onKeyDown`** (task 5.3) — its ARIA superclass chain is `window > dialog`, not `widget`, so the
   plugin never recognizes it as interactive, contrary to design §1/Q7b's table entry. Resolved with
   a scoped `eslint-disable-next-line` carrying the investigated reason — the config itself is
   untouched, and `EliminarIngestaControl`'s existing unscoped instance of the exact same shape only
   warns today because it's outside the scoped directory.
3. **`CampoTexto` gained optional `forwardRef` support** (task 5.3) — backward-compatible; lets the
   dialog reuse it for its own password field instead of a second labelled-input implementation.
4. **jsdom's `window.location.assign` is non-configurable** (task 5.4) — `vi.spyOn` throws; worked
   around with the standard `Object.defineProperty(window, 'location', { value: {...}, writable:
   true, configurable: true })` technique.
5. **A copy gap in `mensajes.ts`** (task 5.5): VINC041-07 maps a wrong `passwordActual` on link/unlink
   to the same `403 PERFIL_RECHAZADO` code `perfil-usuario` uses, but design §1/Q8b's table only rows
   the `perfil`/`password` origins for that code — the `perfil` row's copy references an email field
   this dialog never shows. Added a third `origen === 'google'` line: *"No se pudo completar la
   acción. Revisa tu password actual."*
6. **The demo proactive gate for `GoogleVinculoSection`** (task 5.5) — proposal §6/WCFG-07 requires
   `Vincular con Google`/`Desvincular` disabled for demo accounts too, alongside `Guardar cambios`;
   not spelled out as its own task sub-step but required by the spec's demo requirement family.
7. **CORRECTED (judgment-day, PR #2 fix batch) — original point 7 was wrong, see below.** The original
   claim was: "TanStack Router's `beforeLoad` re-runs on every internal navigation — the URL-cleanup
   `navigate({replace:true})` naturally triggers a second `/api/auth/me` fetch... pre-existing,
   accepted baseline behavior... not a regression." Both blind reviewers reproduced the real defect:
   landing on `/configuracion?google=vinculado` with `ConfiguracionRoute` actually mounted fetched
   `/api/auth/me` **twice**, 100% of the time — a real regression this PR's own cleanup effect
   introduced, on an API that runs on Render's free tier (cold starts measured at 73s). The original
   pin test couldn't catch it: it called `router.load()` directly without ever mounting
   `ConfiguracionRoute` via `RouterProvider`, so the cleanup effect it claimed to cover never ran.
   **Fix, two parts:** (a) `configuracion.tsx`'s cleanup effect now calls `router.history.replace(...)`
   instead of `navigate(...)`; (b) `routes/_authenticated.tsx`'s `beforeLoad` now reads `['auth-me']`
   through `context.queryClient.ensureQueryData(meQueryOptions())` instead of a raw, always-fetching
   `fetchMe()` — this is the load-bearing half: TanStack Router's `Transitioner` re-runs `beforeLoad`
   on ANY URL rewrite regardless of which API performs it (confirmed against `router-core` source and
   by mutation testing), so making the SECOND `beforeLoad` run a cache hit is what actually fixes the
   count, not the choice of rewrite API. The pin test now mounts `ConfiguracionRoute` through the real
   `RouterProvider` and was mutation-verified: reverting (b) alone reproduces the 2-call failure.
8. **`tag: 'unauthorized'` was silently a dead end in `GoogleVinculoSection`** (task 5.5, corrected in
   judgment-day) — WCFG-09's copy table is not scoped to `PerfilForm`; the point-5 note above claiming
   this was "scoped out... not required by design" was wrong. Fixed: `confirmar` now passes an
   `onError` mutation callback that navigates to `/login` on that tag, mirroring `PerfilForm`.
9. **The linked pill was missing the check icon design.md Q11 commits to** (task 5.5, corrected in
   judgment-day) — "the linked pill also has a check icon and the word `Vinculada`... meaning survives
   without colour (WCAG 1.4.1)." Added a `lucide-react` `Check`, `aria-hidden` (decorative — the
   adjacent text already names the state).

## Gates

- [x] `pnpm web typecheck` — green
- [x] `pnpm web test` — green, **706/706** (76 files; 700 at original apply-time, +6 across the two
      judgment-day fix batches: the unauthorized→/login tests ×2, the check-icon test, the control-case
      fetch-count test, the Q6b DOM-level integration test, and the "genuine navigation still refetches
      identity" companion pin added in round 3)
- [x] `pnpm web lint` — green, 0 errors, 2 warnings (identical pre-existing
      `no-noninteractive-element-interactions` findings from PR #1a's baseline — untouched by this
      PR)
- [x] Zero diffs under `apps/api/**` and `apps/mobile/**`

## Out of scope (this PR)

- Categorías real content — US-043.
- Mobile — US-044.
- Any `apps/api` change — both contracts (`perfil-usuario`, `vinculacion-google`) are already
  deployed and canonical.

## Rollback

`git revert` + redeploy. No migration, no server state, no deploy-ordering constraint (that one is
PR #1a's `esMeDto` hardening, already merged/in review).
