import { describe, expect, it } from 'vitest'
import { esMontoStringValido, formatearMontoCLP } from './formatear-monto'

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

  it('rechaza formatos hexadecimales que BigInt() aceptaría silenciosamente', () => {
    expect(() => formatearMontoCLP('0x10')).toThrow()
  })

  it('rechaza el signo positivo explícito', () => {
    expect(() => formatearMontoCLP('+123')).toThrow()
  })

  it('rechaza espacios en blanco alrededor del monto', () => {
    expect(() => formatearMontoCLP('  123')).toThrow()
  })

  it('rechaza formatos binarios que BigInt() aceptaría silenciosamente', () => {
    expect(() => formatearMontoCLP('0b1')).toThrow()
  })

  it('rechaza formatos octales que BigInt() aceptaría silenciosamente', () => {
    expect(() => formatearMontoCLP('0o7')).toThrow()
  })
})

// esMontoStringValido es el mismo chequeo que formatearMontoCLP aplica antes
// de lanzar, expuesto como predicado puro (sin throw) para que los guards de
// money-safety en api/client.ts puedan reusarlo (DRY) en vez de duplicar el
// regex o envolver formatearMontoCLP en un try/catch.
describe('esMontoStringValido', () => {
  it('acepta un entero decimal válido (positivo o negativo)', () => {
    expect(esMontoStringValido('1234567')).toBe(true)
    expect(esMontoStringValido('-5000')).toBe(true)
    expect(esMontoStringValido('0')).toBe(true)
  })

  it('rechaza el string vacío', () => {
    expect(esMontoStringValido('')).toBe(false)
  })

  it('rechaza strings no numéricos', () => {
    expect(esMontoStringValido('abc')).toBe(false)
  })

  it('rechaza decimales, signo "+", espacios y formatos hex/oct/bin', () => {
    expect(esMontoStringValido('10.5')).toBe(false)
    expect(esMontoStringValido('+123')).toBe(false)
    expect(esMontoStringValido('  123')).toBe(false)
    expect(esMontoStringValido('0x10')).toBe(false)
    expect(esMontoStringValido('0b1')).toBe(false)
    expect(esMontoStringValido('0o7')).toBe(false)
  })
})
