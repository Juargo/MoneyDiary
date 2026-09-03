/**
 * Shared test fixtures for US-059 PR2 preview components.
 * Imported by FilaRevision.test.tsx and PreviewMuestra.test.tsx to avoid
 * duplicated local factory functions (fix 8, DRY).
 */
import type { PreviewFilaDto, CatalogoEstado } from '@/api/types';

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
    sugerido: null,
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
