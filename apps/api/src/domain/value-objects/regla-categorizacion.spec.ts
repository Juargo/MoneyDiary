import { categorizar, ReglaCategorizacion } from './regla-categorizacion';
import { CATEGORIA_SIN_CATEGORIZAR } from './categoria';
import { GrupoPresupuesto } from './grupo-presupuesto';

const reglas: ReglaCategorizacion[] = [
  {
    patron: /lider|jumbo|supermercado/i,
    categoria: { nombre: 'Alimentación', grupo: GrupoPresupuesto.Necesidades },
  },
  {
    patron: /netflix|spotify/i,
    categoria: { nombre: 'Ocio', grupo: GrupoPresupuesto.Gustos },
  },
  {
    patron: /sueldo|deposito/i,
    categoria: { nombre: 'Ingreso', grupo: GrupoPresupuesto.Ahorro },
  },
];

describe('categorizar', () => {
  it('retorna la categoría de la primera regla que matchea (insensible a mayúsculas)', () => {
    const result = categorizar({ descripcion: 'COMPRA LIDER MAIPU' }, reglas);
    expect(result.nombre).toBe('Alimentación');
    expect(result.grupo).toBe(GrupoPresupuesto.Necesidades);
  });

  it('clasifica Netflix como Ocio dentro de Gustos', () => {
    const result = categorizar({ descripcion: 'Netflix Chile' }, reglas);
    expect(result.nombre).toBe('Ocio');
    expect(result.grupo).toBe(GrupoPresupuesto.Gustos);
  });

  it('clasifica depósitos de sueldo como Ingreso dentro de Ahorro', () => {
    const result = categorizar({ descripcion: 'Deposito Sueldo SPA' }, reglas);
    expect(result.nombre).toBe('Ingreso');
    expect(result.grupo).toBe(GrupoPresupuesto.Ahorro);
  });

  it('devuelve CATEGORIA_SIN_CATEGORIZAR cuando ninguna regla matchea', () => {
    const result = categorizar({ descripcion: 'Algo raro' }, reglas);
    expect(result).toBe(CATEGORIA_SIN_CATEGORIZAR);
    expect(result.grupo).toBe(GrupoPresupuesto.SinCategorizar);
  });

  it('respeta el orden de las reglas — la primera gana', () => {
    const reglasConOverlap: ReglaCategorizacion[] = [
      {
        patron: /pago/i,
        categoria: { nombre: 'Cuentas', grupo: GrupoPresupuesto.Necesidades },
      },
      {
        patron: /pago.*entretenimiento/i,
        categoria: { nombre: 'Ocio', grupo: GrupoPresupuesto.Gustos },
      },
    ];

    const result = categorizar(
      { descripcion: 'Pago suscripción entretenimiento' },
      reglasConOverlap,
    );
    expect(result.nombre).toBe('Cuentas');
  });

  it('con lista de reglas vacía siempre cae al bucket SinCategorizar', () => {
    const result = categorizar({ descripcion: 'cualquier cosa' }, []);
    expect(result).toBe(CATEGORIA_SIN_CATEGORIZAR);
  });
});
