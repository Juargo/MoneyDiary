import { describe, expect, it } from 'vitest';
import {
  ShoppingCart,
  Fuel,
  Pill,
  HeartPulse,
  Bus,
  PlayCircle,
  Bike,
  PiggyBank,
  Receipt,
} from 'lucide-react';
import { iconoDeCategoria } from './category-icons';

// WDS-05: every transaction row shows an icon keyed by its categoría's
// name; an unrecognized/missing name renders the generic Receipt fallback
// and never throws (spec scenario: "An unknown categoría shows the generic
// fallback without crashing"). `category-icons.ts` itself is UNCHANGED by
// US-043 §7 — `iconoDeCategoria` already falls back to `Receipt` for a name
// it doesn't recognize, so this fixture only needs to exercise the 8
// entries `ICONO_POR_CATEGORIA` maps; it no longer reads `domain/categoria`
// (retired by §7), just a local list of the same 8 seed-template names.
const NOMBRES_CATEGORIA_FIXTURE = [
  'Supermercado',
  'Combustible',
  'Farmacia',
  'Salud',
  'Transporte',
  'Streaming',
  'Delivery',
  'Ahorro',
] as const;

const ICONO_ESPERADO_POR_CATEGORIA: Record<string, unknown> = {
  Supermercado: ShoppingCart,
  Combustible: Fuel,
  Farmacia: Pill,
  Salud: HeartPulse,
  Transporte: Bus,
  Streaming: PlayCircle,
  Delivery: Bike,
  Ahorro: PiggyBank,
};

describe('iconoDeCategoria', () => {
  it.each(NOMBRES_CATEGORIA_FIXTURE)(
    'resolves the mapped icon for categoría "%s"',
    (nombre) => {
      expect(iconoDeCategoria(nombre)).toBe(
        ICONO_ESPERADO_POR_CATEGORIA[nombre],
      );
    },
  );

  it('resolves the 8 fixture categorías to 8 distinct icons', () => {
    const iconos = NOMBRES_CATEGORIA_FIXTURE.map((nombre) =>
      iconoDeCategoria(nombre),
    );
    expect(new Set(iconos).size).toBe(NOMBRES_CATEGORIA_FIXTURE.length);
  });

  it('falls back to the generic Receipt icon for an unrecognized categoría name', () => {
    expect(iconoDeCategoria('CategoriaInventada')).toBe(Receipt);
  });

  it('falls back to Receipt without throwing for null', () => {
    expect(() => iconoDeCategoria(null)).not.toThrow();
    expect(iconoDeCategoria(null)).toBe(Receipt);
  });

  it('falls back to Receipt without throwing for undefined', () => {
    expect(() => iconoDeCategoria(undefined)).not.toThrow();
    expect(iconoDeCategoria(undefined)).toBe(Receipt);
  });

  it('falls back to Receipt without throwing for an empty string (e.g. SinCategoria)', () => {
    expect(iconoDeCategoria('')).toBe(Receipt);
  });
});
