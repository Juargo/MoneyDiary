/**
 * ReclasificarMobileControl — per-row reclassify control (US-056, D-17/D-16/D-20).
 *
 * Anatomy (ports web ReclasificarCategoriaControl.tsx semantics to RN primitives):
 *
 * 1. Trigger: one Pressable per movement row inside GrupoMovimientosMobile (D-19),
 *    accessibilityRole="button", unique testID="reclasificar-trigger-{tx.id}".
 *    Tapping opens the Modal and triggers a catalog fetch.
 *
 * 2. Modal: body is a ScrollView of BUCKETS_ASIGNABLES-filtered agruparPorBucket
 *    sections. Section headers are ETIQUETA_BUCKET display labels ("Gustos" not
 *    "Deseos"). Each categoria row testID="reclasificar-opcion-{categoria.nombre}".
 *    Current categoria is marked (accessibilityState={{ selected: true }}).
 *    «Cancelar» closes with no mutation (cancel path).
 *
 * 3. Selection logic: derive bucketNuevo.
 *    Same bucket → commit(nombre) directly (no Alert).
 *    Cross-bucket → Alert.alert with us-044 guard (see below).
 *
 * 4. Alert.alert guard (us-044 case law, verbatim from EditarCategoria.tsx):
 *    mostrandoAlerta useRef; set true BEFORE Alert.alert; cleared in EVERY onPress
 *    (both Cancelar and Confirmar); { cancelable: false } for Android backdrop.
 *
 * 5. commit(nombre, bucketNuevo?): call reclasificarCategoria(tx.id, nombre).
 *    On ok: close modal → onReclasificado() → solicitarRecargaResumen()
 *           → if cross-bucket: onMovida(ETIQUETA_BUCKET[bucketNuevo]).
 *    The control NEVER calls AccessibilityInfo — onMovida is the screen's handler.
 *    On !ok: setErrorMensaje(mensajeDeErrorReclasificar(error)).
 *
 * Settled announcement (us-055 D-04 case law):
 * onMovida fires INSIDE the PATCH ok branch, AFTER the PATCH resolves — never
 * optimistically before. The screen's onMovida handler calls announceForAccessibility.
 *
 * Pure: no route, no router.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { fetchCatalogo, reclasificarCategoria } from '../../api/categorias';
import { solicitarRecargaResumen } from '../../api/resumen-refresh';
import { agruparPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { mensajeDeErrorReclasificar } from '../../domain/mensajes-reclasificar';
import { ETIQUETA_BUCKET } from '../../theme/colors';
import type { CatalogoDto } from '../../domain/catalogo.types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TxReclasificarVM {
  /** Transaction id — used in testID and the PATCH URL. */
  readonly id: string;
  /** Description shown in the accessibility label. */
  readonly descripcion: string;
  /** Pre-formatted CLP string (e.g. '$50.000'). Never reformatted here. */
  readonly montoLabel: string;
}

export interface CategoriaActual {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: string;
}

export interface ReclasificarMobileControlProps {
  /** The movement row this control belongs to. */
  readonly tx: TxReclasificarVM;
  /** Current categoria of this transaction. */
  readonly categoriaActual: CategoriaActual;
  /**
   * Called after a successful reclassify PATCH and before solicitarRecargaResumen.
   * Typically wired to the screen's cargar() to refetch the open detail.
   * Accepts a void-or-Promise return so the async cargar type is not hidden;
   * fired-and-forgotten by this control (not awaited — fire-and-forget refetch).
   */
  readonly onReclasificado: () => void | Promise<void>;
  /**
   * Called ONLY on cross-bucket success, AFTER the PATCH resolves ok (settled
   * announcement, us-055 D-04 lesson). Receives the ETIQUETA_BUCKET display
   * label of the destination bucket (e.g. 'Necesidades', 'Gustos', 'Ahorro').
   * The screen's handler owns both setAnuncio and announceForAccessibility —
   * this control never calls AccessibilityInfo (single announcement source, D-20).
   */
  readonly onMovida: (bucketLabel: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReclasificarMobileControl({
  tx,
  categoriaActual,
  onReclasificado,
  onMovida,
}: ReclasificarMobileControlProps) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoDto | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);

  // us-044 Alert guard: set true before Alert.alert; cleared in EVERY onPress.
  const mostrandoAlerta = useRef(false);

  // Fetch catalog when the modal opens (D-16: fetchCatalogo + agruparPorBucket).
  const cargarCatalogo = useCallback(async () => {
    const resultado = await fetchCatalogo();
    if (resultado.ok) {
      setCatalogo(resultado.value);
    }
    // If fetch fails, catalog stays null — modal shows loading state.
    // Error display on catalog fetch failure is out of scope for this control
    // (defensive: the user can cancel and retry).
  }, []);

  useEffect(() => {
    if (modalAbierto && catalogo === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void cargarCatalogo();
    }
  }, [modalAbierto, catalogo, cargarCatalogo]);

  function handleAbrirModal() {
    setErrorMensaje(null);
    setModalAbierto(true);
  }

  function handleCerrarModal() {
    setModalAbierto(false);
    // Do NOT clear catalogo — cache it so re-open is instant.
  }

  /**
   * commit(nombre, bucketNuevo?) — calls the PATCH and handles the settled ok/error path.
   * bucketNuevo is defined only for cross-bucket moves.
   */
  async function commit(nombre: string, bucketNuevo?: string) {
    setErrorMensaje(null);
    const resultado = await reclasificarCategoria(tx.id, nombre);

    if (!resultado.ok) {
      setErrorMensaje(mensajeDeErrorReclasificar(resultado.error));
      return;
    }

    // ok path: close modal first, then fire refresh callbacks in order.
    setModalAbierto(false);
    // Fire-and-forget refetch: cargar() is async but we do not await it here
    // so the announce path (onMovida) fires immediately after (settled order, D-20).
    void onReclasificado();
    solicitarRecargaResumen();

    // Cross-bucket only: fire the screen-owned announcement handler.
    // This is the settled-announcement: fires AFTER the PATCH resolves, NEVER before.
    if (bucketNuevo !== undefined) {
      onMovida(ETIQUETA_BUCKET[bucketNuevo] ?? bucketNuevo);
    }
  }

  function handleSelectCategoria(nombre: string, bucketCategoria: string) {
    const esMismoBucket = bucketCategoria === categoriaActual.bucket;

    if (esMismoBucket) {
      // Same-bucket: commit directly, no Alert.
      void commit(nombre);
      return;
    }

    // Cross-bucket: show Alert with us-044 guard.
    if (mostrandoAlerta.current) return;
    mostrandoAlerta.current = true;

    const etiquetaActual =
      ETIQUETA_BUCKET[categoriaActual.bucket] ?? categoriaActual.bucket;
    const etiquetaNueva = ETIQUETA_BUCKET[bucketCategoria] ?? bucketCategoria;

    Alert.alert(
      'Confirmar cambio de categoría',
      `Esto mueve ${tx.montoLabel} de ${etiquetaActual} a ${etiquetaNueva}.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            mostrandoAlerta.current = false;
          },
        },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: () => {
            mostrandoAlerta.current = false;
            void commit(nombre, bucketCategoria);
          },
        },
      ],
      // cancelable: false — Android backdrop/back-button dismiss fires no callback
      // and would leave mostrandoAlerta.current stuck true (dead buttons).
      // Verbatim from EditarCategoria.tsx:146-148.
      { cancelable: false },
    );
  }

  // Build the BUCKETS_ASIGNABLES-filtered groups for the picker (D-16).
  const grupos =
    catalogo !== null
      ? agruparPorBucket(catalogo.categorias).filter((g) =>
          (BUCKETS_ASIGNABLES as readonly string[]).includes(g.bucket),
        )
      : [];

  return (
    <>
      {/* Trigger: one per movement row (D-17/D-19) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cambiar categoría de ${tx.descripcion}`}
        testID={`reclasificar-trigger-${tx.id}`}
        onPress={handleAbrirModal}
      >
        <Text style={{ fontSize: 11, color: '#3B4266' }}>Reclasificar</Text>
      </Pressable>

      {/* Picker Modal (D-17) */}
      <Modal
        testID="reclasificar-modal"
        visible={modalAbierto}
        transparent
        animationType="slide"
        onRequestClose={handleCerrarModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '80%',
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#EBEBEE',
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: '600', color: '#2D2F3A' }}
              >
                Cambiar categoría
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                testID="reclasificar-cancelar"
                onPress={handleCerrarModal}
              >
                <Text style={{ fontSize: 14, color: '#3B4266' }}>Cancelar</Text>
              </Pressable>
            </View>

            {/* Error message region */}
            {errorMensaje ? (
              <Text
                accessibilityRole="alert"
                style={{
                  color: '#D1495B',
                  fontSize: 13,
                  paddingHorizontal: 16,
                  paddingTop: 8,
                }}
              >
                {errorMensaje}
              </Text>
            ) : null}

            {/* Catalog loading state */}
            {catalogo === null ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#8A8F9C' }}>Cargando categorías...</Text>
              </View>
            ) : (
              <ScrollView style={{ padding: 16 }}>
                {grupos.map((grupo) => (
                  <View key={grupo.bucket} style={{ marginBottom: 16 }}>
                    {/* Section header: ETIQUETA_BUCKET display label (D-17) */}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#8A8F9C',
                        marginBottom: 8,
                        textTransform: 'uppercase',
                      }}
                    >
                      {ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket}
                    </Text>

                    {grupo.categorias.map((cat) => {
                      const esCategoriaActual =
                        cat.nombre === categoriaActual.nombre;

                      return (
                        <Pressable
                          key={cat.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: esCategoriaActual }}
                          testID={`reclasificar-opcion-${cat.nombre}`}
                          onPress={() =>
                            handleSelectCategoria(cat.nombre, cat.bucket)
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 10,
                            paddingHorizontal: 4,
                            borderBottomWidth: 1,
                            borderBottomColor: '#EBEBEE',
                          }}
                        >
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              color: '#2D2F3A',
                              fontWeight: esCategoriaActual ? '600' : '400',
                            }}
                          >
                            {cat.nombre}
                          </Text>
                          {esCategoriaActual ? (
                            <Text style={{ fontSize: 13, color: '#3B4266' }}>
                              ● actual
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
