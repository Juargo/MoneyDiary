/**
 * OfrecerPatronMobileControl — the non-blocking, dismissible offer to turn
 * a just-reclassified movement into a classification pattern (issue #745),
 * RN port of web's `OfrecerPatronControl.tsx`
 * (`apps/web/src/components/OfrecerPatronControl.tsx`). The usability
 * finding this closes: after reclassifying a movement, nothing ever
 * offered to make it stick.
 *
 * Two stages, both dismissible without touching the reclassification that
 * already succeeded (the caller mounts this ONLY after that commit
 * settles — see `ReclasificarMobileControl`):
 *   1. "oferta" — a one-line prompt + "Crear patrón" / "Ahora no".
 *   2. "seleccion" — `SelectorPalabrasPatronMobile` (the word-picking
 *      widget), wired to the EXISTING `POST /api/patrones` mutation
 *      (`crearPatron`, already used by Configuración → Categorías's
 *      patrones editor) — no new endpoint, no client-side reimplementation
 *      of `coincide()`'s matching logic (ADR-024). `matchType` is always
 *      `'CONTAINS'`, mirroring web (YAGNI: this flow's whole point is
 *      skipping the manual matchType/patrón form).
 *
 * A failed creation renders inline (`accessibilityRole="alert"`, the same
 * `mensajeDeErrorCatalogo` table every other mobile catalog mutation uses)
 * and keeps the picker mounted so the user can retry or back out — it
 * NEVER calls `onCerrar` or `onCreado` on its own, and it never touches
 * the reclassification, which already committed before this component
 * existed on screen.
 *
 * Focus discipline: mounting this does NOT call `AccessibilityInfo` itself
 * — the caller (`BucketDetalleScreen`) already announced "Movida a …"
 * through its own shared mechanism; this offer is reachable on screen
 * without stealing focus/announcing again on mount.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { crearPatron } from '../../api/categorias';
import { mensajeDeErrorCatalogo } from '../../domain/mensajes-catalogo';
import { SelectorPalabrasPatronMobile } from './SelectorPalabrasPatronMobile';

export interface OfrecerPatronMobileControlProps {
  readonly descripcion: string;
  readonly categoriaId: string;
  /** Fires once the pattern is actually saved, with the exact pattern text sent. */
  readonly onCreado: (patron: string) => void;
  /** Fires when the offer is dismissed WITHOUT creating a pattern. Never fires after a successful creation. */
  readonly onCerrar: () => void;
}

export function OfrecerPatronMobileControl({
  descripcion,
  categoriaId,
  onCreado,
  onCerrar,
}: OfrecerPatronMobileControlProps) {
  const [etapa, setEtapa] = useState<'oferta' | 'seleccion'>('oferta');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarPatron(patron: string) {
    setEnviando(true);
    setError(null);
    const resultado = await crearPatron({
      categoriaId,
      patron,
      matchType: 'CONTAINS',
    });
    setEnviando(false);
    if (resultado.ok) {
      onCreado(patron);
      return;
    }
    setError(mensajeDeErrorCatalogo(resultado.error));
  }

  return (
    <View
      testID="ofrecer-patron"
      style={{
        gap: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EBEBEE',
        backgroundColor: '#fff',
        padding: 12,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      {etapa === 'oferta' ? (
        <>
          <Text style={{ fontSize: 13, color: '#2D2F3A' }}>
            ¿Reconocer automáticamente este movimiento en tus próximas cartolas?
          </Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ahora no"
              testID="ofrecer-patron-ahora-no"
              onPress={onCerrar}
              style={{
                minHeight: 32,
                justifyContent: 'center',
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: '#8A8F9C' }}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Crear patrón"
              testID="ofrecer-patron-crear"
              onPress={() => setEtapa('seleccion')}
              style={{
                minHeight: 32,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: '#3B4266',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>
                Crear patrón
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <SelectorPalabrasPatronMobile
            descripcion={descripcion}
            pending={enviando}
            onConfirmar={(patron) => void confirmarPatron(patron)}
            onCancelar={onCerrar}
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ fontSize: 12, color: '#D1495B' }}
            >
              {error}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
