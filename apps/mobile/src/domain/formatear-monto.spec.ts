import {
  esMontoStringValido,
  formatearMontoCLP,
  formatearMontoConSigno,
} from './formatear-monto';

describe('formatearMontoCLP', () => {
  it('agrupa los miles con punto y antepone $', () => {
    expect(formatearMontoCLP('1234567')).toBe('$1.234.567');
  });

  it('preserva cada dígito exacto en montos que exceden Number.MAX_SAFE_INTEGER', () => {
    // 2^53 = 9007199254740992 — este valor lo excede en 1.
    expect(formatearMontoCLP('9007199254740993')).toBe(
      '$9.007.199.254.740.993',
    );
  });

  it('formatea el monto cero como $0', () => {
    expect(formatearMontoCLP('0')).toBe('$0');
  });

  it('conserva el signo de los montos negativos', () => {
    expect(formatearMontoCLP('-5000')).toBe('-$5.000');
  });

  it('rechaza montos con decimales (dinero exacto, nunca float)', () => {
    expect(() => formatearMontoCLP('10.5')).toThrow();
  });

  it('rechaza strings no numéricos', () => {
    expect(() => formatearMontoCLP('abc')).toThrow();
  });

  it('rechaza el string vacío', () => {
    expect(() => formatearMontoCLP('')).toThrow();
  });
});

// US-050 (design §1.1): esMontoStringValido es el mismo chequeo que
// formatearMontoCLP aplica antes de lanzar, expuesto como predicado puro
// (sin throw) para que los guards de money-safety en api/client.ts puedan
// reusarlo (DRY) en vez de duplicar el regex o envolver formatearMontoCLP en
// un try/catch. Puerto verbatim de apps/web/src/domain/formatear-monto.ts.
describe('esMontoStringValido', () => {
  it('acepta un entero decimal válido', () => {
    expect(esMontoStringValido('100')).toBe(true);
  });

  it('rechaza el string vacío', () => {
    expect(esMontoStringValido('')).toBe(false);
  });

  it('rechaza strings no numéricos', () => {
    expect(esMontoStringValido('abc')).toBe(false);
  });

  it('rechaza montos con decimales', () => {
    expect(esMontoStringValido('12.5')).toBe(false);
  });

  it('rechaza el signo positivo explícito', () => {
    expect(esMontoStringValido('+100')).toBe(false);
  });

  it('rechaza espacios en blanco alrededor del monto', () => {
    expect(esMontoStringValido(' 100')).toBe(false);
  });

  it('rechaza formatos hexadecimales que BigInt() aceptaría silenciosamente', () => {
    expect(esMontoStringValido('0x10')).toBe(false);
  });
});

// US-050 (design §1.1): formatearMontoConSigno — el signo lo elige el
// caller (kind del item: gasto/sinCategoria '-', ingreso '+'), nunca se lee
// del dato. Puerto verbatim de apps/web/src/domain/formatear-monto.ts.
describe('formatearMontoConSigno', () => {
  it('antepone el signo "+" recibido', () => {
    expect(formatearMontoConSigno('1000', '+')).toBe('+$1.000');
  });

  it('antepone el signo "-" recibido', () => {
    expect(formatearMontoConSigno('400000', '-')).toBe('-$400.000');
  });

  it('la magnitud 0 se renderiza sin prefijo de signo', () => {
    expect(formatearMontoConSigno('0', '+')).toBe('$0');
    expect(formatearMontoConSigno('0', '-')).toBe('$0');
  });
});
