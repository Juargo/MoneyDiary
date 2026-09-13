import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { commitIngesta } from '../src/api/commit-ingesta';
import type {
  CommitIngestaDto,
  CommitIngestaError,
  EdicionFila,
} from '../src/api/commit-ingesta';
import { previewIngesta } from '../src/api/preview-ingesta';
import type {
  PreviewIngestaDtoConCanonicos,
  PreviewIngestaError,
} from '../src/api/preview-ingesta';
import { fetchCatalogo } from '../src/api/categorias';
import { agruparPorBucket } from '../src/domain/agrupar-categorias-por-bucket';
import type { GrupoCategoriaPorBucket } from '../src/domain/agrupar-categorias-por-bucket';
import { categoriaEfectiva } from '../src/domain/preview-cartola';
import { mensajeDeErrorCatalogo } from '../src/domain/mensajes-catalogo';
import { ResumenDecision } from '../src/components/subir/ResumenDecision';
import { ListaRevision } from '../src/components/subir/ListaRevision';
import { HojaClasificacion } from '../src/components/subir/HojaClasificacion';
import { solicitarRecargaResumen } from '../src/api/resumen-refresh';
import { copiaPorApiError } from '../src/api/client';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile upload route (Expo Router `app/subir.tsx`, US-033, ADR-026),
 * evolved into the explicit two-action decision flow (design.md Phase 6)
 * plus the tap-row classification sheet (Phase 8a): after a successful
 * preview, the user chooses "Subir tal cual" (commits immediately with an
 * empty edits overlay, MOB-PRV-04) or "Revisar y editar" (opens the full
 * virtualized row list, MOB-PRV-05). In review, tapping an editable row
 * opens `HojaClasificacion` (MOB-PRV-06/07); confirming it records a
 * pending edit in `edits: ReadonlyMap<rowIndex, categoriaId>`, shown as the
 * row's effective categoría (MOB-PRV-07). The review commit still sends an
 * empty overlay this PR — assembling `aOverlayEdits` into the commit and
 * the D-09 double-submit guard land in the follow-up PR (8b).
 *
 * State machine (design.md Data Flow — mobile):
 *   idle → previsualizando → decidiendo{dto,archivo,error?}
 *   decidiendo → subiendo{origen:'decidiendo'} → exito
 *   decidiendo → revisando{dto,archivo,edits,filaAbierta,error?} (+catalog
 *     fetch once) → subiendo{origen:'revisando'} → exito
 *   decidiendo | revisando → idle (Descartar/Cancelar, no commit, MOB-PRV-09)
 * A commit failure returns to the phase it started from (`origen`),
 * preserving the held file and — for `revisando` — the row list intact
 * (MOB-PRV-10), never a dead-end standalone error screen. Only a PREVIEW
 * failure uses the standalone `error` fase (returns to file selection).
 * Setting `subiendo` happens synchronously before the request starts, which
 * unmounts the decision/review actions immediately — there is no render in
 * which a second tap could reach `commitIngesta` again (structural
 * single-fire protection; the synchronous ref guard for two taps within the
 * SAME render arrives in PR8b).
 *
 * Catalog fetch ownership (design.md's data-flow annotation): fetched
 * exactly once per `decidiendo → revisando` transition (the `revisar`
 * callback below) — never re-fetched on re-render, on opening/closing the
 * sheet, or when a commit failure returns to the same `revisando` review.
 * Loading/failure behavior is a spec gap MOB-PRV-06/07/10 do not cover
 * directly: this screen keeps the row list visible, disables opening the
 * sheet (`abrirFila` gates on `catalogo.fase === 'listo'`), and shows a
 * retryable inline message (`catalogo-error`/`catalogo-reintentar`).
 */
type Estado =
  | { fase: 'idle' }
  | { fase: 'previsualizando' }
  | {
      fase: 'decidiendo';
      dto: PreviewIngestaDtoConCanonicos;
      archivo: DocumentPickerAsset;
      error?: string;
    }
  | {
      fase: 'revisando';
      dto: PreviewIngestaDtoConCanonicos;
      archivo: DocumentPickerAsset;
      edits: ReadonlyMap<number, string>;
      filaAbierta: number | null;
      error?: string;
    }
  | {
      fase: 'subiendo';
      origen: 'decidiendo' | 'revisando';
      dto: PreviewIngestaDtoConCanonicos;
      archivo: DocumentPickerAsset;
    }
  | { fase: 'exito'; dto: CommitIngestaDto }
  | { fase: 'error'; mensaje: string };

/**
 * The catalog fetch lifecycle for `revisando` (design.md's "+catalog fetch
 * once" annotation) — kept as its own `useState`, orthogonal to `Estado`,
 * since the review row list already renders from `estado.dto.filas` the
 * instant `revisando` is entered; the catalog only gates the sheet.
 */
type EstadoCatalogo =
  | { fase: 'inactivo' }
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | {
      fase: 'listo';
      grupos: readonly GrupoCategoriaPorBucket[];
      nombrePorId: ReadonlyMap<string, string>;
    };

const TIPOS_ACEPTADOS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
];

/**
 * mensajeDeError — wraps the shared `copiaPorApiError` (client.ts) to add
 * this screen's one extra case: on a 400, prefer the backend's already-
 * scrubbed Spanish `message` when present. Accepts either error union since
 * `CommitIngestaError` and `PreviewIngestaError` share the exact same shape
 * (both mirror `ApiError` plus the optional 400 message, PREV-03) — kept as
 * one explicit union rather than relying on structural coincidence.
 */
function mensajeDeError(
  error: CommitIngestaError | PreviewIngestaError,
): string {
  if (error.tag === 'http' && error.message) {
    return error.message;
  }
  return copiaPorApiError(error);
}

/**
 * Spanish summary announced to screen readers on a successful as-is commit
 * (MOB-PRV-04). `CommitIngestaDto` carries no `banco`/`numeroCuenta` — only
 * the commit-time counts.
 */
function mensajeDeExito(dto: CommitIngestaDto): string {
  return `Cartola subida. ${dto.totalTransacciones} transacciones, ${dto.duplicadosOmitidos} duplicados omitidos.`;
}

/** Spanish message announced when the preview is ready and `decidiendo` renders. */
function mensajeDePreviewListo(dto: PreviewIngestaDtoConCanonicos): string {
  return `Vista previa lista. Banco ${dto.banco}, ${dto.resumen.totalFilas} movimientos. Revisa y confirma.`;
}

/** Spanish message shown/announced when the picker itself fails to open. */
const MENSAJE_ERROR_PICKER =
  'No se pudo abrir el selector de archivos. Intenta de nuevo.';

/**
 * Stable empty-map reference for `ListaRevision.categoriaNombrePorFila`
 * while the catalog has not resolved yet (loading or failed) — avoids a
 * fresh object identity every render.
 */
const CATEGORIA_NOMBRE_POR_FILA_VACIA: ReadonlyMap<number, string | null> =
  new Map();

export default function Subir() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });
  const [catalogo, setCatalogo] = useState<EstadoCatalogo>({
    fase: 'inactivo',
  });

  const seleccionarArchivo = useCallback(async () => {
    let resultado: DocumentPicker.DocumentPickerResult;
    try {
      resultado = await DocumentPicker.getDocumentAsync({
        type: TIPOS_ACEPTADOS,
      });
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

    setEstado({ fase: 'decidiendo', dto: preview.value, archivo });
  }, []);

  const confirmarTalCual = useCallback(async () => {
    if (estado.fase !== 'decidiendo') {
      return;
    }
    const { archivo, dto } = estado;
    setEstado({ fase: 'subiendo', origen: 'decidiendo', dto, archivo });
    // As-is commit — the user never reached the row list, so the overlay is
    // always empty (MOB-PRV-04).
    const subida = await commitIngesta(archivo, []);
    if (!subida.ok) {
      setEstado({
        fase: 'decidiendo',
        dto,
        archivo,
        error: mensajeDeError(subida.error),
      });
      return;
    }

    setEstado({ fase: 'exito', dto: subida.value });
    solicitarRecargaResumen();
  }, [estado]);

  /**
   * cargarCatalogo — fetches the user's own catalog (`fetchCatalogo`) and
   * groups it (`agruparPorBucket`) for `HojaClasificacion`; also builds a
   * flat id→nombre lookup for `ListaRevision`'s row display (D-04: names
   * are resolved from the catalog, never stored in `edits`). Called once
   * on entering `revisando` (`revisar` below) and again from the inline
   * "Reintentar" affordance on a failure.
   */
  const cargarCatalogo = useCallback(async () => {
    setCatalogo({ fase: 'cargando' });
    const resultado = await fetchCatalogo();
    if (!resultado.ok) {
      setCatalogo({
        fase: 'error',
        mensaje: mensajeDeErrorCatalogo(resultado.error),
      });
      return;
    }
    setCatalogo({
      fase: 'listo',
      grupos: agruparPorBucket(resultado.value.categorias),
      nombrePorId: new Map(
        resultado.value.categorias.map((c) => [c.id, c.nombre]),
      ),
    });
  }, []);

  const revisar = useCallback(() => {
    if (estado.fase !== 'decidiendo') {
      return;
    }
    setEstado({
      fase: 'revisando',
      dto: estado.dto,
      archivo: estado.archivo,
      edits: new Map(),
      filaAbierta: null,
    });
    void cargarCatalogo();
  }, [estado, cargarCatalogo]);

  /** Gated on the catalog being ready — see the file docblock's spec-gap note. */
  const abrirFila = useCallback(
    (rowIndex: number) => {
      if (estado.fase !== 'revisando' || catalogo.fase !== 'listo') {
        return;
      }
      setEstado({ ...estado, filaAbierta: rowIndex });
    },
    [estado, catalogo],
  );

  const confirmarEdicionSheet = useCallback(
    (edicion: EdicionFila) => {
      if (estado.fase !== 'revisando') {
        return;
      }
      const edits = new Map(estado.edits);
      edits.set(edicion.rowIndex, edicion.categoriaId);
      setEstado({ ...estado, edits, filaAbierta: null });
    },
    [estado],
  );

  const cerrarSheet = useCallback(() => {
    if (estado.fase !== 'revisando') {
      return;
    }
    setEstado({ ...estado, filaAbierta: null });
  }, [estado]);

  const confirmarRevision = useCallback(async () => {
    if (estado.fase !== 'revisando') {
      return;
    }
    const { archivo, dto, edits } = estado;
    setEstado({ fase: 'subiendo', origen: 'revisando', dto, archivo });
    // Interim (PR8a): the classification overlay assembly (`aOverlayEdits`)
    // arrives in PR8b, so the review commit still sends `[]` regardless of
    // any pending edits, matching PR6's precedent for the read-only review.
    const subida = await commitIngesta(archivo, []);
    if (!subida.ok) {
      setEstado({
        fase: 'revisando',
        dto,
        archivo,
        edits,
        filaAbierta: null,
        error: mensajeDeError(subida.error),
      });
      return;
    }

    setEstado({ fase: 'exito', dto: subida.value });
    solicitarRecargaResumen();
  }, [estado]);

  const descartar = useCallback(() => {
    setEstado({ fase: 'idle' });
    setCatalogo({ fase: 'inactivo' });
  }, []);

  // Announces decidiendo/éxito/error transitions to screen readers (WCAG
  // 2.2 AA SC 4.1.3, design.md). A commit failure keeps the same fase
  // (`decidiendo`/`revisando`) with an embedded `error`, so it is announced
  // explicitly instead of re-announcing the preview-ready message.
  useEffect(() => {
    if (estado.fase === 'decidiendo' || estado.fase === 'revisando') {
      if (estado.error) {
        AccessibilityInfo.announceForAccessibility(estado.error);
      } else if (estado.fase === 'decidiendo') {
        AccessibilityInfo.announceForAccessibility(
          mensajeDePreviewListo(estado.dto),
        );
      }
    } else if (estado.fase === 'exito') {
      AccessibilityInfo.announceForAccessibility(mensajeDeExito(estado.dto));
    } else if (estado.fase === 'error') {
      AccessibilityInfo.announceForAccessibility(estado.mensaje);
    }
  }, [estado]);

  // The trigger is only offered before a preview starts and again once the
  // whole flow has settled (éxito or error) — it stays gated for the
  // duration of the active decision/review/confirm window.
  const mostrarTrigger =
    estado.fase === 'idle' ||
    estado.fase === 'error' ||
    estado.fase === 'exito';
  const previsualizando = estado.fase === 'previsualizando';

  // Narrowed once here (not repeated per JSX conditional) so the revisando
  // block below can read `revisando.edits`/`revisando.filaAbierta` typed,
  // without re-checking `estado.fase === 'revisando'` at every usage site.
  const revisando = estado.fase === 'revisando' ? estado : null;
  const categoriaNombrePorFila: ReadonlyMap<number, string | null> =
    revisando && catalogo.fase === 'listo'
      ? new Map(
          revisando.dto.filas.map((fila) => {
            const categoriaId = categoriaEfectiva(fila, revisando.edits);
            return [
              fila.rowIndex,
              categoriaId
                ? (catalogo.nombrePorId.get(categoriaId) ?? null)
                : null,
            ];
          }),
        )
      : CATEGORIA_NOMBRE_POR_FILA_VACIA;
  // Computed together (not two separate lookups) so the JSX below never
  // needs to re-narrow `estado`/`revisando` to read `edits` for the prop.
  const sheetAbierto: {
    fila: PreviewFilaDto;
    categoriaActualId: string | null;
  } | null =
    revisando && revisando.filaAbierta !== null
      ? (() => {
          const fila = revisando.dto.filas.find(
            (f) => f.rowIndex === revisando.filaAbierta,
          );
          return fila
            ? {
                fila,
                categoriaActualId: categoriaEfectiva(fila, revisando.edits),
              }
            : null;
        })()
      : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <View className="flex-1 gap-6 px-8 py-6">
        <Text className="text-center text-2xl font-bold text-heading">
          Subir cartola
        </Text>

        {mostrarTrigger && (
          <Pressable
            testID="subir-archivo-trigger"
            accessibilityRole="button"
            accessibilityLabel="Seleccionar archivo .xlsx o .pdf para subir"
            onPress={() => void seleccionarArchivo()}
            className="items-center rounded-full py-3"
            style={{ backgroundColor: COLORS.ingreso }}
          >
            <Text className="font-semibold text-white">
              Seleccionar archivo
            </Text>
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

        {estado.fase === 'decidiendo' && (
          <View
            testID="preview-resultado"
            accessibilityRole="summary"
            accessibilityLabel={`Vista previa lista. Banco ${estado.dto.banco}, ${estado.dto.resumen.totalFilas} movimientos.`}
            accessibilityLiveRegion="polite"
            className="gap-3"
          >
            <View className="flex-row justify-between rounded-xl border border-hairline bg-white p-4">
              <Text className="text-sm text-muted">Banco</Text>
              <Text className="text-sm font-medium text-heading">
                {estado.dto.banco}
              </Text>
            </View>
            <ResumenDecision
              resumen={estado.dto.resumen}
              onSubirTalCual={() => void confirmarTalCual()}
              onRevisar={revisar}
              onDescartar={descartar}
            />
            {estado.error && (
              <Text
                testID="subir-error"
                accessibilityRole="alert"
                accessibilityLabel={`Error al subir: ${estado.error}`}
                accessibilityLiveRegion="polite"
                className="text-center text-sm text-red-600"
              >
                {estado.error}
              </Text>
            )}
          </View>
        )}

        {revisando && (
          <View className="flex-1 gap-3">
            {catalogo.fase === 'cargando' && (
              <Text
                testID="catalogo-cargando"
                accessibilityRole="progressbar"
                accessibilityLabel="Cargando catálogo"
                accessibilityLiveRegion="polite"
                className="text-center text-xs text-muted"
              >
                Cargando catálogo…
              </Text>
            )}
            {catalogo.fase === 'error' && (
              <View className="items-center gap-1">
                <Text
                  testID="catalogo-error"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className="text-center text-xs text-red-600"
                >
                  {catalogo.mensaje}
                </Text>
                <Pressable
                  testID="catalogo-reintentar"
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar cargar catálogo"
                  onPress={() => void cargarCatalogo()}
                  className="py-1"
                >
                  <Text className="text-xs font-semibold text-muted">
                    Reintentar
                  </Text>
                </Pressable>
              </View>
            )}
            <ListaRevision
              filas={revisando.dto.filas}
              categoriaNombrePorFila={categoriaNombrePorFila}
              onAbrirFila={abrirFila}
            />
            {revisando.error && (
              <Text
                testID="subir-error"
                accessibilityRole="alert"
                accessibilityLabel={`Error al subir: ${revisando.error}`}
                accessibilityLiveRegion="polite"
                className="text-center text-sm text-red-600"
              >
                {revisando.error}
              </Text>
            )}
            <Pressable
              testID="revision-subir"
              accessibilityRole="button"
              accessibilityLabel="Subir"
              onPress={() => void confirmarRevision()}
              className="items-center rounded-full py-3"
              style={{ backgroundColor: COLORS.ingreso }}
            >
              <Text className="font-semibold text-white">Subir</Text>
            </Pressable>
            <Pressable
              testID="revision-cancelar"
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={descartar}
              className="items-center py-3"
            >
              <Text className="text-sm font-semibold text-muted">Cancelar</Text>
            </Pressable>
          </View>
        )}

        {sheetAbierto && catalogo.fase === 'listo' && (
          <HojaClasificacion
            visible
            fila={sheetAbierto.fila}
            categoriaActualId={sheetAbierto.categoriaActualId}
            grupos={catalogo.grupos}
            onConfirmar={confirmarEdicionSheet}
            onCancelar={cerrarSheet}
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
              <Text className="text-base font-semibold text-heading">
                Cartola subida
              </Text>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Transacciones</Text>
                <Text className="text-sm font-medium text-heading">
                  {estado.dto.totalTransacciones}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Duplicados omitidos</Text>
                <Text className="text-sm font-medium text-heading">
                  {estado.dto.duplicadosOmitidos}
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
      <Text className="text-sm font-semibold text-muted">
        Volver al resumen
      </Text>
    </Pressable>
  );
}
