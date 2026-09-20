/**
 * SelectorPalabrasPatronMobile — the word-picking widget for "patrón desde
 * movimiento" (issue #745), RN port of web's `SelectorPalabrasPatron.tsx`
 * (`apps/web/src/components/SelectorPalabrasPatron.tsx`). The pattern text
 * is NEVER guessed by the app: the description is shown split into words,
 * and the user builds the pattern by tapping the words that identify the
 * merchant.
 *
 * Contiguity is enforced by the INTERACTION itself, not validated
 * afterwards (owner-approved design, hard rule, mirrored from web): each
 * tap routes through `alternarPalabra`
 * (`domain/seleccion-contigua-palabras.ts`), a pure reducer whose
 * `RangoPalabras` return type can only ever represent a contiguous
 * inclusive range — there is no way for this component to end up with a
 * non-contiguous selection to reject.
 *
 * The preview (`patronDesdeRango`) is the literal substring of the
 * ORIGINAL description spanning the selected words, never a rejoin of the
 * split tokens — this is what guarantees the saved pattern is a real
 * substring of the description (a `CONTAINS` match by construction,
 * ADR-024: the client never re-implements `coincide()`'s matching logic).
 *
 * a11y (issue #745 wiring contract): every word is a real `Pressable` with
 * `accessibilityRole="button"`, `accessibilityState={{ selected }}` and an
 * `accessibilityLabel` — never a bare `Text`. Touch targets are >= 24px at
 * 360px width (`minHeight: 32` + padding, comfortably above the floor).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  palabrasDeDescripcion,
  patronDesdeRango,
} from '../../domain/palabras-de-descripcion';
import { alternarPalabra } from '../../domain/seleccion-contigua-palabras';
import type { RangoPalabras } from '../../domain/seleccion-contigua-palabras';

export interface SelectorPalabrasPatronMobileProps {
  readonly descripcion: string;
  readonly pending?: boolean;
  readonly onConfirmar: (patron: string) => void;
  readonly onCancelar: () => void;
}

export function SelectorPalabrasPatronMobile({
  descripcion,
  pending = false,
  onConfirmar,
  onCancelar,
}: SelectorPalabrasPatronMobileProps) {
  const palabras = palabrasDeDescripcion(descripcion);
  const [rango, setRango] = useState<RangoPalabras | null>(null);

  const patron =
    rango === null
      ? null
      : patronDesdeRango(descripcion, palabras, rango.inicio, rango.fin);

  function alTocarPalabra(indice: number) {
    if (pending) return;
    setRango((actual) => alternarPalabra(actual, indice));
  }

  function confirmar() {
    if (patron === null || pending) return;
    onConfirmar(patron);
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#2D2F3A' }}>
        Elige las palabras que identifican a este comercio:
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {palabras.map((palabra, indice) => {
          const seleccionada =
            rango !== null && indice >= rango.inicio && indice <= rango.fin;
          return (
            <Pressable
              key={`${palabra.inicio}-${palabra.texto}`}
              accessibilityRole="button"
              accessibilityLabel={palabra.texto}
              accessibilityState={{ selected: seleccionada, disabled: pending }}
              testID={`patron-palabra-${indice}`}
              onPress={() => alTocarPalabra(indice)}
              style={{
                minHeight: 32,
                justifyContent: 'center',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: seleccionada ? '#3B4266' : '#EBEBEE',
                backgroundColor: seleccionada
                  ? 'rgba(59, 66, 102, 0.1)'
                  : 'transparent',
                opacity: pending ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: seleccionada ? '#2D2F3A' : '#8A8F9C',
                }}
              >
                {palabra.texto}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: 12, color: '#8A8F9C' }}>
        {patron === null
          ? 'Selecciona al menos una palabra.'
          : `Se guardará como: «${patron}»`}
      </Text>

      <View
        style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          testID="patron-cancelar"
          onPress={onCancelar}
          style={{
            minHeight: 32,
            justifyContent: 'center',
            paddingHorizontal: 8,
          }}
        >
          <Text style={{ fontSize: 13, color: '#8A8F9C' }}>Cancelar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar patrón"
          accessibilityState={{ disabled: patron === null || pending }}
          testID="patron-guardar"
          disabled={patron === null || pending}
          onPress={confirmar}
          style={{
            minHeight: 32,
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: patron === null || pending ? '#C6C9D6' : '#3B4266',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>
            Guardar patrón
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
