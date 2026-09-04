## Verification Report

**Change**: web-dashboard-redesign-mobile
**Version**: spec `web-dashboard-shell` (WDS-01..10)
**Mode**: Strict TDD
**Verified against**: `feat/web-redesign-p4-mobile` (tip branch, contains PR1+PR2+PR3+PR4 stacked; diff base `main`)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 34 |
| Tasks complete | 33 |
| Tasks incomplete | 1 (4.3 — explicitly flagged PENDING, human/device manual check; not automatable in jsdom) |

### Build & Tests Execution

**Typecheck**: PASSED
```text
$ pnpm --filter @moneydiary/web exec tsc -b
(no output — clean)
```

**Tests**: PASSED — 355/355 tests, 46/46 files
```text
$ pnpm web test
 Test Files  46 passed (46)
      Tests  355 passed (355)
   Duration  6.62s
```
Matches apply-progress's claimed 355/355. `Not implemented: Window's scrollTo()` lines are pre-existing jsdom noise, not failures.

**Coverage**: not configured for this workspace — ➖ Not available (unchanged from project baseline)

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| WDS-01 (token layer) | Cards use tokens; bucket colors map to palette | `index.css` `:root` remap + `LeyendaGasto.test.tsx`/`DistribucionPie.test.tsx` hex assertions (`#8FA7D1/#B1A7D1/#E6D194`) | ✅ COMPLIANT |
| WDS-02 (responsive nav shell) | Desktop sidebar / mobile bottom tabs | `Sidebar.tsx` (`hidden ... lg:flex`), `BottomTabs.tsx` (`lg:hidden`, `fixed bottom-0`) + `AppShell.test.tsx`, `Sidebar.test.tsx`, `BottomTabs.test.tsx` | ✅ COMPLIANT |
| WDS-03 (inert placeholders) | Click/keyboard activation is a no-op, announced disabled | `NavItem.tsx` renders `<button disabled aria-disabled="true">` for `kind:'placeholder'`; `NavItem.test.tsx` `fireEvent.click` asserts no-op | ✅ COMPLIANT |
| WDS-04 (responsive sections) | Single column <lg, multi-column lg+ | `ResumenScreen.tsx`/`BucketDetailList.tsx` `p-4` + `grid-cols-1 lg:grid-cols-2`; `ResumenAnual.tsx` `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` (documented deviation, see Notes) | ⚠️ PARTIAL (documented deviation on `ResumenAnual`, see Notes below) |
| WDS-05 (category icons + fallback) | Known categoría → mapped icon; unknown → `Receipt` fallback, no throw | `category-icons.ts` (`iconoDeCategoria`) + `category-icons.test.ts` (8 canonical + fallback) | ✅ COMPLIANT |
| WDS-06 (aggregated total badge) | BigInt-exact total badge in category detail header | `BucketDetailList.tsx` `<Badge data-testid="categoria-total-badge">{grupo.subtotalLabel}</Badge>` sourced from `agruparDetallePorCategoria` (BigInt-exact) + `BucketDetailList.test.tsx` | ✅ COMPLIANT |
| WDS-07 (a11y preserved + AA contrast) | SVG slice role/aria-pressed preserved; palette meets AA | `DistribucionPie.tsx` `role="button"`/`aria-pressed` unchanged; `PIE_LABEL_FILL='#1a1c1c'`/`PIE_WEDGE_STROKE='#ffffff'` (theme-immune literals) + `DistribucionPie.test.tsx`/`MiniDistribucionPie.test.tsx` assert literal attrs AND `not.toHaveClass('fill-foreground'/'stroke-card')` | ✅ COMPLIANT |
| WDS-08 (money BigInt-safe, invariant) | No `Number()`/`parseFloat()` on money in diff | `git diff main..HEAD -- apps/web \| rg '^\+.*(Number\(\|parseFloat\()'` → no matches | ✅ COMPLIANT |
| WDS-09 (proxy fetch-path untouched, invariant) | `vite.config.ts`/`client.ts`/`api/[...path].ts` identical | `git diff --stat main..HEAD -- apps/web/vite.config.ts apps/web/src/api/client.ts apps/web/api/ apps/mobile/` → empty | ✅ COMPLIANT |
| WDS-10 (no domain-layer import, invariant) | No `apps/api/src/domain` import added | `git diff main..HEAD -- apps/web \| rg '^\+.*apps/api/src/domain'` → no matches | ✅ COMPLIANT |

**Compliance summary**: 9/10 fully compliant, 1/10 partial (documented, accepted deviation).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| Shell mount point | ✅ Correct | `AppShell` mounted in `_authenticated.tsx` `RouteComponent`, wrapping `DemoBanner`+`Outlet`; `__root.tsx` has zero `AppShell` references (`rg -n "AppShell" apps/web/src/routes/__root.tsx` → empty) — matches design.md's deviation decision |
| `bucket-colors.ts` export shape | ✅ Unchanged | `COLOR_BUCKET`/`ETIQUETA_BUCKET` shape preserved; `COLOR_EXCESO` added (unconsumed, YAGNI-accepted per design.md §3) |
| `@fontsource-variable/inter` | ✅ Added | `apps/web/package.json` +1 line; imported in `main.tsx`; no Google Fonts CDN link found |
| Nav model | ✅ Discriminated union | `nav-items.ts` uses `kind: 'link' | 'placeholder'` — stronger than the design.md sketch (avoids the `disabled: boolean` + optional `to` desync class of bug) |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| Token naming: remap shadcn convention, no 3rd namespace | ✅ Yes | `index.css` `:root` remapped in place |
| Icon set: lucide-react | ✅ Yes | `category-icons.ts`, `nav-items.ts` both use `lucide-react` |
| Charting: keep hand-rolled SVG | ✅ Yes | No charting lib added; `DistribucionPie`/`MiniDistribucionPie` a11y contract (`role` group/img toggle, `aria-pressed`, `tabIndex`) preserved verbatim |
| Inter source: `@fontsource-variable/inter` | ✅ Yes | Confirmed above |
| Shell mount: `_authenticated.tsx` not `__root.tsx` | ✅ Yes | Confirmed above |
| Pastels fills-only, strong tones for text | ✅ Yes | `PIE_LABEL_FILL`/text tokens use strong tones; pastel hex only appears as `fill=`/dot colors |
| PR4 follow-up: theme-immune literal constants (post-design, reliability-review fix) | ✅ Yes, sound | `pie-colors.ts` module + docstring explains the exact regression it prevents (dark-mode token-flip reintroducing the WCAG failure); test asserts both the correct literal AND the absence of the token classes — a real regression guard, not just a renamed constant |

### Invariant Checks

| Invariant | Result | Evidence |
|---|---|---|
| **Money** — no `Number()`/`parseFloat()` on money anywhere in the diff | ✅ PASS | grep on added lines: zero matches. `BucketDetailList` total badge sources `grupo.subtotalLabel` from the existing BigInt-exact `agruparDetallePorCategoria` — no new arithmetic introduced |
| **Access-control / proxy** — `vite.config.ts`, `src/api/client.ts`, `apps/web/api/[...path].ts`, `apps/mobile` untouched | ✅ PASS | `git diff --stat` on all 4 paths vs `main` is empty |
| **a11y (ADR-018)** — WCAG AA pie-label contrast fix present and test-guarded; existing semantics preserved | ✅ PASS | `PIE_LABEL_FILL='#1a1c1c'` (7.4–11.9:1 vs all 4 pastels, computed in design.md §7.1); tests assert literal `fill`/`stroke` attrs AND `not.toHaveClass('fill-foreground','stroke-card')` — the fix is not silently defeatable by a future re-tokenization, because the test would fail. `role="button"`, `aria-pressed`, heading order, `role="status"`, `aria-current`, `aria-disabled` all confirmed present in the touched files, unchanged in shape |
| **Architecture** — no `apps/api/src/domain` import; shell in `_authenticated.tsx` not `__root.tsx`; Serene tokens remap shadcn layer; pastels fills-only | ✅ PASS | All 4 sub-checks confirmed above with direct evidence |
| **Scope discipline** — stays within proposal scope IN / honors Non-Goals | ✅ PASS | No `/login` restyle, no standalone `/buckets/:bucket` restyle, no new backend endpoint, no real upload flow (placeholder stays `disabled`), `apps/mobile` untouched, no dark-mode work |

### Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
1. `ResumenAnual`'s 12-month grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) is a literal deviation from WDS-04's "single column below lg" wording. This is documented and audited in `tasks.md` 4.1 as a deliberate exception (avoids a very long vertical scroll for a 12-cell grid; no horizontal overflow at 320–375px per the task's audit). Recommend either (a) accepting as-is by amending the spec's WDS-04 wording to carve out grid-based calendar/matrix sections, or (b) leaving it as an accepted, documented deviation. Not a defect — flagging so the spec text and the shipped behavior don't silently diverge for the next reader.
2. `COLOR_EXCESO`/coral is defined in `bucket-colors.ts` but has no consuming UI (no over-budget affordance exists in this dashboard yet). YAGNI-accepted per design.md §3 — no action needed now, but worth a follow-up ticket if/when an over-budget UI is designed, so the token doesn't silently rot.

### Human-Pending Manual Gate (not a defect)

Task 4.3 — real device/browser check at 375px / 768px / 1024px+ (no horizontal scroll, no overlap with fixed chrome, including `DemoBanner` re-parenting under the shell `<main>`) is explicitly marked PENDING in `tasks.md` and cannot be automated in jsdom (no real CSS layout engine). The className-assertion tests added in PR4 (`ResumenScreen.test.tsx`, `BucketDetailList.test.tsx`, `ResumenAnual.test.tsx`, `AppShell.test.tsx`) are the automatable proxy for this: they lock the exact Tailwind classes that encode the responsive behavior (`p-4`, `grid-cols-1 lg:grid-cols-2`, `pb-16`/`lg:pl-64` clearance, etc.) but do not prove the browser actually renders without overflow. This is a legitimate outstanding manual verification step, not a code defect, and should gate final human sign-off before/alongside merge — consistent with `docs/mobile-launch-runbook.md`'s existing pending human-verification items.

### Verdict
**PASS WITH WARNINGS** (0 CRITICAL, 0 WARNING, 2 SUGGESTION) — ready to merge pending the human manual device/browser check (task 4.3). All 10 spec requirements are implemented with test/grep evidence (9 fully compliant, 1 partial-by-documented-design-deviation), all 5 invariant classes (money, proxy, a11y, architecture, scope) pass, tests are 355/355 green, typecheck is clean, and 33/34 tasks are complete with the 34th being an explicitly-flagged, correctly-deferred manual step.
