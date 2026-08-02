import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { postIngesta } from '../src/api/post-ingesta';
import type { IngestaResponseDto, PostIngestaError } from '../src/api/post-ingesta';
import { previewIngesta } from '../src/api/preview-ingesta';
import type { PreviewIngestaDto, PreviewIngestaError } from '../src/api/preview-ingesta';
import {
  CANTIDAD_PREVIEW_DEFECTO,
  OPCIONES_CANTIDAD_PREVIEW,
  formatearFilaPreview,
  sliceMuestra,
} from '../src/domain/preview-cartola';
import type { CantidadPreview } from '../src/domain/preview-cartola';
import { solicitarRecargaResumen } from '../src/api/resumen-refresh';
import { copiaPorApiError } from '../src/api/client';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile upload route (Expo Router `app/subir.tsx`, US-033, ADR-026),
 * upgraded to a two-phase preview-then-confirm flow (US-003 Slice 3,
 * design.md §10.1). Greenfield: mobile had no per-row preview before this
 * change.
 *
 * State machine (design.md §10.1): `idle → previsualizando → preview
 * ↔(Confirmar)→ subiendo → exito` / `error`. Picking a file immediately
 * fires `previewIngesta` (read-only, PREV-02: persists nothing); on success
 * the screen holds BOTH the `PreviewIngestaDto` and the original
 * `DocumentPickerAsset` in the `preview` state. **Confirmar** re-uploads
 * that SAME held asset via the existing `postIngesta` — the "same file"
 * guarantee is structural here: the picker is not re-opened until
 * **Cancelar**, which discards everything back to `idle` and never calls
 * `postIngesta` (CA-04 at the UI layer).
 *
 * The 10/25/50 row-count selector (`cantidad`, CA-01) is local UI state,
 * independent of `Estado` — it only re-slices the already-fetched `muestra`
 * in memory (`sliceMuestra`, PREV-06), never triggers a new request.
 */
type Estado =
  | { fase: 'idle' }
  | { fase: 'previsualizando' }
  | { fase: 'preview'; dto: PreviewIngestaDto; archivo: DocumentPickerAsset }
  | { fase: 'subiendo' }
  | { fase: 'exito'; dto: IngestaResponseDto }
  | { fase: 'error'; mensaje: string };

const TIPOS_ACEPTADOS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
];

/**
 * mensajeDeError — wraps the shared `copiaPorApiError` (client.ts) to add
 * this screen's one extra case: on a 400, prefer the backend's already-
 * scrubbed Spanish `message` when present. Accepts either error union since
 * `PostIngestaError` and `PreviewIngestaError` share the exact same shape
 * (both mirror `ApiError` plus the optional 400 message, PREV-03) — kept as
 * one explicit union rather than relying on structural coincidence.
 */
function mensajeDeError(error: PostIngestaError | PreviewIngestaError): string {
  if (error.tag === 'http' && error.message) {
    return error.message;
  }
  return copiaPorApiError(error);
}

/** Spanish summary announced to screen readers on a successful upload. */
function mensajeDeExito(dto: IngestaResponseDto): string {
  return `Cartola subida. Banco ${dto.banco}, cuenta ${dto.numeroCuenta}, ${dto.totalTransacciones} transacciones.`;
}

/** Spanish summary announced when the preview is ready (design.md §10.3). */
function mensajeDePreviewListo(dto: PreviewIngestaDto): string {
  return `Vista previa lista. Banco ${dto.banco}, ${dto.estructura.totalFilasDatos} movimientos. Revisa y confirma.`;
}

/** Spanish message shown/announced when the picker itself fails to open. */
const MENSAJE_ERROR_PICKER = 'No se pudo abrir el selector de archivos. Intenta de nuevo.';

export default function Subir() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });
  const [cantidad, setCantidad] = useState<CantidadPreview>(CANTIDAD_PREVIEW_DEFECTO);

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

    setEstado({ fase: 'previsualizando' });
    const preview = await previewIngesta(archivo);
    if (!preview.ok) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(preview.error) });
      return;
    }

    setCantidad(CANTIDAD_PREVIEW_DEFECTO);
    setEstado({ fase: 'preview', dto: preview.value, archivo });
  }, []);

  const confirmar = useCallback(async () => {
    if (estado.fase !== 'preview') {
      return;
    }
    const { archivo } = estado;
    setEstado({ fase: 'subiendo' });
    const subida = await postIngesta(archivo);
    if (!subida.ok) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(subida.error) });
      return;
    }

    setEstado({ fase: 'exito', dto: subida.value });
    solicitarRecargaResumen();
  }, [estado]);

  const cancelar = useCallback(() => {
    setEstado({ fase: 'idle' });
    setCantidad(CANTIDAD_PREVIEW_DEFECTO);
  }, []);

  // Announces preview-ready/éxito/error transitions to screen readers
  // (WCAG 2.2 AA SC 4.1.3, design.md §10.3) — mirrors the pre-US-003
  // announcement pattern, extended with the new `preview` phase.
  useEffect(() => {
    if (estado.fase === 'preview') {
      AccessibilityInfo.announceForAccessibility(mensajeDePreviewListo(estado.dto));
    } else if (estado.fase === 'exito') {
      AccessibilityInfo.announceForAccessibility(mensajeDeExito(estado.dto));
    } else if (estado.fase === 'error') {
      AccessibilityInfo.announceForAccessibility(estado.mensaje);
    }
  }, [estado]);

  // The trigger is only offered before a preview starts and again once the
  // whole flow has settled (éxito or error) — it stays gated for the
  // duration of the active preview/confirm window (design.md §10.1/§10.2
  // "same file" guarantee).
  const mostrarTrigger =
    estado.fase === 'idle' || estado.fase === 'error' || estado.fase === 'exito';
  const previsualizando = estado.fase === 'previsualizando';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <View className="flex-1 gap-6 px-8 py-6">
        <Text className="text-center text-2xl font-bold text-heading">Subir cartola</Text>

        {mostrarTrigger && (
          <Pressable
            testID="subir-archivo-trigger"
            accessibilityRole="button"
            accessibilityLabel="Seleccionar archivo .xlsx o .pdf para subir"
            onPress={() => void seleccionarArchivo()}
            className="items-center rounded-full py-3"
            style={{ backgroundColor: COLORS.ingreso }}
          >
            <Text className="font-semibold text-white">Seleccionar archivo</Text>
          </Pressable>
        )}

        {previsualizando && (
          <Text
            testID="preview-cargando"
            accessibilityRole="progressbar"
            accessibilityLabel="Generando vista previa"
            accessibilityLiveRegion="polite"
            className="text-center text-sm text-muted"
          >
            Generando vista previa…
          </Text>
        )}

        {estado.fase === 'subiendo' && (
          <Text
            testID="subir-cargando"
            accessibilityRole="progressbar"
            accessibilityLabel="Subiendo cartola"
            accessibilityLiveRegion="polite"
            className="text-center text-sm text-muted"
          >
            Subiendo…
          </Text>
        )}

        {estado.fase === 'preview' && (
          <PreviewCartola
            dto={estado.dto}
            cantidad={cantidad}
            onCantidadChange={setCantidad}
            onConfirmar={() => void confirmar()}
            onCancelar={cancelar}
          />
        )}

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
 * PreviewCartola — the per-row preview panel + 10/25/50 selector +
 * Confirmar/Cancelar (US-003 Slice 3, design.md §10.2/§10.3). Kept as a
 * local component (not a separate file) per design.md's explicit "inline or
 * a small component" allowance — SRP is still honored: this component only
 * renders, all state lives in the parent `Subir` screen.
 */
function PreviewCartola({
  dto,
  cantidad,
  onCantidadChange,
  onConfirmar,
  onCancelar,
}: {
  readonly dto: PreviewIngestaDto;
  readonly cantidad: CantidadPreview;
  readonly onCantidadChange: (cantidad: CantidadPreview) => void;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}) {
  const filas = sliceMuestra(dto.muestra, cantidad);

  return (
    <>
      <View
        testID="preview-resultado"
        accessibilityRole="summary"
        accessibilityLabel={
          `Vista previa lista. Banco ${dto.banco}, ${dto.estructura.totalFilasDatos} movimientos.`
        }
        accessibilityLiveRegion="polite"
        className="gap-3 rounded-xl border border-hairline bg-white p-4"
      >
        <Text className="text-base font-semibold text-heading">Vista previa</Text>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Banco</Text>
          <Text className="text-sm font-medium text-heading">{dto.banco}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Movimientos en total</Text>
          <Text className="text-sm font-medium text-heading">
            {dto.estructura.totalFilasDatos}
          </Text>
        </View>

        <View
          testID="preview-selector"
          accessibilityRole="radiogroup"
          accessibilityLabel="Cantidad de filas a mostrar"
          className="flex-row gap-2"
        >
          {OPCIONES_CANTIDAD_PREVIEW.map((opcion) => {
            const seleccionada = cantidad === opcion;
            return (
              <Pressable
                key={opcion}
                testID={`preview-cantidad-${opcion}`}
                accessibilityRole="button"
                accessibilityLabel={`Mostrar ${opcion} filas`}
                accessibilityState={{ selected: seleccionada }}
                onPress={() => onCantidadChange(opcion)}
                className="rounded-full border px-3 py-1"
                style={{
                  backgroundColor: seleccionada ? COLORS.ingreso : COLORS.canvas,
                  borderColor: COLORS.hairline,
                }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: seleccionada ? '#ffffff' : undefined }}
                >
                  {opcion}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          testID="preview-lista"
          accessibilityLabel="Muestra de movimientos"
          accessibilityLiveRegion="polite"
          className="gap-2"
        >
          {filas.map((fila, indice) => {
            const formateada = formatearFilaPreview(fila);
            return (
              <View
                key={`${fila.fecha}-${fila.descripcion}-${fila.cargo}-${fila.abono}-${indice}`}
                testID={`preview-fila-${indice}`}
                accessibilityLabel={
                  `${formateada.fecha}, ${formateada.descripcion}, cargo ${formateada.cargo}, abono ${formateada.abono}`
                }
                className="gap-1 rounded-lg bg-canvas p-2"
              >
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted">{formateada.fecha}</Text>
                  <Text className="text-xs font-medium text-heading">
                    {formateada.descripcion}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted">Cargo: {formateada.cargo}</Text>
                  <Text className="text-xs text-muted">Abono: {formateada.abono}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <Pressable
        testID="preview-confirmar"
        accessibilityRole="button"
        accessibilityLabel="Confirmar carga"
        onPress={onConfirmar}
        className="items-center rounded-full py-3"
        style={{ backgroundColor: COLORS.ingreso }}
      >
        <Text className="font-semibold text-white">Confirmar</Text>
      </Pressable>
      <Pressable
        testID="preview-cancelar"
        accessibilityRole="button"
        accessibilityLabel="Cancelar vista previa"
        onPress={onCancelar}
        className="items-center py-3"
      >
        <Text className="text-sm font-semibold text-muted">Cancelar</Text>
      </Pressable>
    </>
  );
}

/**
 * "Volver al resumen" back affordance: `_layout.tsx` hides the native
 * header (`headerShown: false`), so without this the user has no on-screen
 * way back to the resumen screen after an éxito/error.
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
