import { resolverEstiloSemaforo } from './semaforo-estilos';

// US-050 PR4b (design §1.7/D-12): the estado → {label, cara, icon, bg} table
// extracted out of `SemaforoBadge`, so `SemaforoTag` (and any future
// indicator) reads ONE table instead of a second, driftable copy — mirrors
// web's own US-047 D-06 extraction (`lib/semaforo-estilos.ts`).
describe('resolverEstiloSemaforo', () => {
  it.each([
    ['verde', 'Verde'],
    ['amarillo', 'Amarillo'],
    ['rojo', 'Rojo'],
  ])('resolves a distinct label for "%s"', (estado, labelEsperado) => {
    expect(resolverEstiloSemaforo(estado).label).toBe(labelEsperado);
  });

  it('resolves null to SIN_DATOS', () => {
    expect(resolverEstiloSemaforo(null).label).toBe('Sin datos');
  });

  it('resolves an unknown estado to SIN_DATOS, never a known colour', () => {
    const estilo = resolverEstiloSemaforo('turquesa');
    expect(estilo.label).toBe('Sin datos');
    expect(estilo).not.toBe(resolverEstiloSemaforo('verde'));
  });
});
