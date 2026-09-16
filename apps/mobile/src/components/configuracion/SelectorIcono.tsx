import { createElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';
import { ICONOS_CATEGORIA } from '../../domain/catalogo-constantes';
import type { IconoCategoria } from '../../domain/catalogo-constantes';
import { ETIQUETA_ICONO, iconoCategoria } from '../iconos-categoria';

/**
 * Touch-target side in points (WCAG 2.5.8). A number, not a `size-11` class:
 * see the component docstring for why rem-based utilities under-render here.
 */
const TAMANO_OPCION_PT = 44;

/** "Sin icono" FIRST, then the 24-name allowlist in picker order (D-05/CATICO-01). */
const OPCIONES: readonly (IconoCategoria | null)[] = [
  null,
  ...ICONOS_CATEGORIA,
];

export interface SelectorIconoProps {
  readonly value: IconoCategoria | null;
  readonly onChange: (value: IconoCategoria | null) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/**
 * SelectorIcono (categoria-iconografia, ADR-045, design.md "UI", MCTG-02/03,
 * CATICO-08) — a 25-option accessible icon picker, following THIS
 * workspace's own radiogroup convention (`SelectorChips.tsx`:
 * `accessibilityRole="radiogroup"` on the container,
 * `accessibilityRole="radio"` + `accessibilityState={{ checked }}` per
 * option) rather than web's native `<input type="radio">` fieldset — mobile
 * has no DOM/keyboard-roving equivalent to port.
 *
 * Each option is a 44pt circular touch target (design's "≥44pt targets",
 * WCAG 2.5.8) with the resolved lucide glyph centered inside — filled
 * (`COLORS.ingreso`) when selected, `COLORS.canvas` otherwise, mirroring
 * `SelectorChips`'s own selected/unselected fill convention.
 *
 * The size is a NUMERIC style, not a `size-11` class: NativeWind's native
 * runtime defaults its `rem` unit to 14 (`react-native-css-interop`'s
 * `unit-observables.ts`), and nothing here overrides it (`global.css` is the
 * three bare `@tailwind` directives, `tailwind.config.js` sets no spacing or
 * root font size), so `size-11` = 2.75rem would render 38.5pt — six under
 * the floor. `ResumenAnual.tsx`'s `style={{ minHeight: 76 }}` is the same
 * idiom. `TAMANO_OPCION_PT` is asserted in the spec so the claim cannot rot.
 *
 * Accessible name per option is `ETIQUETA_ICONO[opcion]` (Spanish,
 * CATICO-08 — "never the raw lucide identifier"); "Sin icono" is already a
 * human-readable Spanish label. Presentational and controlled
 * (container-presentational pattern) — callers (`NuevaCategoriaForm`,
 * `EditarCategoria`) own the `IconoCategoria | null` state and decide when
 * it travels with a mutation (MCTG-02/03).
 *
 * `createElement`, not a JSX tag — see `IconoCategoriaBadge.tsx`'s
 * docstring for why this workspace's `react-hooks/static-components` rule
 * needs this.
 */
export function SelectorIcono({
  value,
  onChange,
  disabled,
  testID,
}: SelectorIconoProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-heading">Icono (opcional)</Text>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel="Icono (opcional)"
        className="flex-row flex-wrap gap-2"
      >
        {OPCIONES.map((opcion) => {
          const seleccionada = opcion === value;
          const etiqueta =
            opcion === null ? 'Sin icono' : ETIQUETA_ICONO[opcion];

          return (
            <Pressable
              key={opcion ?? 'sin-icono'}
              testID={testID ? `${testID}-${opcion ?? 'sin-icono'}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={etiqueta}
              accessibilityState={{ checked: seleccionada, disabled }}
              onPress={() => onChange(opcion)}
              disabled={disabled}
              className="items-center justify-center rounded-full border"
              style={{
                width: TAMANO_OPCION_PT,
                height: TAMANO_OPCION_PT,
                backgroundColor: seleccionada ? COLORS.ingreso : COLORS.canvas,
                borderColor: COLORS.hairline,
              }}
            >
              {createElement(iconoCategoria(opcion), {
                size: 20,
                color: seleccionada ? '#ffffff' : COLORS.heading,
              })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
