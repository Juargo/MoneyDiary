/**
 * Type aliases over `@moneydiary/api-client`'s generated catálogo DTOs
 * (US-044, design.md §1.5) — mirrors `resumen.types.ts`'s re-export
 * pattern. `CatalogoDto`/`CategoriaDto`/`PatronDto` are one-line indexed
 * accesses defined in `packages/api-client/src/index.ts`; this file exists
 * so `src/api/categorias.ts` and downstream domain helpers (PR5a) import
 * from `src/domain/` (design §0's dependency direction), the same way
 * `resumen.types.ts` re-exports `MeDto` for `client.ts`.
 */
export type {
  CatalogoDto,
  CategoriaDto,
  PatronDto,
} from '@moneydiary/api-client';
