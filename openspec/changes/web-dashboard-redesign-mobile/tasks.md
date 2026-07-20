# Tasks: web-dashboard-redesign-mobile

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~250 · PR2 ~600 · PR3 ~550 · PR4 ~150 · Total ~1550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (tokens+font+palette+icons) → PR2 (shell) → PR3 (restyle) → PR4 (mobile pass) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Tokens/font/palette/icons (Phase 1) | PR 1 | Foundational, low coupling, includes its own tests |
| 2 | Responsive nav shell (Phase 2) | PR 2 | Net-new files+tests; depends on PR1 tokens only |
| 3 | Restyle 6 dashboard components + contrast fix (Phase 3) | PR 3 | Depends on PR1 (tokens, icons); each component restyle is its own commit |
| 4 | Mobile responsiveness pass (Phase 4) | PR 4 | Depends on PR2 (shell) + PR3 (restyled sections) |
| 5 | Verification pass (Phase 5) | Folded into PR 4 or final PR | Guardrail grep + full test/typecheck |

## Phase 1: Tokens, Font, Palette, Icons (PR1) — WDS-01, WDS-05, WDS-09, WDS-10

- [x] 1.1 RED: update `LeyendaGasto.test.tsx` dot-color assertions to `rgb(143,167,209)/rgb(177,167,209)/rgb(230,209,148)`
- [x] 1.2 RED: update `DistribucionPie.test.tsx` slice-fill assertions to `['#8FA7D1','#B1A7D1','#E6D194']`
- [x] 1.3 GREEN: migrate `src/lib/bucket-colors.ts` hex + add `COLOR_EXCESO='#E88A8A'`; keep export shape (`COLOR_BUCKET`/`ETIQUETA_BUCKET`) unchanged
- [x] 1.4 Remap `src/index.css` `:root`/`@theme` to Serene tokens (`--background #f9f9f9`, `--card #fff`, `--primary #475f85`, `--secondary #61597f`, `--muted-foreground #44474e`, `--radius 0.5rem`, `--ring #1a1c1c`, bucket `--color-*` matching 1.3); `.dark` block untouched
- [x] 1.5 Add `@fontsource-variable/inter` as direct dep of `apps/web`; import once in `main.tsx`; confirm no Google Fonts CDN link anywhere
- [x] 1.6 RED: `src/lib/category-icons.test.ts` — all 8 canonical categories resolve to distinct icon; null/unknown → `Receipt` fallback
- [x] 1.7 GREEN: implement `src/lib/category-icons.ts` (`iconoDeCategoria`) with lucide-react icons
- [x] 1.8 Run `pnpm web test`; confirm ONLY the 2 palette tests + new icon test changed — DEVIATION: 3 tests changed, not 2 (`MiniDistribucionPie.test.tsx` also consumes `COLOR_BUCKET` directly and asserted the old hex; updated deliberately in lockstep, same as the other two). See apply-progress for detail.

## Phase 2: Responsive Nav Shell (PR2) — WDS-02, WDS-03

- [x] 2.1 Create `src/components/app-shell/nav-items.ts` (label/to/icon/disabled model; single source for both siblings)
- [x] 2.2 RED: `NavItem.test.tsx` — active route gets active styling via `<Link activeProps>`; disabled item renders but is not activatable
- [x] 2.3 GREEN: implement `src/components/app-shell/NavItem.tsx`
- [x] 2.4 RED: `Sidebar.test.tsx` + `BottomTabs.test.tsx` — render primary nav links from `nav-items.ts`; placeholders (`Subir nuevo archivo`, `Configuración`, `Ayuda`) are `<button disabled>`/`aria-disabled`, click is a no-op
- [x] 2.5 GREEN: implement `Sidebar.tsx` (`hidden lg:flex`, fixed `w-64` rail) and `BottomTabs.tsx` (`fixed bottom-0 inset-x-0 lg:hidden`)
- [x] 2.6 RED: `AppShell.test.tsx` — composes Sidebar + BottomTabs + children
- [x] 2.7 GREEN: implement `AppShell.tsx` (`lg:pl-64` on `<main>`, `pb-16` mobile)
- [x] 2.8 Mount `<AppShell>` in `apps/web/src/routes/_authenticated.tsx` `RouteComponent`, wrapping `<DemoBanner/>` + `<Outlet/>`. Do NOT edit `__root.tsx`
- [x] 2.9 Verify `/login` (outside `_authenticated`) renders without shell chrome

## Phase 3: Restyle Dashboard Components + Contrast Fix (PR3) — WDS-01, WDS-04, WDS-06, WDS-07

- [x] 3.1 `DistribucionPie.tsx`: on-slice `<text>` `fill="#FFFFFF"`→`fill="#1a1c1c"` (AA contrast fix, WDS-07); add `stroke="#ffffff" strokeWidth={2}` on wedge paths (1.4.11 adjacency); preserve `role` group/img toggle, `role=button`/`aria-pressed`/`aria-hidden`/`data-testid`s verbatim
- [x] 3.2 `MiniDistribucionPie.tsx`: same fill/stroke treatment (stroke scaled to `strokeWidth={1}` — 56px pie vs the main pie's 240px, documented in-code); preserve `aria-hidden="true"` on `<svg>`, placeholder ring, `data-testid`s
- [x] 3.3 Run `pnpm web test` on both pie components — confirm no role/label/testid assertion broke (regression gate before continuing)
- [x] 3.4 `ResumenScreen.tsx`: classes → tokens (`bg-card`, `border-border`, `rounded-lg`, `text-secondary`); preserve `sr-only h1`, heading order, `data-testid="semaforo-global"`, `lg:grid-cols-2`
- [x] 3.5 `LeyendaGasto.tsx`: dot color via migrated `COLOR_BUCKET`; selected row `bg-muted`; preserve `aria-pressed`, `focus-visible:outline-slate-800`
- [x] 3.6 RED: `BucketDetailList.test.tsx` — group header renders aggregated total badge (client-computed, BigInt-safe)
- [x] 3.7 GREEN: implement aggregated total badge in `BucketDetailList.tsx` group header; add category icon (`iconoDeCategoria`, `aria-hidden`) beside heading
- [x] 3.8 `BucketDetailList.tsx` remaining restyle: row cards `rounded-lg`/`border-border`; preserve heading derivation (h1/h2→h2/h3), `ReclasificarCategoriaControl` wiring, cargo/abono rendering
- [x] 3.9 `ResumenAnual.tsx`: card/cell classes → tokens, active cell `border-primary`/`bg-muted`; preserve `aria-current="date"`, `mes-actual-marker`, disabled-cell `aria-disabled`, `focus-visible:outline-slate-800`
- [x] 3.10 Run `pnpm web test`; confirm ONLY palette + badge tests changed — any other a11y/role/testid diff is a STOP signal (out-of-scope semantic change). RESULT: 45/45 files, 350/350 tests green; only the 5 new deliberate contrast/badge/icon assertions added, zero pre-existing test modified.

## Phase 4: Mobile Responsiveness Pass (PR4) — WDS-04

- [ ] 4.1 Audit restyled sections at `<lg`: single column, 16px side margins (`ResumenScreen`, `BucketDetailList`, `ResumenAnual`)
- [ ] 4.2 Verify `<main>` `pb-16` clears `BottomTabs` on mobile; `lg:pl-64` clears `Sidebar` on desktop
- [ ] 4.3 Manual check at 375px/768px/1024px+: no horizontal scroll, no overlap with fixed chrome

## Phase 5: Final Verification — WDS-08, WDS-09, WDS-10

- [ ] 5.1 Diff review: `vite.config.ts` / `src/api/client.ts` / `apps/web/api/[...path].ts` untouched
- [ ] 5.2 Diff review: no new `Number(`/`parseFloat(` on money fields
- [ ] 5.3 Diff review: no `apps/api/src/domain` imports added in `apps/web`
- [ ] 5.4 Run `pnpm web test` + `pnpm web typecheck`; full green
