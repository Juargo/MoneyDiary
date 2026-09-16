## Exploration: categoria-iconografia

### Current State

**Data model** (`apps/api/prisma/schema.prisma:120-158`). `Categoria` (per-user since ADR-036/037, unique `(userId, bucketId, nombre)` since ADR-042) has NO icon/color field: `id, userId, nombre, bucketId, patrones[], transacciones[]`. `BucketPresupuesto` is just `{id, nombre}` — three fixed assignable buckets (Necesidades/Deseos/Ahorro; `Ingreso`/`SinCategoria` are computed states, never assignable — `BUCKETS_ASIGNABLES` in `crear-categoria.use-case.ts:21`). No icon concept exists anywhere in domain/application/infrastructure.

**Contract surface.** `CategoriaDto` (`infrastructure/http/dto/categoria.dto.ts`) = `{id, nombre, bucket, patrones[], transaccionesCount}`. Zod transport schemas (`categorias.schema.ts`) apply a documented "layer-honesty gate": domain validity rules stay OUT of zod and live in the use case. `.strict()` bodies mean any new field touches: schema + use case + port + DTO + `openapi.json` + `@moneydiary/api-client` regen + BOTH hand-written client type files (`apps/web/src/api/types.ts`, `apps/mobile/src/domain/catalogo.types.ts` — no shared package, ADR-008).

**ADR-027 icon library is installed on BOTH clients**: `apps/mobile/package.json` has `lucide-react-native@1.31.0` + `react-native-svg@15.15.4`; web already uses `lucide-react` in several files.

**A category→icon map exists but is dead code.** `apps/web/src/lib/category-icons.ts` exports `iconoDeCategoria(nombre)`, a `Record<string, LucideIcon>` keyed by the 8 ORIGINAL seed-template names, falling back to generic `Receipt` — its docblock says "decoration only... a user-created categoría falls back." It is imported by nothing except its own test file. The name-keyed static-map approach breaks for user-renamed/created categories post-ADR-036.

**No component today renders a per-category icon.** Verified in `CategoriaFila.tsx` (config list row — nombre + pattern count + edit/delete buttons, not even the bucket), `FilaRevision.tsx` (import review), `GrupoMovimientos.tsx` (bucket-detalle-mes rows). All render category/bucket identity as text + color only.

**Bucket identity today = color tokens only.** `apps/web/src/lib/bucket-colors.ts` maps bucket → Tailwind fill/bg classes (`claseRellenoBucket`/`claseFondoBucket`) backed by `index.css` `--color-necesidades`/`--color-gustos`/`--color-ahorro` tokens (ADR-043, contrast-audited). No bucket glyph exists in web or mobile. A prior bucket-icon attempt (`SelectorBucket` chips + `lib/bucket-icons.ts`) was built then reverted 2026-09-06 back to a plain `<select>` — a UX-fit issue for an input control, not a technical blocker for read-only display.

**`catalogo-template.ts`** (backend seed source) is a plain `{nombre, bucket}` array — no icon field; `copiarCatalogoTemplate()` writes rows without one.

**Reusable drift-guard pattern.** US-043's `catalogo-constantes.mirror.spec.ts` reads backend source as plain text and asserts web's hand-copied constants match — the natural mechanism for keeping a curated icon-name allowlist in sync across api/web/mobile without a shared package.

**Specs are stale.** `openspec/specs/categorias-api/spec.md` still describes a "fixed taxonomy" and lists user-created categories as a Non-Goal — predates ADR-036/037/038. Not blocking; a broader spec refresh is owed independently.

**Backlog.** No existing GitHub issue covers category iconography (searched open+closed for icon/icono/iconografía on 2026-09-15).

### Affected Areas

- `apps/api/prisma/schema.prisma` — nullable `icono` column on `Categoria`; new migration (prod migrations are manual).
- `apps/api/src/infrastructure/persistence/catalogo-template.ts` — optional default icons for the 8 seed categories.
- `apps/api/src/application/use-cases/{crear,actualizar}-categoria.use-case.ts` — validate `icono` against a curated allowlist (mirrors `BUCKETS_ASIGNABLES`), new domain error if invalid.
- `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts`, `infrastructure/http/dto/categoria.dto.ts`, `application/ports/categoria-repository.port.ts` — thread the field through.
- `apps/api/openapi.json` + `pnpm contract:sync` → `@moneydiary/api-client`.
- `apps/web/src/api/types.ts`, `apps/mobile/src/domain/catalogo.types.ts` + runtime guards (`esCategoriaDto`) — hand-mirrored DTOs.
- `apps/web/src/lib/category-icons.ts` — retire or repurpose once icon is a persisted field.
- `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx`, the edit route (`configuracion_.categorias.$categoriaId.tsx`), `NuevaCategoriaDesdeFilaForm.tsx` — icon picker UI + rendering.
- `apps/web/src/components/FilaRevision.tsx`, `GrupoMovimientos.tsx`, `MuestraAgrupada.tsx`, `PreviewMuestra.tsx`, dashboard pie/legend — optional wider rendering surface (separate, larger PR).
- `apps/web/src/lib/bucket-colors.ts` / `index.css` tokens — reusable as the bucket-colored badge behind the category icon.
- `apps/mobile/src/api/categorias.ts`, mobile catálogo screens/forms (ADR-038 parity) — same icon picker using `lucide-react-native`.
- `openspec/specs/{categorias-model,categorias-api,catalogo-clasificacion-ownership,mobile-configuracion,web-app}/spec.md` — new/modified requirements.
- Possibly a NEW ADR (icon persistence/selection mechanism) — ADR-027 only decided the library, not how instances are chosen/stored/validated.

### Approaches

1. **Curated allowlist, server-validated, persisted (`icono: string | null`)** — fixed lucide-name list validated server-side (pattern: `BUCKETS_ASIGNABLES`); each client keeps a static render map, mirror-tested against the backend list.
   - Pros: backend stays sole validity authority (ADR-024); tree-shakeable static imports, no bundle bloat; reuses proven repo patterns (allowlist, mirror-spec, nullable-no-backfill).
   - Cons: adding an icon later needs a coordinated 3-location edit (mitigated by the mirror spec).
   - Effort: Medium.
2. **Free-form/unvalidated lucide name** — any string accepted, dynamically resolved.
   - Pros: no curation maintenance.
   - Cons: violates ADR-024 (no server-side truth); dynamic full-library resolution defeats tree-shaking on both clients; silent failure on mistyped names.
   - Effort: Low to build, High latent cost.
3. **Emoji** — persist a Unicode emoji character.
   - Pros: trivial storage, zero bundle cost.
   - Cons: breaks ADR-027 (unified lucide set) without amending it; inconsistent glyph rendering across iOS/Android/web; awkward to compose with the bucket-color badge.
   - Effort: Low, but requires its own ADR deviation.

### Recommendation

Approach 1 (curated server-validated allowlist, nullable `icono`, per-client static render maps mirror-tested against the backend list). For bucket distinction: do NOT build separate bucket icons (tried once, reverted) — render the category icon inside the existing bucket color token as a colored badge. Skip backfill for existing categories — ship `icono` nullable with a generic fallback icon (YAGNI; an additive nullable column is the lowest-risk shape given manual prod migrations).

### Risks

- Scope inflation across 3 codebases with no shared package (ADR-008) — every field/constant hand-synced 3x (mitigated by mirror-spec pattern).
- High risk of exceeding the 400-line PR budget as a single PR — a chain is likely (forecast belongs to `sdd-tasks`).
- Rendering-scope ambiguity (config screens only vs. every transaction-row surface) swings PR count significantly — must be pinned in the proposal.
- Web/mobile parity: ADR-038 lets mobile CRUD the catalog, so web-only icon selection creates an inconsistent editing surface.
- Orphaned `category-icons.ts` needs an explicit delete-vs-repurpose decision.
- Recommend a NEW ADR (not an ADR-027 amendment), since ADR-027's scope was strictly "which icon library."

### Open Product Decisions (before proposal)

1. Web-only vs. web+mobile in v1.
2. Which read surfaces get icons beyond configuration screens.
3. Curated allowlist size / initial set.
4. Whether seed-template categories get backend-authored default icons at signup.
5. Confirm "icon on bucket-colored badge" as the bucket-distinction answer.

### Ready for Proposal

Yes, once the open product decisions are confirmed.
