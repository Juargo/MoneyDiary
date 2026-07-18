# Proposal: Topbar "Probar" Button

## Intent

Add a "Probar" CTA button in the landing page header next to "Ingresar" to guide new users toward trying the app — the standard SaaS pattern (primary CTA + secondary login link).

## Scope

### In Scope
- Add `PROBAR` config entry to `apps/landing/src/config.ts` with label and href
- Add "Probar" styled anchor in `Header.astro` as a CTA-style primary button
- Set `target="_blank" rel="noopener noreferrer"`
- Keep "Ingresar" unchanged (text link, no background)
- Adjust nav spacing for two items (`gap-*`, `items-center`)

### Out of Scope
- Changing "Ingresar" link destination or style
- Different URLs for "Probar" vs "Ingresar" (both use `APP.url` for now)
- Mobile hamburger menu or responsive nav changes beyond basic spacing

## Capabilities

> No spec-level behavior changes — this is a pure UI addition to the landing header.

### New Capabilities
None

### Modified Capabilities
None

## Approach

1. **`config.ts`**: Add `PROBAR = { url: 'http://localhost:5173', label: 'Probar' }` — same destination as `APP.url` for now
2. **`Header.astro`**: Insert a new `<a>` before "Ingresar" with `target="_blank" rel="noopener noreferrer"`, styled as `bg-primary-container hover:bg-primary text-on-primary-container rounded-xl shadow-sm px-6 py-2` (matching CtaBeta but smaller padding)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/landing/src/config.ts` | Modified | Add `PROBAR` config object |
| `apps/landing/src/components/Header.astro` | Modified | Add "Probar" anchor before "Ingresar", apply CTA styling |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Same destination as "Ingresar" confuses users | Low | Current web app handles auth state; route separation is future work |
| Button breaks responsive layout | Low | Nav already uses flex; add `gap-*` and verify on 375px viewport |
| Duplicate URL maintenance burden | Low | Extract shared URL constant if needed later |

## Rollback Plan

1. Revert `config.ts` — remove `PROBAR` entry
2. Revert `Header.astro` — remove the new `<a>` element
3. Verify nav returns to single "Ingresar" link

## Dependencies

None

## Success Criteria

- [ ] "Probar" button renders in Header as `bg-primary-container` with shadow and hover state
- [ ] "Ingresar" remains unchanged (text link, no background)
- [ ] Both links point to `http://localhost:5173` and open in new tab
- [ ] No layout breakage on 375px viewport (touch targets ≥44×44px)
- [ ] `pnpm build` passes in the landing workspace
