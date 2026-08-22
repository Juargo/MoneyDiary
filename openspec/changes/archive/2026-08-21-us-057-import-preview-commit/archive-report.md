# Archive Report — us-057-import-preview-commit

- **Archived**: 2026-08-21
- **Issue**: [#291](https://github.com/Juargo/MoneyDiary/issues/291) (closed) · Sprint-15 · `must` · `epic:ingesta`
- **Delivery**: 6-PR stacked-to-main chain, merged in order — #449, #450, #451, #452, #453, #454. Final merge commit on `main`: `89880324`.
- **Verification**: `sdd-verify` passed — 0 CRITICAL, 10/10 requirements, 24/24 scenarios, 36/36 tasks. Gates at close: 2,228 unit + 162 integration tests, `tsc --noEmit` clean, `openapi:check` exit 0, api-client drift clean, web/mobile typecheck clean.

## Living specs updated

- `openspec/specs/ingesta-preview-commit/spec.md` — NEW: full preview/commit contract (PREV-EXT-01..03, CMT-01..05, DEP-01, CONTRACT-01), including the 2026-08-21 amendments.
- `openspec/specs/user-data-isolation/spec.md` — MODIFIED: isolation extended to the preview/commit endpoints (ISO-03).

## Design review trail

The design went through 5 rounds of blind dual adversarial review (judgment-day) before implementation, plus per-PR pre-push reviews (dual on money-path PRs 2–3, solo on 1/4–6). Key catches: overlay unimplementable post-persist (no rowIndex→id bridge), persistence-chain intermediary omitted, FK resolution layering (ADR-005), cross-tenant validation via `listarConPatrones` (pattern-less categories).

## Amendments during delivery (all recorded in design.md/spec.md)

1. Overlay `categoriaId: null` = des-clasificar → persists `{SinCategoria, null}`.
2. The Ingreso rule is immutable — overlay entries on Ingreso rows are silently ignored.
3. **Compat shim**: the preview response keeps legacy `estructura`/`muestra` (deprecated) alongside canonical `resumen`/`filas` until US-061 removes them with the one-shot endpoint — shipped clients (including the installed mobile APK) are contract consumers.

## CI-remediation lessons (see engram `sdd/us-057-import-preview-commit/ci-remediation`)

1. `openapi:check` is a per-commit gate: any PR reshaping a contract must run `openapi:emit` at its own TS state.
2. The api-client drift gate is per-commit too: same PR must run `api-client generate` and reconcile `index.ts` aliases.
3. Reshaping a response consumed by shipped clients requires additive compatibility until the client-migration US lands; the cross-workspace typecheck fan-out (api-client → web/mobile jobs) is the tripwire.

## Follow-ups tracked elsewhere

- US-061 owns: one-shot removal, legacy preview fields removal, mobile screen migration.
- US-059/US-060 (web UIs) consume the new contract.
- Pre-existing doc debt: 401 responses undocumented across authenticated openapi operations.
