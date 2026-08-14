import { describe, expect, it } from 'vitest';
import { agruparDetallePorCategoria } from './agrupar-detalle-por-categoria';
import type { DetalleBucketTransaccionDto } from '../api/types';

// agruparDetallePorCategoria (US-013 S6a, WCAT-02): pure grouping of a single
// bucket's transactions by categoría. Money side (cargo vs abono) mirrors the
// backend's calcular-resumen-mes discipline (Ingreso sums abono, every other
// bucket sums cargo) — see calcular-resumen-mes.use-case.ts. Subtotals are
// computed via BigInt from the raw decimal strings, never Number/parseFloat.

function tx(
  overrides: Partial<DetalleBucketTransaccionDto> & { id: string },
): DetalleBucketTransaccionDto {
  return {
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Movimiento',
    cargo: '0',
    abono: '0',
    banco: 'BancoEstado',
    tipoCuenta: 'CuentaRUT',
    numeroCuenta: '12345678',
    categoria: null,
    ...overrides,
  };
}

describe('agruparDetallePorCategoria', () => {
  it('groups rows by categoria.nombre, one group per distinct categoría present', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '10000',
        categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
      }),
      tx({
        id: 'tx-2',
        cargo: '5000',
        categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
      }),
      tx({
        id: 'tx-3',
        cargo: '2000',
        categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    expect(grupos).toHaveLength(2);
    const supermercado = grupos.find((g) => g.nombre === 'Supermercado');
    expect(supermercado?.conteo).toBe(2);
    expect(supermercado?.subtotalLabel).toBe('$12.000');
  });

  it('groups rows with categoria === null under a "Sin categoría" group', () => {
    const filas = [
      tx({ id: 'tx-1', cargo: '3000', categoria: null }),
      tx({
        id: 'tx-2',
        cargo: '10000',
        categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    const sinCategoria = grupos.find((g) => g.nombre === 'Sin categoría');
    expect(sinCategoria).toBeDefined();
    expect(sinCategoria?.categoriaId).toBeNull();
    expect(sinCategoria?.conteo).toBe(1);
    expect(sinCategoria?.subtotalLabel).toBe('$3.000');
  });

  it('computes the subtotal via BigInt — a value beyond Number.MAX_SAFE_INTEGER preserves every digit', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '9007199254740993',
        categoria: { id: 'categoria-salud', nombre: 'Salud' },
      }),
      tx({
        id: 'tx-2',
        cargo: '9007199254740993',
        categoria: { id: 'categoria-salud', nombre: 'Salud' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    // Exact sum: 18014398509481986 — a float sum here would silently lose
    // the last digit(s) due to precision loss beyond 2^53.
    expect(grupos[0].subtotalLabel).toBe('$18.014.398.509.481.986');
  });

  it('orders groups alphabetically (es-CL), "Sin categoría" always last (WCAT-02 delta)', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '1',
        categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
      }),
      tx({ id: 'tx-2', cargo: '1', categoria: null }),
      tx({
        id: 'tx-3',
        cargo: '1',
        categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
      }),
      tx({
        id: 'tx-4',
        cargo: '1',
        categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    expect(grupos.map((g) => g.nombre)).toEqual([
      'Farmacia',
      'Supermercado',
      'Transporte',
      'Sin categoría',
    ]);
  });

  it('orders accented/ñ names correctly under the es-CL locale, "Sin categoría" last (WCAT-02 delta)', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '1',
        categoria: { id: 'categoria-nandu', nombre: 'Ñandú' },
      }),
      tx({
        id: 'tx-2',
        cargo: '1',
        categoria: { id: 'categoria-zapatos', nombre: 'Zapatos' },
      }),
      tx({
        id: 'tx-3',
        cargo: '1',
        categoria: { id: 'categoria-ahorro', nombre: 'Ahorro' },
      }),
      tx({ id: 'tx-4', cargo: '1', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    // The case that fails under a naive `<` comparison — pins why the
    // locale ('es-CL') must be explicit rather than the runtime default.
    expect(grupos.map((g) => g.nombre)).toEqual([
      'Ahorro',
      'Ñandú',
      'Zapatos',
      'Sin categoría',
    ]);
  });

  it('a category literally named "Sin categoría" sorts last and merges visually with the synthetic group (accepted edge case)', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '1',
        categoria: { id: 'categoria-literal', nombre: 'Sin categoría' },
      }),
      tx({
        id: 'tx-2',
        cargo: '1',
        categoria: { id: 'categoria-ahorro', nombre: 'Ahorro' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    expect(grupos.map((g) => g.nombre)).toEqual(['Ahorro', 'Sin categoría']);
  });

  it('only produces groups for categorías actually present in the data (no empty groups)', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '1',
        categoria: { id: 'categoria-streaming', nombre: 'Streaming' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Deseos');

    expect(grupos).toHaveLength(1);
    expect(grupos[0].nombre).toBe('Streaming');
  });

  it('sums abono (not cargo) for the Ingreso bucket — mirrors calcular-resumen-mes money discipline', () => {
    const filas = [
      tx({ id: 'tx-1', cargo: '0', abono: '75000', categoria: null }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Ingreso');

    expect(grupos[0].subtotalLabel).toBe('$75.000');
  });

  it('returns an empty array for an empty transacciones list', () => {
    expect(agruparDetallePorCategoria([], 'Ahorro')).toEqual([]);
  });

  it('each row in a group carries its own view-model row shape (reused from aFilaViewModel)', () => {
    const filas = [
      tx({
        id: 'tx-1',
        cargo: '5000',
        descripcion: 'Farmacia Cruz Verde',
        categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
      }),
    ];

    const grupos = agruparDetallePorCategoria(filas, 'Necesidades');

    expect(grupos[0].filas[0]).toMatchObject({
      id: 'tx-1',
      descripcion: 'Farmacia Cruz Verde',
      cargoLabel: '$5.000',
      abonoLabel: '$0',
    });
  });
});
