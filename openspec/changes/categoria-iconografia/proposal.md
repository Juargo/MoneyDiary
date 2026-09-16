# Proposal: Category Iconography

## Intent

Category and bucket identity is text plus color only. Users need to pick an icon per category, shown on a bucket-colored badge, so both read at a glance on web and mobile.

## Scope

### In Scope
- Nullable `Categoria.icono`; no backfill (`null` renders a generic fallback).
- Backend-owned curated allowlist (~24 lucide names), validated in create/update use cases.
- Default icons for the 8 `catalogo-template.ts` seeds (seed, demo, Google signup).
- Additive contract: `icono` on `CategoriaDto`, `POST`/`PATCH /api/categorias`, and `GET /api/buckets/:bucket/detalle` groups.
- Web + mobile: picker in category create/edit; icon in category list and month-detail group rows.
- Delete dead `apps/web/src/lib/category-icons.ts` (name-keyed, obsolete since ADR-036).
- New ADR-045 (persistence, curation, fallback); ADR-027 stays library-only.

### Out of Scope
- Import preview, manual entry, dashboard pie/legend.
- Separate bucket icons (reverted 2026-09-06); backfill; emoji or free-form names.

## Capabilities

### New Capabilities
- `categoria-icono`: allowlist, validation error, seed defaults, fallback, cross-client mirror.

### Modified Capabilities
- `catalogo-clasificacion-ownership`: create/list/update and template copy carry `icono`; contract sync.
- `bucket-detalle-mes`: MBD-02 groups gain `icono` (null for Sin categoría).
- `web-app`: WCTG-02/04/12 and WDM group rows.
- `mobile-configuracion`: MCTG-01/02/03/06.
- `mobile-detalle-mes`: MDET-03.

## Approach

- Allowlist is a domain constant (ADR-024; pattern `BUCKETS_ASIGNABLES`); zod only transports.
- Clients map name to a statically imported lucide component (ADR-027); one mirror spec per client (pattern `catalogo-constantes.mirror.spec.ts`) fails on drift.
- Badge reuses bucket colors (ADR-043 tokens; `apps/mobile/src/theme/colors.ts`).
- Older clients stay compatible: nullable column, additive optional fields.

## Affected Areas

| Area | Impact |
|------|--------|
| `apps/api/prisma` schema + migration | New column |
| `apps/api/src` domain, application, persistence, http | Allowlist, use cases, template, DTOs, detalle reader |
| `apps/api/openapi.json`, `@moneydiary/api-client` | Regenerated |
| `apps/web/src` api types, configuración, `GrupoMovimientos.tsx` | Modified; `lib/category-icons.ts` removed |
| `apps/mobile/src` catalog + detalle | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API deployed before manual prod migration breaks reads | Med | Migrate prod before merging the reading PR |
| Allowlist drift across workspaces | Med | Mirror specs |
| Icon on pale bucket fill misses 3:1 contrast | Med | Design audits both themes |
| Clearing semantics (`PATCH icono: null`) unpinned | Low | Spec pins it |

## Rollback Plan

Client PRs revert independently. Reverting API code leaves the nullable column inert; full removal is a manual `DROP COLUMN` after all readers are reverted.

## Dependencies

- Manual prod migration (Render skips `migrate deploy`).

## Delivery Forecast

400-line budget risk: High. ~6 chained PRs: (1) ADR + migration + allowlist + defaults, (2) API contract + client regen, (3) web config, (4) web detail, (5) mobile config, (6) mobile detail. `sdd-tasks` owns the final split.

## Success Criteria

- [ ] Invalid `icono` rejected with a closed error code; valid values round-trip.
- [ ] New catalogs carry default icons; existing rows show the fallback.
- [ ] Web and mobile pick and render icons on bucket-colored badges.
- [ ] Mirror specs fail on allowlist divergence; contract drift gate green.
