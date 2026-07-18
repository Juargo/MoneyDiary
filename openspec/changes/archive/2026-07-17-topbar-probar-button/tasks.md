# Tasks: Topbar "Probar" Button

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~15 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | force-chained |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

1. Single PR — add config + header anchor + verify build

## Tasks

- [x] 1.1 Add `PROBAR` config entry to `apps/landing/src/config.ts` with `url`, `label`
- [x] 1.2 Add "Probar" styled anchor in `apps/landing/src/components/Header.astro` before "Ingresar", with CTA styling and `target="_blank"`
- [x] 1.3 Add `gap-4 items-center` to nav for proper spacing
- [x] 1.4 Run `pnpm build` to verify landing builds
