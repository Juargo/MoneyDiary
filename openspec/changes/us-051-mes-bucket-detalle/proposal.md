# Proposal: US-051 — Backend detalle MES-BUCKET agrupado por categoría

## Intent

Issue #285: the US-017 drill-down (`GET /api/buckets/:bucket?periodo=`) returns a flat category-tagged list; grouping only exists client-side (US-013, dashboard panel). This change ships the grouped month×bucket detail from the backend — header with % vs meta (CA-01), category groups with their transactions (CA-02), Sin categoría without meta (CA-03), strict period handling (CA-04), BigInt-safe money (CA-05), userId isolation (CA-06). Wireframe: C2hidB23uiSHhf4Bt3dyPo (detalle MES). Evolution: US-053 web consumes this endpoint and retires the US-047 interim drill-down.

## Scope

### In Scope
- New sibling endpoint `GET /api/buckets/:bucket/detalle` (exploration Approach 1); flat endpoint + dashboard panel untouched.
- Header: total, totalTransacciones, totalCategorias, % vs meta (bp), metaBp.
- Groups carrying ALL their transactions — no backend paging (`?page=` stays client-side expansion).
- userId-scoped WHERE, hermetic app test, openapi.json emit (ADR-011).

### Out of Scope
- Ingresos (US-052) — route rejects bucket `Ingresos` → 400.
- UI (US-053); backend pagination; changing the flat endpoint; new SQL/ports/repositories.

## Requirements Map (capability `bucket-detalle-mes` — MBD-*)

| Req | CA | Requirement |
|-----|----|-------------|
| MBD-01 | CA-01 | Header: `total` (BigInt string), `totalTransacciones`, `totalCategorias`, `porcentajeBp` (% vs meta), `metaBp` |
| MBD-02 | CA-02 | `grupos[]`: `{categoriaId\|null, nombre, subtotal, conteo, transacciones[{id, fecha, descripcion, monto(=cargo)}]}` — ALL txs; es-CL alpha order, "Sin categoría" last |
| MBD-03 | CA-03 | Sin categoría → `metaBp` null ⇒ % vs meta null (BANDAS_SEMAFORO absence; no special-casing) |
| MBD-04 | CA-04 | Period absent → current month; invalid → 400 scrubbed (`PeriodoInvalidoError`) |
| MBD-05 | CA-05 | BigInt→`String()`; bp round-half-up (`porcentajeBasisPoints`) |
| MBD-06 | CA-06 | userId WHERE + isolation test; `user-data-isolation` ISO-01/02: 4→5 endpoints |

Route allowlist: {Necesidades, Deseos, Ahorro, SinCategoria}; `Ingresos` → 400 (`BucketInvalidoError`).

## Capabilities

- **New** `bucket-detalle-mes` → `openspec/specs/bucket-detalle-mes/spec.md`.
- **Modified** `user-data-isolation`: ISO-01/02 endpoint set grows 4→5.

## Approach

Compose existing `IDetalleBucketReader` (rows, categoria-folded, decrypted ADR-013) + `IResumenMesReader` (month income) — zero new SQL. New `ObtenerDetalleBucketMesUseCase` (Result<T,E>, periodo resolution per US-049 template) + pure `agruparDetallePorCategoria` service (mirror web helper, BigInt). DTO + Zod schema + route entry + container wiring + openapi append (end of paths map, deterministic). No new domain VO/errors. Order: application → infrastructure, TDD (ADR-016). ADRs: 005/008 (no cross-layer abstraction of grouping), 015 (PII), 024 (presentation math).

## Decisions

**Pinned:** ① % vs meta (H1) = gasto acumulado del bucket ÷ meta del mes, en bp (metaBp from BANDAS_SEMAFORO; month income via IResumenMesReader). ② Allowlist 4 buckets; Ingresos → 400. ③ No backend pagination. ④ es-CL alpha, Sin categoría last.

**Resolved here:**
1. **Path** `GET /api/buckets/:bucket/detalle` — US-049 sibling precedent; flat endpoint keeps serving dashboard until US-053. Rejected: in-place evolution (breaks panel today), new SQL (DRY, YAGNI).
2. **totalCategorias, Sin categoría bucket = 1** — groups count in payload (synthetic group included); a "0 categorías" header beside one rendered group is wrong.
3. **PII trim** — tx carries only {id, fecha, descripcion, monto}; banco/tipoCuenta/numeroCuenta dropped (CA-02 list; ADR-015); flat endpoint keeps full shape.
4. **% vs meta null for Sin categoría** — metaBp null ⇒ porcentajeBp null; BANDAS_SEMAFORO stays single source of truth (CA-03).

## Rollback / Compatibility

Additive — revert the PR. Flat endpoint, dashboard panel and interim drill-down keep working until US-053 (retirement registered in spec). Regenerate openapi.json after revert.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Grouping drifts from web helper (3rd impl) | Med | Mirror tests pin documented rules; no cross-layer abstraction (ADR-005/008) |
| % math double-rounding | Med | H1 single-shot; boundary tests vs `porcentajeBasisPoints` |
| Isolation leak | Low | Hermetic test: 401 + two-user isolation (`app.buckets.spec.ts` pattern, RNF-SEC-006) |
| Oversized payload | Low | Bounded by one bucket-month; future per-group `?page=` noted (YAGNI) |

## Success Criteria

- [ ] MBD-01..06 scenarios green (spec phase).
- [ ] Hermetic: 401 without session; userId reaches use case; 400 includes scrub assertion.
- [ ] `tsc --noEmit`, lint, openapi drift gates green; no DB migration.