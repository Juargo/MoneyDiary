# Tasks: Category Iconography

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1800-2300 total (authored, generated goldens excluded); per-slice below |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3a → PR3b → PR3c → PR4 → PR5 → PR6 → PR7 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

**Correction (2026-09-15, gate failure):** the first pass wrongly assumed path-filtered CI would skip `web`/`mobile` on a PR touching only `apps/api` + `packages/api-client`. Verified against `.github/workflows/ci.yml`: `web` (line 597), `web-e2e` (656) and `mobile` (713) all trigger on `packages == 'true'` too, and `api-client` (570) triggers on `api == 'true'` as well — so PR3a DOES run full web+mobile typecheck/tests. Fixed by design.md D-11 (below), not by re-merging slices: the client jobs still run, but they now pass because the regenerated `icono` field is `.optional()` in the TYPE (server still always emits it at runtime, enforced by route tests). This also removed the ~33-fixture-churn tasks from PR3b/PR3c entirely (an added optional field never breaks an existing object literal), so 3b/3c also shrank. The three-viewport `web-e2e` claim was re-checked and holds unchanged (job runs `pnpm web test:e2e`, 3 Chromium viewport projects, on the same `web`/`packages`/`shared` trigger).

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Slices are ordered by hard dependency (domain → application/infra → contract → each client's foundation → each client's UI) and work under either `stacked-to-main` (each is additive/backward-compatible) or `feature-branch-chain`. **Chain strategy is not yet chosen — ask the user before `sdd-apply` starts PR1.**

### Suggested Work Units

| Unit | Goal | PR | ~Lines | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|---|
| 1 | Allowlist VO, error, ADR-045, migration, template/seed defaults | PR1 | 200-250 | `pnpm api test -- icono-categoria` | `pnpm api cli -- ./test/fixtures/movimientos-test.xlsx` (seed path exercised) | Revert PR1; column stays nullable/unused |
| 2 | Use cases, ports, repos, detalle grouping, isolation int-spec | PR2 | 300-350 | `pnpm api test -- categoria icono`; `pnpm api test:integration` (gated) | N/A — no new route yet, covered by unit+int specs | Revert PR2; PR1 types remain unused |
| 3a | HTTP schemas/DTO/routes/openapi + api-client regen (`icono` optional in the generated type, D-11) | PR3a | 180-230 authored (+generated) | `pnpm api test -- categorias.schema bucket-detalle-mes.schema`; `pnpm contract:sync && pnpm api-client typecheck`; `pnpm api openapi:check` | `pnpm api start:prod` + curl `POST/PATCH /api/categorias` with `icono` | Revert PR3a; no client consumes the field yet |
| 3b | Web contract foundation: constants, icon map, guards, error copy (no fixture churn — D-11) | PR3b | 180-230 | `pnpm web test -- catalogo-constantes iconos-categoria mensajes-catalogo`; `pnpm web build` (tsc) | N/A — no UI yet | Revert PR3b; web stays on prior generated types |
| 3c | Mobile contract foundation: constants, icon map, guards, error copy (no fixture churn — D-11) | PR3c | 180-230 | `pnpm --filter @moneydiary/mobile test -- catalogo-constantes iconos-categoria mensajes-catalogo` | `npx expo start` smoke boot in `apps/mobile` | Revert PR3c independently of 3b |
| 4 | Web config list + picker (WCTG-02/04) | PR4 | 250-300 | `pnpm web test -- CategoriaFila SelectorIcono IconoCategoriaBadge` | `pnpm web dev` manual click-through `/configuracion/categorias` | Revert PR4; list renders without badges |
| 5 | Web detalle badges + delete dead file (WDM-03) | PR5 | 150-200 | `pnpm web test -- GrupoMovimientos`; Playwright 3 viewports | `pnpm web dev` manual `/detalle` | Revert PR5 |
| 6 | Mobile config list + picker (MCTG-01/02/03) | PR6 | 250-300 | `pnpm --filter @moneydiary/mobile test -- CategoriaFila SelectorIcono` | Manual on-device Maestro gate (memory: pending before merge) | Revert PR6 |
| 7 | Mobile detalle badges (MDET-03) | PR7 | 150-200 | `pnpm --filter @moneydiary/mobile test -- GrupoMovimientosMobile` | Manual on-device gate | Revert PR7 |

**Slice 3 split rationale (contract-regen risk, corrected):** PR3a, PR3b, and PR3c ALL trigger `web`+`web-e2e`+`mobile` CI regardless of which workspace they touch, because `packages/**` and `apps/api/**` both retrigger those jobs (`.github/workflows/ci.yml` lines 570/597/656/713) — path-filtered CI does not, by itself, isolate this contract change. The split by workspace is kept for reviewer focus and rollback independence, not for CI isolation; it stays CI-green because of D-11 (design.md): the regenerated `icono` field is `.optional()` in the wire TYPE (server still always emits it at runtime, enforced by route tests), so PR3a's regen is a purely additive, non-breaking type change and the ~33 pre-existing web/mobile fixtures need zero edits in any of the three PRs. If a future allowlist or contract change ever needs a NEW required field, this split pattern does not apply — that case would need the fixture updates in the SAME PR as the regen, as the original design.md open question anticipated.

## Phase 0: Housekeeping

- [x] 0.1 Create/link a GitHub issue for `categoria-iconografia` before opening PR1 — #679 (US-067)
- [x] 0.2 Ask the user for chain strategy before starting PR1 — `feature-branch-chain`

## Phase 1 (PR1): Allowlist, error, ADR-045, migration, seed defaults

- [x] 1.1 RED: `apps/api/src/domain/value-objects/icono-categoria.spec.ts` — 24 unique kebab-case names, `esIconoCategoria` true/false (CATICO-01)
- [x] 1.2 GREEN: `apps/api/src/domain/value-objects/icono-categoria.ts` — `ICONOS_CATEGORIA`, `IconoCategoria`, `esIconoCategoria` (CATICO-01)
- [x] 1.3 RED: `apps/api/src/domain/errors/icono-categoria-invalido.error.spec.ts` — `rawValue` never echoed in message (CATICO-02/03)
- [x] 1.4 GREEN: `apps/api/src/domain/errors/icono-categoria-invalido.error.ts` (CATICO-02/03)
- [x] 1.5 Edit `apps/api/prisma/schema.prisma` — `icono String?` on `Categoria`
- [x] 1.6 Create `apps/api/prisma/migrations/20260915000000_categoria_icono/migration.sql` — `ALTER TABLE "Categoria" ADD COLUMN "icono" TEXT;`
- [x] 1.7 Edit `apps/api/src/infrastructure/persistence/catalogo-template.ts` — add `icono: IconoCategoria` per 8 seeds (CATICO-04 defaults, D-06 seed list)
- [x] 1.8 Edit `apps/api/prisma/seed.ts` — set `icono` on create only, never update (CATICO-04, D-09)
- [x] 1.9 Create `docs/adr/ADR-045-categoria-icono-persistencia.md` covering D-01…D-06, D-10; edit `docs/adr/README.md` index and root `CLAUDE.md` ADR table
- [ ] 1.10 Apply `apps/api/prisma/migrations/20260915000000_categoria_icono/migration.sql` (read-only) to prod: `prisma migrate deploy` with `DATABASE_URL` and `DIRECT_URL` both set; confirm column exists — MUST finish before PR1 merges

**Verify:** `pnpm api test -- icono-categoria`

## Phase 2 (PR2): Use cases, ports, repos, detalle grouping, isolation

- [x] 2.1 RED: `crear-categoria.use-case.spec.ts` — invalid icono → `ICONO_INVALIDO`, no write; omitted → `null` (CATICO-02)
- [x] 2.2 GREEN: edit `apps/api/src/application/use-cases/crear-categoria.use-case.ts` + `apps/api/src/application/ports/categoria-repository.port.ts` (`icono` on create data)
- [x] 2.3 RED: `actualizar-categoria.use-case.spec.ts` — set/clear/leave-unchanged/invalid-unchanged, validation order before uniqueness (CATICO-03, CATICO-05)
- [x] 2.4 GREEN: edit `apps/api/src/application/use-cases/actualizar-categoria.use-case.ts` (`patch.icono?`, tri-state)
- [x] 2.5 RED: `prisma-categoria.repository.spec.ts` — maps/writes `icono` (existing spec style)
- [x] 2.6 GREEN: edit `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts`
- [x] 2.7 RED: `agrupar-detalle-por-categoria.spec.ts` — group `icono` present, always `null` for Sin categoría (MBD-02)
- [x] 2.8 GREEN: edit `apps/api/src/application/ports/detalle-bucket.port.ts`, `apps/api/src/application/services/agrupar-detalle-por-categoria.ts`
- [x] 2.9 RED: `prisma-detalle-bucket.repository.spec.ts` — selects `icono`, maps inline (fold stays `{id,nombre}` for movimientos-mes) (MBD-02)
- [x] 2.10 GREEN: edit `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.ts`
- [x] 2.11 RED+GREEN: extend `apps/api/test/catalogo-isolation.int-spec.ts` (the REAL path — there is no `test/integration/` directory) — user B calling `ActualizarCategoriaUseCase` (wired to the real `PrismaCategoriaRepository`) against A's real categoria id with `icono` set → `CategoriaNoEncontradaError`, A's row unchanged (CATICO-05, RNF-SEC-006). Exercises the use case + repository layer, not HTTP: `categoriaUpdateRequestSchema` does not accept `icono` yet (PR3a adds it).

**Verify:** `pnpm api test -- categoria icono`; `pnpm api test:integration` (ALLOW_DESTRUCTIVE_DB=1, ephemeral DB)

## Phase 3a (PR3a): HTTP contract + regen

- [x] 3a.1 RED: `apps/api/src/infrastructure/http-express/schemas/categorias.schema.spec.ts` — `icono` optional-nullable on create/update AND on the response (D-11: `.nullable().optional()`, generated type stays widen-only); `.strict` rejects unknown keys
- [x] 3a.2 GREEN: edit `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts` (`categoriaResponseSchema.icono: z.string().nullable().optional()`, D-11), `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.ts` (`grupoDetalleMesSchema.icono` same shape)
- [x] 3a.3 Edit `apps/api/src/infrastructure/http/dto/categoria.dto.ts`, `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.ts` — thread `icono` (mapper always sets the key; the schema's `.optional()` is a type-only widening, not a mapper change)
- [x] 3a.4 RED+GREEN: route test in `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts` suite — 400 `ICONO_INVALIDO` status+code, AND response body always includes the `icono` key even when `null` (memory: tsc misses union gaps, assert at HTTP layer; this is the enforcement point for the "always emitted" runtime contract now that the type allows omission)
- [x] 3a.5 Edit `apps/api/src/infrastructure/http-express/routes/catalogo-http-error.ts` — map `IconoCategoriaInvalidoError` → 400 `ICONO_INVALIDO` — **done early in PR2** (unplanned): `CategoriaConPatrones` gaining a required `icono` field widened `CrearCategoriaError`/`ActualizarCategoriaError`, and this file's `const _exhaustive: never = error` guard forced the mapping to compile NOW, not at PR3a. Verify only; no further edit needed here.
- [x] 3a.6 Run `pnpm contract:sync` — regenerate `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts`; confirm `icono` renders as `icono?: string | null` in `types.gen.ts` (not `icono: string | null`)

**Verify:** `pnpm api test -- categorias.schema bucket-detalle-mes.schema catalogo-http-error categorias.routes`; `pnpm api openapi:check`; `pnpm contract:sync && pnpm api-client typecheck`; `pnpm web test` and `pnpm --filter @moneydiary/mobile test` (both retrigger per CI path filters on `packages/**` — confirm they still pass unmodified)

## Phase 3b (PR3b): Web contract foundation

- [x] 3b.1 RED+GREEN: `apps/web/src/api/catalogo-constantes.ts` + `catalogo-constantes.mirror.spec.ts` — mirror the 24 names via `/['"]([a-z0-9-]+)['"]/g` (CATICO-07)
- [x] 3b.2 RED+GREEN: `apps/web/src/lib/iconos-categoria.ts` + test — `satisfies Record<IconoCategoria, LucideIcon>`, `ETIQUETA_ICONO` (es), `iconoCategoria()` → `Tag` fallback (CATICO-06, CATICO-08)
- [x] 3b.3 Edit `apps/web/src/lib/bucket-colors.ts` — `claseGlifoBucket()` → `text-pie-etiqueta-*`
- [x] 3b.4 Edit `apps/web/src/api/categorias.ts` (`esCategoriaDto`) and `apps/web/src/api/client.ts` (`esGrupoDetalleBucketMesDto`) — guards tolerate `icono: undefined | null | string`, never allowlist membership (CATICO-06, ADR-024). Shipped in PR3b2 (#685), commit `2fe1c0c0`.
- [x] 3b.5 Edit the REAL path `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts` (tasks.md names `apps/web/src/lib/mensajes-catalogo.ts`, which does not exist — confirmed via `fd`) — add `ICONO_INVALIDO` row, rename to 13-code table (WCTG-12: 12 domain codes + `BODY_INVALIDO`). Shipped in PR3b2 (#685), commit `32b7b348`.

No fixture-file batch task here (D-11): `icono` is `.optional()` in the generated type, so the ~33 pre-existing `CategoriaDto`/detalle-group fixture literals in `apps/web/src/**/*.test.{ts,tsx}` compile unchanged — only NEW icon-specific tests (Phase 4/5) add `icono` to their own fixtures.

**Verify:** `pnpm web test -- catalogo-constantes iconos-categoria mensajes-catalogo`; `pnpm web build`

## Phase 3c (PR3c): Mobile contract foundation

- [x] 3c.1 RED+GREEN: `apps/mobile/src/domain/catalogo-constantes.ts` + `catalogo-constantes.mirror.spec.ts` (`fs`+`__dirname`, precedent `distribucion-gasto.spec.ts`) (CATICO-07)
- [x] 3c.2 RED+GREEN: `apps/mobile/src/components/iconos-categoria.ts` + spec — icon map + fallback (CATICO-06, CATICO-08)
- [x] 3c.3 Edit `apps/mobile/src/theme/colors.ts` — `COLOR_GLIFO_BUCKET`
- [x] 3c.4 Edit `apps/mobile/src/api/categorias.ts`, `apps/mobile/src/api/client.ts` — guards tolerate optional `icono`
- [x] 3c.5 Edit `apps/mobile/src/domain/mensajes-catalogo.ts` — add `ICONO_INVALIDO` row (MCTG-06)

No fixture-file batch task here (D-11, same reasoning as PR3b): `icono` is `.optional()` in the generated type, so pre-existing mobile fixtures compile unchanged.

**Verify:** `pnpm --filter @moneydiary/mobile test -- catalogo-constantes iconos-categoria mensajes-catalogo`

## Phase 4 (PR4): Web config list + picker

- [x] 4.1 RED+GREEN: `apps/web/src/components/IconoCategoriaBadge.tsx` + test — bucket-fill badge, `aria-hidden` (CATICO-06/08)
- [x] 4.2 RED+GREEN: `apps/web/src/components/configuracion/categorias/SelectorIcono.tsx` + test — fieldset/legend, 25 radios incl. "Sin icono", keyboard nav, focus ring, accessible names (CATICO-08, WCTG-04)
- [x] 4.3 Edit `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx` — render badge (WCTG-02)
- [x] 4.4 RED+GREEN: edit `NuevaCategoriaForm.tsx` — picker travels with `POST` body (WCTG-04)
- [x] 4.5 RED+GREEN: edit `EditarCategoria.tsx` — picker travels with `Guardar`'s `PATCH`, not separately (WCTG-04) — **DONE (PR4b)**: `EditarCategoriaCargada` seeds `icono` from `categoria.icono` alongside `nombre`/`bucket`; a `patchIcono()` helper omits the key when unchanged and sends the value (including `null` for "Sin icono") when dirty. Both save paths (direct `Guardar` and `ConfirmarImpactoDialog`'s bucket-change confirm) carry it — the dialog path freezes `iconoNuevo` in `snapshotAlAbrirDialogo`, mirroring how `nombre`/`bucketNuevo` are already frozen. 4 new `EditarCategoria.test.tsx` cases (set-from-null, unchanged-omitted, clear-to-null, travels-through-dialog-confirm), all clicking the real `Guardar`/dialog-confirm buttons via `user-event` per the batch's hard constraint. Plus the deferred PR4 validator suggestion: a Tab-into-group + Space-to-select case in `SelectorIcono.test.tsx`.

**Verify:** `pnpm web test -- CategoriaFila SelectorIcono IconoCategoriaBadge NuevaCategoriaForm EditarCategoria`

## Phase 5 (PR5): Web detalle badges + dead code removal

- [x] 5.1 RED+GREEN: edit `apps/web/src/components/GrupoMovimientos.tsx`, `apps/web/src/domain/detalle-bucket-mes-view-model.ts` — accordion heading badge, fallback for Sin categoría (WDM-03)
- [x] 5.2 Delete `apps/web/src/lib/category-icons.ts` and `apps/web/src/lib/category-icons.test.ts`
- [x] 5.3 Update web Playwright e2e (movil/tablet/escritorio) to assert config + detalle badges render in all three viewports

**Verify:** `pnpm web test -- GrupoMovimientos`; `pnpm --filter @moneydiary/web e2e` (3 viewports)

## Phase 6 (PR6): Mobile config list + picker

- [x] 6.1 RED+GREEN: `apps/mobile/src/components/IconoCategoriaBadge.tsx` + spec (CATICO-06/08)
- [x] 6.2 RED+GREEN: `apps/mobile/src/components/configuracion/SelectorIcono.tsx` + spec — `accessibilityRole="radio"`, ≥44pt targets, `accessibilityLabel` (CATICO-08, MCTG-02/03)
- [x] 6.3 Edit mobile `CategoriaFila`, `NuevaCategoriaForm`, `EditarCategoria` — badge render + picker travels with create/`Guardar` (MCTG-01/02/03) — **COMPLETE**: `CategoriaFila` badge render (MCTG-01, commit `301f60da`, PR6); `NuevaCategoriaForm` wiring (MCTG-02, commit `9d994b06`, PR6b) and `EditarCategoria`'s tri-state `patchIcono` wiring (MCTG-03, commit `16fea13e`, PR6b) are now done, mirroring web PR4/PR4b's exact split and pattern.

**Verify:** `pnpm --filter @moneydiary/mobile test -- CategoriaFila SelectorIcono IconoCategoriaBadge`; manual on-device gate before merge

## Phase 7 (PR7): Mobile detalle badges

- [x] 7.1 RED+GREEN: edit mobile `GrupoMovimientosMobile` — header badge, fallback for `SinCategoria` (MDET-03)
- [x] 7.2 Edit mobile detalle view-model to thread `icono` through

**Verify:** `pnpm --filter @moneydiary/mobile test -- GrupoMovimientosMobile`; manual on-device gate before merge
