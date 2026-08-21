import { aIngresosMesViewModel } from './ingresos-mes-view-model';
import type { IngresosMesDto } from './detalle.types';

// T-04 RED: unit specs for aIngresosMesViewModel (US-056, D-22/T-C2)
// Field is dto.total (NOT totalIngreso — that field does not exist in IngresosMesResponse).

function makeDto(overrides: Partial<IngresosMesDto> = {}): IngresosMesDto {
  return {
    conteo: 3,
    total: '1500000',
    transacciones: [
      {
        id: 'ing-1',
        descripcion: 'Sueldo',
        fecha: '2026-07-01T00:00:00.000Z',
        monto: '1000000',
        origen: 'Banco de Chile',
      },
      {
        id: 'ing-2',
        descripcion: 'Freelance',
        fecha: '2026-07-10T00:00:00.000Z',
        monto: '500000',
        origen: 'Manual',
      },
    ],
    ...overrides,
  };
}

describe('aIngresosMesViewModel', () => {
  it("conteoLabel is '0 ingresos' for conteo=0", () => {
    const vm = aIngresosMesViewModel(
      makeDto({ conteo: 0, transacciones: [] }),
      '2026-07',
    );
    expect(vm.conteoLabel).toBe('0 ingresos');
  });

  it("conteoLabel is '1 ingreso' for conteo=1", () => {
    const vm = aIngresosMesViewModel(makeDto({ conteo: 1 }), '2026-07');
    expect(vm.conteoLabel).toBe('1 ingreso');
  });

  it("conteoLabel is 'N ingresos' for N>1", () => {
    const vm = aIngresosMesViewModel(makeDto({ conteo: 5 }), '2026-07');
    expect(vm.conteoLabel).toBe('5 ingresos');
  });

  it('totalLabel reads dto.total field (not totalIngreso — that field does not exist)', () => {
    // This test verifies we read dto.total. The field totalIngreso does not exist
    // in IngresosMesResponse (types.gen.ts:1962-1976).
    const dto = makeDto({ total: '1500000' });
    // TypeScript should not have a totalIngreso field — it's absent from the type
    expect((dto as Record<string, unknown>).totalIngreso).toBeUndefined();
    const vm = aIngresosMesViewModel(dto, '2026-07');
    expect(vm.totalLabel).toBe('+$1.500.000');
  });

  it("totalLabel for dto.total='1500000' equals '+$1.500.000'", () => {
    const vm = aIngresosMesViewModel(makeDto({ total: '1500000' }), '2026-07');
    expect(vm.totalLabel).toBe('+$1.500.000');
  });

  it("totalLabel for '0' has no sign (zero-no-sign)", () => {
    const vm = aIngresosMesViewModel(makeDto({ total: '0' }), '2026-07');
    expect(vm.totalLabel).toBe('$0');
  });

  it('mesLabel from periodo param', () => {
    const vm = aIngresosMesViewModel(makeDto(), '2026-07');
    expect(vm.mesLabel).toBe('julio 2026');
  });

  it('mesLabel falls back to periodoActualUTC(ahora) when periodo undefined — injectable clock pins the label', () => {
    // Pass a pinned clock: Date.UTC(2026, 5, 15) = 2026-06-15 UTC → periodo '2026-06'
    // → mesCompletoLabel('2026-06') = 'junio 2026'.
    // If the !API_BASE_URL guard were deleted (i.e., the ahora param were ignored
    // and new Date() used instead), the label would vary by wall-clock month.
    const ahora = new Date(Date.UTC(2026, 5, 15)); // June = month index 5
    const vm = aIngresosMesViewModel(makeDto(), undefined, ahora);
    expect(vm.mesLabel).toBe('junio 2026');
  });

  it('origen is verbatim from dto — no client normalization', () => {
    const vm = aIngresosMesViewModel(makeDto(), '2026-07');
    expect(vm.filas[0].origen).toBe('Banco de Chile');
    expect(vm.filas[1].origen).toBe('Manual');
  });
});
