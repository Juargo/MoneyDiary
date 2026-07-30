import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { postIngesta } from '../src/api/post-ingesta';
import type { IngestaResponseDto, PostIngestaError } from '../src/api/post-ingesta';
import { solicitarRecargaResumen } from '../src/api/resumen-refresh';
import { copiaPorApiError } from '../src/api/client';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile upload route (Expo Router `app/subir.tsx`, US-033, ADR-026).
 * Thin container mirroring `app/index.tsx`/`app/login.tsx`'s conventions: a
 * plain `useState` machine `idle | subiendo | exito | error` (design.md
 * Decision 5 — no TanStack Query on mobile).
 *
 * Reached from `app/index.tsx`'s "Subir cartola" entry affordance (B.7),
 * registered under `app/_layout.tsx`'s `Stack.Protected` block (B.6). Uses
 * `expo-document-picker` filtered to `.xlsx`/`.pdf` (CU-08) and delegates the
 * actual upload to `postIngesta` (B.3/B.4). Deliberately does NOT port the
 * web's `validarArchivoWeb`/`LIMITE_SUBIDA_WEB_BYTES` client-side size cap —
 * that constant is web-only (design.md Decision 2's closing line); mobile
 * keeps the backend's real 10 MB limit (CU-09).
 *
 * On success, calls `solicitarRecargaResumen()` (CU-10) instead of
 * navigating back itself — the user can review the result summary here
 * first. On a backend/network failure the screen always returns to a
 * retryable `error` state, never stuck `subiendo` (CU-11).
 *
 * ADR-026 write-scope lock (CU-12): this screen's only interactive control
 * is the upload trigger — no edit/delete affordance for transactions,
 * categories, or ingesta history exists here or anywhere else on mobile.
 */
type Estado =
  | { fase: 'idle' }
  | { fase: 'subiendo' }
  | { fase: 'exito'; dto: IngestaResponseDto }
  | { fase: 'error'; mensaje: string };

const TIPOS_ACEPTADOS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
];

/**
 * mensajeDeError — wraps the shared `copiaPorApiError` (client.ts, review
 * readability fix #7, DRY) to add this screen's one extra case: on a 400,
 * prefer the backend's already-scrubbed Spanish `message` (banco no
 * reconocido, estructura inválida, etc. — CU-04/CU-11) when present.
 */
function mensajeDeError(error: PostIngestaError): string {
  if (error.tag === 'http' && error.message) {
    return error.message;
  }
  return copiaPorApiError(error);
}

/** Spanish summary announced to screen readers on a successful upload (review CRITICAL fix #3). */
function mensajeDeExito(dto: IngestaResponseDto): string {
  return `Cartola subida. Banco ${dto.banco}, cuenta ${dto.numeroCuenta}, ${dto.totalTransacciones} transacciones.`;
}

/** Spanish message shown/announced when the picker itself fails to open (review WARNING fix #4). */
const MENSAJE_ERROR_PICKER = 'No se pudo abrir el selector de archivos. Intenta de nuevo.';

export default function Subir() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });

  const seleccionarArchivo = useCallback(async () => {
    let resultado: DocumentPicker.DocumentPickerResult;
    try {
      resultado = await DocumentPicker.getDocumentAsync({ type: TIPOS_ACEPTADOS });
    } catch {
      setEstado({ fase: 'error', mensaje: MENSAJE_ERROR_PICKER });
      return;
    }
    if (resultado.canceled) {
      return;
    }
    const archivo = resultado.assets[0];
    if (!archivo) {
      return;
    }

    setEstado({ fase: 'subiendo' });
    const subida = await postIngesta(archivo);
    if (!subida.ok) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(subida.error) });
      return;
    }

    setEstado({ fase: 'exito', dto: subida.value });
    solicitarRecargaResumen();
  }, []);

  // Announces the éxito/error transitions to screen readers (review CRITICAL
  // fix #3, WCAG 2.2 AA SC 4.1.3) — the static `accessibilityLabel` on the
  // trigger never re-announces itself, so a state change is otherwise
  // imperceptible to AT users. Mirrors the web sibling's `aria-live` intent
  // (design.md Decision 5).
  useEffect(() => {
    if (estado.fase === 'exito') {
      AccessibilityInfo.announceForAccessibility(mensajeDeExito(estado.dto));
    } else if (estado.fase === 'error') {
      AccessibilityInfo.announceForAccessibility(estado.mensaje);
    }
  }, [estado]);

  const subiendo = estado.fase === 'subiendo';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <View className="flex-1 gap-6 px-8 py-6">
        <Text className="text-center text-2xl font-bold text-heading">Subir cartola</Text>

        <Pressable
          testID="subir-archivo-trigger"
          accessibilityRole="button"
          accessibilityLabel="Seleccionar archivo .xlsx o .pdf para subir"
          accessibilityState={{ disabled: subiendo, busy: subiendo }}
          onPress={() => void seleccionarArchivo()}
          disabled={subiendo}
          className="items-center rounded-full py-3"
          style={{ backgroundColor: COLORS.ingreso, opacity: subiendo ? 0.6 : 1 }}
        >
          <Text className="font-semibold text-white">
            {subiendo ? 'Subiendo…' : 'Seleccionar archivo'}
          </Text>
        </Pressable>

        {estado.fase === 'error' && (
          <>
            <Text
              testID="subir-error"
              accessibilityRole="alert"
              accessibilityLabel={`Error al subir: ${estado.mensaje}`}
              accessibilityLiveRegion="polite"
              className="text-center text-sm text-red-600"
            >
              {estado.mensaje}
            </Text>
            <VolverAlResumen onPress={() => router.back()} />
          </>
        )}

        {estado.fase === 'exito' && (
          <>
            <View
              testID="subir-resultado"
              accessibilityRole="summary"
              accessibilityLabel="Cartola subida correctamente"
              accessibilityLiveRegion="polite"
              className="gap-2 rounded-xl border border-hairline bg-white p-4"
            >
              <Text className="text-base font-semibold text-heading">Cartola subida</Text>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Banco</Text>
                <Text className="text-sm font-medium text-heading">{estado.dto.banco}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Cuenta</Text>
                <Text className="text-sm font-medium text-heading">
                  {estado.dto.numeroCuenta}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Transacciones</Text>
                <Text className="text-sm font-medium text-heading">
                  {estado.dto.totalTransacciones}
                </Text>
              </View>
            </View>
            <VolverAlResumen onPress={() => router.back()} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * "Volver al resumen" back affordance (review SHOULD-fix #5): `_layout.tsx`
 * hides the native header (`headerShown: false`), so without this the user
 * has no on-screen way back to the resumen screen after an éxito/error.
 */
function VolverAlResumen({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      testID="volver-al-resumen"
      accessibilityRole="button"
      accessibilityLabel="Volver al resumen"
      onPress={onPress}
      className="items-center py-3"
    >
      <Text className="text-sm font-semibold text-muted">Volver al resumen</Text>
    </Pressable>
  );
}
