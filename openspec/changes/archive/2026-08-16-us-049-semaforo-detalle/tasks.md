# Tasks: US-049 — Semáforo Detail Page

> Ordered implementation checklist for `design.md` (2-round adversarial judgment:
> APPROVED — decisions are NOT reopened here). Strict TDD is active (backend
> runner: Vitest/Oxc; web runner: Vitest/jsdom + Playwright). Order follows
> design §0/§5: **domain bands → domain arithmetic → domain copy+assembly →
> application → infrastructure+contract → web data layer → web UI → closing.**
> Backend lands first and stays dark (no consumer) until the web slice —
> the US-045 cross-workspace lesson applies at Phase 5: DTO, Zod schema,
> `openapi-document.ts`, route, `container.ts`, regenerated `openapi.json` +
> `types.gen.ts` + `api-client` alias + web type re-export land in ONE PR.
>
> Legend: `[P]` = parallel-safe with sibling `[P]` tasks (no file overlap).
> Unmarked tasks are sequential.

---

## Phase 8 — Closing tasks

Depends on all prior phases landing (on `main`, per whichever chain strategy
the user selects — see forecast above).

- [x] **T8.1** Post the issue **#382** closure comment: `SemaforoBadge`
      adopted as the static header badge in `SemaforoDetallePage.tsx`
      (T7.4) — link the PR that ships WSEM-01. Close #382. ✓ done at archive, 2026-08-16
- [x] **T8.2 (Ledger reconciliation)** Confirm the actual test count
      matches design §3's ledger: 131 backend (5+102+6+5+2+1+5+5 per suite)
      + 48 web (11+2+12+5+14+2+2) = 179 new cases, plus 39 backend +
      unchanged and 1 web case rewritten (not net-new). If any suite's
      actual count diverges, note the delta here before archiving — do not
      silently let the ledger go stale.
- [x] **T8.3 (Spec Purpose-prose reminders for archive — do NOT skip)** ✓ done at archive, 2026-08-16
      When this change archives:
      - `openspec/specs/user-data-isolation/spec.md` Purpose section: "4
        data-bearing endpoints" → "5 data-bearing endpoints", listing
        `resumen/semaforo` alongside `resumen`, `movimientos`,
        `detalle-bucket`, `ingesta` (delta's own migration note — the
        delta cannot MODIFY prose directly, only the merge step can).
      - `openspec/specs/web-app/spec.md` ~line 1440, the
        `WG5-07`/`WG5-08`/`WG5-09` cross-reference summary row: the
        `/semaforo` stub mention becomes stale once `WG5-09` is removed
        and `WSEM-01..08` ship — replace it with a reference to the
        shipped `WSEM-*` page, or split the row so `WG5-07`/`WG5-08` keep
        their own text and the `WG5-09` stub clause drops.
      - This is NOT satisfied by merging the requirement blocks alone —
        both prose updates are separate edits the archive step must make.
- [x] **T8.4** Final full-repo gate sweep: `pnpm test` (all workspaces) ·
      `pnpm build` (all workspaces) · `pnpm api-client exec tsc --noEmit` ·
      confirm `apps/mobile` has zero references to any new semáforo symbol
      (design §4 — zero mobile impact, out of scope) · confirm no Prisma
      migration was introduced. ✓ done at archive, 2026-08-16

This is the archive version with Phase 8 tasks checked at 2026-08-16.
