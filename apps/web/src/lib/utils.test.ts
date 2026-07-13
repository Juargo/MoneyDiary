import { cn } from './utils'

describe('cn', () => {
  it('incluye solo las clases condicionales activas (sintaxis de objeto de clsx)', () => {
    expect(cn('base', { activa: true, oculta: false })).toBe('base activa')
  })

  it('resuelve conflictos de Tailwind quedándose con la última', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
