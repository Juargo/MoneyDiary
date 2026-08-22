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

export function unResumen(
  overrides: Partial<{
    totalFilas: number;
    duplicadosDetectados: number;
    nuevas: number;
  }> = {},
): { totalFilas: number; duplicadosDetectados: number; nuevas: number } {
  return {
    totalFilas: 1,
    duplicadosDetectados: 0,
    nuevas: 1,
    ...overrides,
  };
}

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
