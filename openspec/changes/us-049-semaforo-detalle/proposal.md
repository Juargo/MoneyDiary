# Proposal: US-049 — Semáforo Detail Page

## Intent

`/semaforo` is a stub (`WG5-09`) reachable from 13 live entry points shipped by US-047/048. Users see a colour but never learn **why** it is that colour or **what to do**. This change fills the page with an explanatory and actionable view: the worst-of-3 rule made explicit, per-bucket bands, and a CLP amount that returns each off-track bucket to Verde. All arithmetic and copy stay backend-side (ADR-024).

## Scope

### In Scope
- New sibling endpoint `GET /api/resumen/semaforo?periodo=` with its own DTO, reusing `IResumenMesReader` (no duplicated query).
- Domain: zone-band edges on the wire (the 8 private constants in `estado-semaforo.ts`), backend-generated Spanish one-line diagnosis, CLP-to-Verde per bucket with `direccion: 'reducir' | 'aumentar'`.
- Web page: header (mes + static badge + diagnosis), worst-of-3 explainer, three bucket cards with a new zone bar, Sin categoría warning (count + total + link to `/buckets/SinCategoria`), no-income explanation.
- Adopt the dead `SemaforoBadge` as the static header badge — closes issue **#382** by genuine reuse.
- Fix the CA-08 bug: the stub's "Volver" drops `periodo`.

### Out of Scope
- Month-over-month trends; mobile version of the page.
- Any change to the `/api/resumen` payload or to Ingresos drill-down.

## Capabilities

### New Capabilities
- `resumen-semaforo`: detail endpoint contract — bands on the wire, diagnosis sentence, CLP-to-Verde advice including Ahorro's bidirectional case, rounding correctness against `porcentajeBasisPoints`.

### Modified Capabilities
- `web-app`: new `WSEM-*` requirement family; supersedes `WG5-09` (stub) and adds back-link period preservation.
- `user-data-isolation`: `ISO-02` grows from 4 to 5 covered data endpoints.

## Approach

| Layer | Change |
|-------|--------|
| `domain/value-objects/semaforo-detalle.ts` (new) | Pure functions: band table export, `diagnosticar()` (Spanish), `montoParaVerde()` (BigInt, `direccion`). `estado-semaforo.ts` keeps classification only (SRP). |
| `application/use-cases/obtener-semaforo-detalle` | Mirrors `CalcularResumenMesUseCase` periodo resolution; composes `ResumenMes` + detail fields. `Result<T,E>`. |
| `infrastructure` | DTO mapper (BigInt→string), Zod schema, `openapi-document.ts` entry, `registrarResumenSemaforo` in `resumen.routes.ts`, wiring in `container.ts`. |
| `apps/web` | `use-resumen-semaforo.ts` hook (per `use-resumen.ts`), page composition replacing `SemaforoStub`, new accessible zone-bar component, `semaforo-estilos` reuse, `Link search={{ periodo }}`. |

Ahorro advice keeps two framings: low side imperative ("para volver a Verde, Ahorro necesita subir $X"), high side informational ("estás ahorrando por sobre la banda — podés liberar $X sin salir de Verde").

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/domain/value-objects/` | New + Modified | New `semaforo-detalle.ts`; export bands from `estado-semaforo.ts` |
| `apps/api/src/application/use-cases/` | New | Detail use case |
| `apps/api/src/infrastructure/http{,-express}/` | New | DTO, Zod schema, route, openapi entry |
| `apps/api/src/composition/container.ts` | Modified | `crear-*` + wiring |
| `openapi.json`, `@moneydiary/api-client` | Modified | Regenerated; two CI drift gates |
| `apps/web/src/routes/_authenticated/semaforo.tsx` | Modified | Stub → real page, back-link fix |
| `apps/web/src/{api,components,lib}/` | New + Modified | Hook, zone bar, `SemaforoBadge` adoption |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CLP-to-Verde off-by-one: advice does not actually land the bucket in Verde | High | Derive against `porcentajeBasisPoints` round-half-up; mandatory boundary unit tests (re-apply the amount, assert recomputed bp ≤ `verdeMax`) |
| Band values duplicated client-side and drifting | Med | Bands travel on the wire; a web test asserts no hardcoded threshold literal |
| Zone bar conveys state by colour alone | Med | Bar `aria-hidden`; bp, edges and estado rendered as text (ADR-018, WCAG 2.2 AA) |
| New route leaks another user's data | Low | `app.resumen-semaforo.spec.ts`: 401-without-session + two-user isolation (RNF-SEC-006, per `app.buckets.spec.ts`) |
| Backend-owned Spanish copy sets a new house precedent | Low | Single-locale app; copy is domain logic and unit-tested; documented in the spec |

## Rollback Plan

Additive and revertible in one step: revert the PR(s). The new endpoint has no consumers other than the new page, no schema/migration is involved, and `/api/resumen` is untouched, so the dashboard and mobile are unaffected. Partial rollback (web only) leaves an unused endpoint — harmless. Regenerate `openapi.json` + api-client after reverting to clear the drift gates.

## Dependencies

- US-047/US-048 entry points already live (they are).
- Contract chain regeneration (ADR-011/012) must run before the web slice compiles.

## Success Criteria

- [ ] **CA-01** Header shows mes, estado global and the diagnosis literal.
- [ ] **CA-02** Diagnosis is backend-generated and names the driving bucket.
- [ ] **CA-03** Page states explicitly that global = worst of the 3 buckets.
- [ ] **CA-04** Each bucket shows % vs meta, own estado and a zone bar with the code-verified bands (Nec ≤50/≤60, Des ≤30/≤40, Ahorro 20–40 verde / 10–20 & 40–50 amarillo).
- [ ] **CA-05** Every Amarillo/Rojo bucket shows a CLP amount with the correct direction; Ahorro covers both sides.
- [ ] **CA-06** Sin categoría warning shows count + total and links to its bucket detail.
- [ ] **CA-07** A month with no income explains itself instead of rendering empty percentages.
- [ ] **CA-08** Deep link honours `periodo`, and "Volver" returns to the dashboard on the same month.
- [ ] Isolation + 401 tests green for the new route; `openapi.json`/api-client drift gates green; issue #382 closed.
