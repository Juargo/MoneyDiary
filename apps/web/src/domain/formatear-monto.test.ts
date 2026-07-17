import { describe, expect, it } from 'vitest'
import { formatearMontoCLP } from './formatear-monto'

describe('formatearMontoCLP', () => {
  it('agrupa los miles con punto y antepone $', () => {
    expect(formatearMontoCLP('1234567')).toBe('$1.234.567')
  })

  it('preserva cada dígito exacto en montos que exceden Number.MAX_SAFE_INTEGER', () => {
    // 2^53 = 9007199254740992 — este valor lo excede en 1.
    expect(formatearMontoCLP('9007199254740993')).toBe('$9.007.199.254.740.993')
  })

  it('formatea el monto cero como $0', () => {
    expect(formatearMontoCLP('0')).toBe('$0')
  })

  it('conserva el signo de los montos negativos', () => {
    expect(formatearMontoCLP('-5000')).toBe('-$5.000')
  })

  it('rechaza montos con decimales (dinero exacto, nunca float)', () => {
    expect(() => formatearMontoCLP('10.5')).toThrow()
  })

  it('rechaza strings no numéricos', () => {
    expect(() => formatearMontoCLP('abc')).toThrow()
  })

  it('rechaza el string vacío', () => {
    expect(() => formatearMontoCLP('')).toThrow()
  })
})
