/**
 * agrupar-categorias-por-bucket.spec.ts (US-044 PR5a, T5a.1)
 *
 * Judgment-anticipated class 2 — list ORDER pinning: every assertion about
 * group order uses `toEqual` over the full array, never `toContain`. This
 * prevents a future re-order from producing a green test on a wrong sequence.
 *
 * MCFG-MCTG-08 "server-unknown bucket still lists" scenario: an unrecognised
 * bucket value is collected into a trailing `'Otros'` group, never rejected.
 */

import { agruparPorBucket } from './agrupar-categorias-por-bucket';
import type { CategoriaDto } from './catalogo.types';

function categoria(
  overrides: Pick<CategoriaDto, 'id' | 'nombre' | 'bucket'>,
): CategoriaDto {
  return {
    id: overrides.id,
    nombre: overrides.nombre,
    bucket: overrides.bucket,
    patrones: [],
    transaccionesCount: 0,
  };
}

describe('agruparPorBucket', () => {
  it('agrupa en el orden fijo Necesidades → Deseos → Ahorro (judgment-anticipated class 2: toEqual, never toContain)', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Ahorro programado', bucket: 'Ahorro' }),
      categoria({ id: '2', nombre: 'Supermercado', bucket: 'Necesidades' }),
      categoria({ id: '3', nombre: 'Streaming', bucket: 'Deseos' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
    ]);
    expect(grupos[0]?.categorias).toEqual([
      categoria({ id: '2', nombre: 'Supermercado', bucket: 'Necesidades' }),
    ]);
  });

  it('descarta grupos vacíos — un usuario sin nada en Ahorro no ve el heading Ahorro', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Supermercado', bucket: 'Necesidades' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual(['Necesidades']);
  });

  it('bucket no reconocido va al grupo Otros al FINAL (MCFG-MCTG-08 — server-unknown bucket still lists)', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Supermercado', bucket: 'Necesidades' }),
      categoria({ id: '2', nombre: 'Rara', bucket: 'BucketDesconocido' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual(['Necesidades', 'Otros']);
    expect(grupos[1]?.categorias).toEqual([
      categoria({ id: '2', nombre: 'Rara', bucket: 'BucketDesconocido' }),
    ]);
  });

  it('múltiples buckets desconocidos se agrupan todos en Otros (no un grupo por bucket raro)', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Rara1', bucket: 'Raro' }),
      categoria({ id: '2', nombre: 'Rara2', bucket: 'TambiénRaro' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual(['Otros']);
    expect(grupos[0]?.categorias).toHaveLength(2);
  });

  it('sin categorías, no produce ningún grupo (ni siquiera Otros)', () => {
    expect(agruparPorBucket([])).toEqual([]);
  });

  it('con todas las categorías en un bucket desconocido, Otros aparece sin grupos asignables antes', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Rara', bucket: 'Inesperado' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.bucket).toBe('Otros');
  });

  it('entradas intercaladas: conocidos y desconocidos mezclados → grupos conocidos en orden BUCKETS_ASIGNABLES, Otros al FINAL', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Supermercado', bucket: 'Necesidades' }),
      categoria({ id: '2', nombre: 'Rara', bucket: 'BucketDesconocido' }),
      categoria({ id: '3', nombre: 'Streaming', bucket: 'Ahorro' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos.map((g) => g.bucket)).toEqual([
      'Necesidades',
      'Ahorro',
      'Otros',
    ]);
    expect(grupos[2]?.categorias).toEqual([
      categoria({ id: '2', nombre: 'Rara', bucket: 'BucketDesconocido' }),
    ]);
  });

  it('orden dentro de un grupo respeta el orden original del array — ORDER pinning (judgment-anticipated class 2)', () => {
    const categorias: CategoriaDto[] = [
      categoria({ id: '1', nombre: 'Z-primera', bucket: 'Necesidades' }),
      categoria({ id: '2', nombre: 'A-segunda', bucket: 'Necesidades' }),
    ];

    const grupos = agruparPorBucket(categorias);

    expect(grupos[0]?.categorias.map((c) => c.id)).toEqual(['1', '2']);
  });
});
