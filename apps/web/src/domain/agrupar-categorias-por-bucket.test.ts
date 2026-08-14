import { describe, expect, it } from 'vitest';
import { agruparPorBucket } from './agrupar-categorias-por-bucket';
import type { CategoriaDto } from '../api/types';

/**
 * agruparPorBucket (US-043, design.md §1/Q4c, WCTG-02): pura, sin React. Los
 * tres grupos asignables en orden fijo (`Necesidades`, `Deseos`, `Ahorro`),
 * grupos vacíos descartados, y un fallback `Otros` para cualquier bucket
 * fuera de `BUCKETS_ASIGNABLES` (inalcanzable hoy vía la API deployada, pero
 * existe para que una categoría con un bucket inesperado LISTE en vez de
 * desaparecer — design.md Q4c).
 */
function categoria(
  overrides: Partial<CategoriaDto> & { readonly bucket: string },
): CategoriaDto {
  return {
    id: overrides.id ?? `cat-${overrides.nombre ?? overrides.bucket}`,
    nombre: overrides.nombre ?? 'Categoría',
    bucket: overrides.bucket,
    patrones: overrides.patrones ?? [],
    transaccionesCount: overrides.transaccionesCount ?? 0,
  };
}

describe('agruparPorBucket', () => {
  it('agrupa en los tres buckets asignables, en orden fijo Necesidades, Deseos, Ahorro', () => {
    const categorias: CategoriaDto[] = [
      categoria({ nombre: 'Ahorro programado', bucket: 'Ahorro' }),
      categoria({ nombre: 'Supermercado', bucket: 'Necesidades' }),
      categoria({ nombre: 'Streaming', bucket: 'Deseos' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
    ]);
    expect(grupos[0]?.categorias).toEqual([
      categoria({ nombre: 'Supermercado', bucket: 'Necesidades' }),
    ]);
  });

  it('descarta grupos vacíos — un usuario sin nada en Ahorro no ve el heading Ahorro', () => {
    const categorias: CategoriaDto[] = [
      categoria({ nombre: 'Supermercado', bucket: 'Necesidades' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual(['Necesidades']);
  });

  it('agrega un grupo Otros al final para buckets fuera de BUCKETS_ASIGNABLES, sin hacer desaparecer la categoría', () => {
    const categorias: CategoriaDto[] = [
      categoria({ nombre: 'Supermercado', bucket: 'Necesidades' }),
      categoria({ nombre: 'Rara', bucket: 'Inesperado' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual(['Necesidades', 'Otros']);
    expect(grupos[1]?.categorias).toEqual([
      categoria({ nombre: 'Rara', bucket: 'Inesperado' }),
    ]);
  });

  it('sin categorías, no produce ningún grupo (ni siquiera Otros)', () => {
    expect(agruparPorBucket([])).toEqual([]);
  });
});
