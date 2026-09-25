/**
 * Shared test fixtures for US-059 PR2 preview components.
 * Imported by FilaRevision.test.tsx and PreviewMuestra.test.tsx to avoid
 * duplicated local factory functions (fix 8, DRY).
 */
import type { PreviewFilaDto, CatalogoEstado } from '@/api/types';

/**
 * Default `sugerido` (preview-acordeon-bucket, 2026-09-25): a real,
 * resolvable `(bucket, categoriaId)` matching `unCatalogo()`'s default
 * Necesidades/`cat-nec-1` category — since issue #778 the backend never
 * sends `sugerido: null` (every non-Ingreso row gets at least that bucket's
 * `Desconocido` fallback, `preview-ingesta.use-case.ts:104-110`), so a
 * classified default is the realistic shape. Tests that specifically need
 * the now-dead `sugerido: null` input (dropped by
 * `agruparFilasPorBucketYCategoria`) or an `Ingreso` row still override it
 * explicitly.
 */
export function unaFilaPreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 0,
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Supermercado Líder',
    cargo: '50000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Necesidades', categoriaId: 'cat-nec-1' },
    ...overrides,
  };
}

/**
 * An income row exactly as the backend sends it: the classifier's Ingreso
 * rule (`abono > 0 && cargo === 0`) yields `{ bucket: 'Ingreso',
 * categoriaId: null }`, and `CommitIngestaUseCase` Rule 2 makes that
 * immutable. Amounts are set to match so the fixture never contradicts the
 * `sugerido` it carries.
 */
export function unaFilaIngreso(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return unaFilaPreview({
    descripcion: 'ABONO SUELDO EMPRESA SPA',
    cargo: '0',
    abono: '900000',
    sugerido: { bucket: 'Ingreso', categoriaId: null },
    ...overrides,
  });
}

/**
 * Returns a default `CatalogoEstado` in the `listo` state with two groups
 * (Necesidades + Deseos) and one category each.
 *
 * @param overrides Shallow-merged into the default object. Passing `grupos`
 * REPLACES the default array entirely — there is no deep merge.
 */
export function unCatalogo(
  overrides: Partial<Extract<CatalogoEstado, { tag: 'listo' }>> = {},
): CatalogoEstado {
  return {
    tag: 'listo',
    grupos: [
      {
        bucket: 'Necesidades',
        categorias: [
          {
            id: 'cat-nec-1',
            nombre: 'Supermercado',
            bucket: 'Necesidades',
            patrones: [],
            transaccionesCount: 0,
          },
        ],
      },
      {
        bucket: 'Deseos',
        categorias: [
          {
            id: 'cat-des-1',
            nombre: 'Restaurantes',
            bucket: 'Deseos',
            patrones: [],
            transaccionesCount: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}
