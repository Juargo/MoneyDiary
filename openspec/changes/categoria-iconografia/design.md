# Design: Category Iconography

## Technical Approach

Nullable `Categoria.icono` (a lucide kebab-case name) with no DB CHECK. The closed allowlist lives in a **domain value object**, is enforced in the create/update use cases through `Result.fail`, and the seed template provides defaults for new catalogs. The contract gains `icono: string | null` on `CategoriaResponse` and on the detalle groups. Each client keeps a static `name → component` map, checked at compile time for totality and by a mirror spec for drift. Rendering is a badge that uses the bucket fill with measured on-fill ink. Build order: domain → application → infrastructure → contract → clients.

## Architecture Decisions

| # | Decision | Rejected alternative | Rationale |
|---|---|---|---|
| D-01 | Allowlist is `domain/value-objects/icono-categoria.ts`: `ICONOS_CATEGORIA` (as const), `IconoCategoria`, `esIconoCategoria(v): v is IconoCategoria` | Application constant copied into each use case (`BUCKETS_ASIGNABLES` pattern) | `BUCKETS_ASIGNABLES` sits in application only because `bucket.ts` had to stay untouched. The icon vocabulary is new domain knowledge consumed by 2 use cases **and** the infra template, so one source is correct (DRY). Infra may import domain (ADR-005). |
| D-02 | Wire value is the lucide kebab name (`shopping-cart`) | PascalCase export name; emoji | Framework-agnostic canonical lucide id. Emoji breaks ADR-027. |
| D-03 | No DB CHECK; column `TEXT NULL` | CHECK over the list | A CHECK would turn every allowlist edit into a manual prod migration with deploy-order coupling. The domain is the authority (ADR-024). |
| D-04 | Read model is `icono: string \| null`; write path is `IconoCategoria \| null` | Read typed as `IconoCategoria` | A future allowlist removal leaves retired names in the DB. Readers must never 500, and clients fall back. |
| D-05 | Fallback glyph `tag` is client-only and **not** in the allowlist | `receipt` inside the list | Keeps `null` ("no icon") distinct from a real choice. |
| D-06 | PATCH is tri-state: omitted = unchanged, `null` = clear, string = validate and set | Separate clear endpoint | User-confirmed 2026-09-15. |
| D-07 | New error `IconoCategoriaInvalidoError` (400 `ICONO_INVALIDO`), with its own readonly member `rawValue` and never echoed | Reusing `BODY_INVALIDO` via zod enum | Layer-honesty gate: zod carries transport shape only. See the memory note on structurally equal errors: route-level tests are mandatory. |
| D-08 | Badge glyph reuses `--color-pie-etiqueta-*` (web). Mobile adds a `COLOR_GLIFO_BUCKET` map | Minting new tokens | Existing tokens are already the measured on-fill ink per bucket in both ADR-043 themes. |
| D-09 | `icono` goes in seed `create` only, never `update` | Seed upsert overwrites | The bootstrap user is the owner's real prod account, and a reseed must not clobber picks. |
| D-10 | ADR-045 is new. ADR-027 stays library-only | Amending ADR-027 | ADR-027 covers the library choice only, not persistence or curation. |
| D-11 | Response `icono` is `.nullable().optional()` in the wire **type** (`icono?: string \| null`), even though the server always emits the key at runtime | Response `icono` required in the generated type (`.nullable()` only) | CI finding (2026-09-15, `sdd-tasks`): `apps/api/**` and `packages/**` changes both retrigger the `web`/`web-e2e`/`mobile` jobs (path filters, `.github/workflows/ci.yml`), so a required generated field would fail `tsc` on ~33 pre-existing client fixtures inside the SAME contract-regen PR. Marking it optional in the schema only widens the generated TYPE — it does not weaken the runtime guarantee, which stays enforced by route-level tests (CATICO-02/03, `catalogo-clasificacion-ownership`'s "MUST include an icono field"). This also matches the Guards note above, which already designs clients to tolerate `undefined` for API-rollback safety — the type now says what the code already does. |

**Allowlist (24, order = picker order).** All 24 names, plus the fallback `Tag`, were checked against the exports in `lucide-react@0.469.0` and in `lucide-react-native@1.31.0` (`dist/types/icons.d.ts`): `shopping-cart, fuel, pill, heart-pulse, bus, house, zap, wifi, smartphone, graduation-cap, shield, car, paw-print, tv, bike, utensils, shirt, plane, gamepad-2, gift, dumbbell, piggy-bank, trending-up, credit-card`. Deprecated aliases (`home`, `play-circle`) are avoided.

**Seed defaults:** Supermercado `shopping-cart` · Combustible `fuel` · Farmacia `pill` · Salud `heart-pulse` · Transporte `bus` · Streaming `tv` · Delivery `bike` · Ahorro `piggy-bank`.

## Data Flow

    POST/PATCH body ─zod(.strict, icono: string|null|optional)─→ use case
      ─esIconoCategoria?─→ Result.fail(IconoCategoriaInvalidoError) → 400 ICONO_INVALIDO
      └─ok─→ ICategoriaRepository(icono) → Prisma Categoria.icono
    GET /api/categorias ─→ aCategoriaDto(icono) ─→ client map[icono] ?? Tag
    GET /api/buckets/:b/detalle ─→ reader select icono → agruparDetallePorCategoria
      (Sin categoría ⇒ null) → grupo.icono → badge(fill = page bucket | SinCategoria)

Validation order. Create: demo → nombre → bucket → **icono** → uniqueness. Update: demo → 404 → nombre → bucket → **icono (only when not undefined/null)** → uniqueness → patch (`icono` included iff `!== undefined`). The zod PATCH refine becomes "nombre, bucket or icono `!== undefined`".

## File Changes

| File | Action |
|---|---|
| `apps/api/prisma/migrations/20260915000000_categoria_icono/migration.sql` | Create: `ALTER TABLE "Categoria" ADD COLUMN "icono" TEXT;` |
| `apps/api/prisma/schema.prisma` | `icono String?` |
| `apps/api/src/domain/value-objects/icono-categoria.ts` (+spec) | Create (D-01) |
| `apps/api/src/domain/errors/icono-categoria-invalido.error.ts` (+spec) | Create |
| `application/ports/categoria-repository.port.ts` | `CategoriaConPatrones.icono`; `crearConPatrones.data.icono`; `actualizar.patch.icono?` |
| `application/use-cases/{crear,actualizar}-categoria.use-case.ts` | Validate icono and widen the error unions |
| `application/ports/detalle-bucket.port.ts`, `services/agrupar-detalle-por-categoria.ts` | `categoria.icono`, `GrupoDetalleCategoria.icono` |
| `infrastructure/persistence/prisma-categoria.repository.ts` | Map/write `icono` |
| `infrastructure/persistence/prisma-detalle-bucket.repository.ts` | Select `icono`, then map inline next to `foldCategoria` (the shared fold stays `{id,nombre}` for movimientos-mes) |
| `infrastructure/persistence/catalogo-template.ts`, `prisma/seed.ts` | Template `icono: IconoCategoria`; `copiarCatalogoTemplate` writes it. Its 2 runtime call sites (demo, Google signup) need no change; `prisma/seed.ts` reads `CATEGORIA_TEMPLATE` directly (fixed-id bootstrap path) and sets `icono` on create only (D-09) |
| `http-express/schemas/{categorias,bucket-detalle-mes}.schema.ts`, `http/dto/{categoria,detalle-bucket-mes}.dto.ts`, `routes/categorias.routes.ts`, `routes/catalogo-http-error.ts` | Thread `icono` and map `ICONO_INVALIDO` |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | `pnpm contract:sync` |
| `apps/web/src/api/catalogo-constantes.ts` (+`.mirror.spec.ts`) | `ICONOS_CATEGORIA`, plus a new source entry parsed with `/['"]([a-z0-9-]+)['"]/g` |
| `apps/web/src/lib/iconos-categoria.ts` (+test) | Static map `satisfies Record<IconoCategoria, LucideIcon>`, Spanish `ETIQUETA_ICONO`, `iconoCategoria()` → `Tag` fallback |
| `apps/web/src/lib/bucket-colors.ts` | `claseGlifoBucket()` → `text-pie-etiqueta-*` (static literals) |
| `apps/web/src/components/IconoCategoriaBadge.tsx`, `configuracion/categorias/SelectorIcono.tsx` (+tests) | Create (presentational) |
| `CategoriaFila.tsx`, `NuevaCategoriaForm.tsx`, `EditarCategoria.tsx`, `GrupoMovimientos.tsx`, `domain/detalle-bucket-mes-view-model.ts`, `api/categorias.ts` (guard), `mensajes-catalogo.ts`, patch hooks | Modify |
| `apps/web/src/lib/category-icons.ts` + `.test.ts` | Delete (dead, name-keyed) |
| `apps/mobile/src/domain/catalogo-constantes.ts` + new `catalogo-constantes.mirror.spec.ts` | Mirror via `fs` + `__dirname` (precedent: `distribucion-gasto.spec.ts`) |
| `apps/mobile/src/components/iconos-categoria.ts`, `IconoCategoriaBadge.tsx`, `configuracion/SelectorIcono.tsx` (+specs) | Create |
| `apps/mobile/src/theme/colors.ts` | `COLOR_GLIFO_BUCKET` |
| Mobile `CategoriaFila`, `NuevaCategoriaForm`, `EditarCategoria`, `GrupoMovimientosMobile`, `api/categorias.ts`, `api/client.ts` (guards), `domain/mensajes-catalogo.ts` | Modify |

## Interfaces / Contracts

```ts
// categoriaUpdateRequestSchema
icono: z.string().nullable().optional()   // create: same
// categoriaResponseSchema / grupoDetalleMesSchema
icono: z.string().nullable().optional()   // D-11: server always emits the key at runtime
                                           // (enforced by route tests, not by this flag);
                                           // .optional() only widens the GENERATED TYPE so
                                           // ~33 pre-existing client fixtures need no churn.
```

**Guards.** `esCategoriaDto` and the group guards on both clients accept `icono` as `undefined | null | string`, and view models normalize with `?? null`. Membership is never checked there, so an unknown name renders the fallback. This keeps clients working if the API rolls back.

**UI.** The badge is a `size-6` square (web radius 0) or a mobile circle. Fill = bucket, glyph = on-fill ink, `aria-hidden` because the name text sits next to it. The picker is a `fieldset`/`legend` "Icono (opcional)" wrapping native radios on web (arrow keys come free), with 25 options ("Sin icono" first), ≥40px targets, a `--primary` 2px ring on the selected option, and `FOCUS_RING`. Mobile uses `accessibilityRole="radio"` with ≥44pt targets and a Spanish `accessibilityLabel`. `SelectorChips` is left untouched (SRP).

**Contrast (glyph vs fill, SC 1.4.11 ≥3:1).** Web light: Necesidades 5.5, Gustos 9.1, Ahorro 4.8 (dark ink), Sin categoría ≫3. Web dark (dark ink): 6.9 / 4.6 / 9.7, Sin categoría 4.6 (light ink). Mobile: Necesidades 8.5 (white), Gustos 10.1 (heading), Ahorro 3.5 (white), Sin categoría 4.1 (heading). The mobile Gustos fill measures only about 1.3:1 against white. The glyph carries the information and the adjacent text names the bucket, so the fill is never the only cue.

## Testing Strategy (Strict TDD)

| Layer | What | How |
|---|---|---|
| Domain (Vitest) | Allowlist is unique and kebab-case; guard true/false; error hides raw input | Unit |
| Application | Create/update: invalid → `ICONO_INVALIDO` with no write; null clears; omitted leaves `patch` without `icono`; order vs 409 | Fake repo |
| Infra | Repo maps/writes icono; template copies defaults; seed create-only; detalle group icono, null for Sin categoría; schema/DTO sync specs | Existing spec style |
| HTTP | Route tests assert status and `code` (memory: tsc misses union gaps); `.strict` still rejects unknown keys | Supertest |
| Integration | `catalogo-isolation.int-spec.ts`: user B PATCHing A's `icono` gets 404 and A's row is unchanged; list returns only own icons | Ephemeral Postgres |
| Web / Mobile | Mirror specs; map totality; picker keyboard/selection/clear; badge fallback; guards tolerate a missing field | Vitest+RTL / jest-expo+RNTL |
| E2E | Web three viewports on config + detalle | Playwright |

## Threat Matrix

N/A: no routing, shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary.

## Migration / Rollout

1. Once the Prisma client includes the column, every `categoria` include selects it. **The prod migration must therefore be applied before the PR that changes `schema.prisma` merges.** Run `prisma migrate deploy` with the prod `DATABASE_URL` **and** `DIRECT_URL` both set (memory: setting only one migrates localhost), then confirm the column exists.
2. ADR-013 does not apply: the icon name is a non-sensitive UI preference, stored as plaintext with no blind index.
3. No backfill. Existing rows show the fallback.
4. Rollback: client PRs revert on their own. An API revert leaves the column inert. `DROP COLUMN` is manual and only after every reader is reverted.

**ADR-045 (authored in apply).** Title: "Category icons: persisted curated lucide allowlist". It decides D-01…D-06 and D-10. Scope: the adding-an-icon procedure (VO + both client maps, gated by the mirror specs), and that retired names fall back and are never rejected on read.

**Informative PR slices (≤400 authored lines):**
1. ADR-045 + migration + schema + VO + error + template/seed (merge gated on the prod migration)
2. Port, repo, use cases, http-error, detalle reader/service, int-spec
3. Contract: schemas/DTOs/routes, `contract:sync`, client guards/fixture typing, messages, constants, mirror specs
4. Web config
5. Web detalle + delete `category-icons.ts`
6. Mobile config
7. Mobile detalle

## Open Questions

- [x] Slice 3 budget — **resolved by D-11** (2026-09-15): making response `icono` `.optional()` in the wire type means the ~33 pre-existing `CategoriaDto`/group fixtures need NO change (an added optional field never breaks an existing literal). This also fixed a false premise in the first `sdd-tasks` pass: `.github/workflows/ci.yml` retriggers `web`/`web-e2e`/`mobile` on ANY `apps/api/**` or `packages/**` change (not only on client-workspace changes), so the contract-regen PR always runs those jobs — it now stays green because nothing in those workspaces is type-required to change.
