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

**This was not decided unilaterally during apply.** Per instruction, surfacing it here instead of
silently shipping a third oversized slice. Options for the maintainer:

- **(a)** Accept PR #2 as a second documented `size:exception`, citing the same reasoning as PR #1b's
  (§10 prohibition on splitting a load-bearing unit) plus the doc-density convention this chain has
  already exception-approved once.
- **(b)** Request trimming before merge (e.g., moving some in-source docblock rationale into
  `design.md`/`tasks.md` instead of repeating it per-file) and re-measure.

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
7. **TanStack Router's `beforeLoad` re-runs on every internal navigation** (task 6.2) — the URL-cleanup
   `navigate({replace:true})` naturally triggers a second `/api/auth/me` fetch. Confirmed this is
   pre-existing, accepted baseline behavior (any two-hop navigation between `_authenticated` routes
   already double-fetches identity today), not a regression, and no manual refetch/invalidate was
   added. The 6.2 pin test isolates the landing's own `beforeLoad` with `router.load()` alone (same
   technique as `use-me-priming.test.tsx`) rather than the cumulative count through a full render.

## Gates

- [x] `pnpm web typecheck` — green
- [x] `pnpm web test` — green, **700/700** (76 files, +42 tests over PR #1b's 658)
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
