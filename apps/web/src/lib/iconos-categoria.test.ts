import { describe, expect, it } from 'vitest';
import { Tag } from 'lucide-react';
import { ICONOS_CATEGORIA } from '@/api/catalogo-constantes';
import { ETIQUETA_ICONO, iconoCategoria } from './iconos-categoria';

describe('ETIQUETA_ICONO (CATICO-08)', () => {
  it('is total over every allowlisted icono — one Spanish label per name', () => {
    for (const nombre of ICONOS_CATEGORIA) {
      expect(typeof ETIQUETA_ICONO[nombre]).toBe('string');
      expect(ETIQUETA_ICONO[nombre].length).toBeGreaterThan(0);
    }
  });

  it('never exposes the raw lucide identifier as the label', () => {
    for (const nombre of ICONOS_CATEGORIA) {
      expect(ETIQUETA_ICONO[nombre]).not.toBe(nombre);
    }
  });
});

describe('iconoCategoria (CATICO-06)', () => {
  it('resolves every allowlisted name to its lucide component', () => {
    for (const nombre of ICONOS_CATEGORIA) {
      expect(iconoCategoria(nombre)).not.toBe(Tag);
    }
  });

  it('falls back to Tag for null', () => {
    expect(iconoCategoria(null)).toBe(Tag);
  });

  it('falls back to Tag for undefined', () => {
    expect(iconoCategoria(undefined)).toBe(Tag);
  });

  it('falls back to Tag for a retired/unrecognized name — never throws', () => {
    expect(iconoCategoria('not-a-real-icon')).toBe(Tag);
    expect(iconoCategoria('home')).toBe(Tag);
  });
});
