# Design: Topbar "Probar" Button

## Technical Approach

Minimal UI addition to the landing page header — no architecture or data changes.

## Affected Files

| File | Change |
|------|--------|
| `apps/landing/src/config.ts` | Add `PROBAR` config object with `url` and `label` |
| `apps/landing/src/components/Header.astro` | Add `<a>` for "Probar" before "Ingresar", apply CTA styling, add `gap-` for spacing |

## Styling

"Probar" anchor uses the same CTA pattern as `CtaBeta.astro` but with smaller padding:
- `bg-primary-container hover:bg-primary text-on-primary-container`
- `rounded-xl shadow-sm`
- `px-5 py-2` (matching "Ingresar" vertical size)
- `target="_blank" rel="noopener noreferrer"`

"Ingresar" stays as-is: text link, same class list.

Nav updated from `justify-end` to `items-center gap-4 justify-end` for proper spacing.
