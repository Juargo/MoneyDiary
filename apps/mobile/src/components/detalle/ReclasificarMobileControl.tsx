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
 *    "Deseos"). Each categoria row testID="reclasificar-opcion-{categoria.id}".
 *    Current categoria is marked (accessibilityState={{ selected: true }}) by
 *    id, never by nombre (categoria-unica-por-bucket ADR-042/D-08 — a nombre
 *    can legally repeat across buckets, so it no longer identifies a row).
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
 * 5. commit(categoriaId, movidaLabel?): call reclasificarCategoria(tx.id, categoriaId).
 *    On ok: close modal → onReclasificado() → solicitarRecargaResumen()
 *           → onMovida(movidaLabel) when movidaLabel is defined.
 *    `movidaLabel` is the ETIQUETA_BUCKET display label for a cross-bucket
 *    move, or the destination CATEGORÍA's own nombre for a same-bucket move
 *    (confirmacion-reclasificar, issue #749) — both reuse the SAME onMovida
 *    seam, `commit` itself does not distinguish which case it is.
 *    The control NEVER calls AccessibilityInfo — onMovida is the screen's handler.
 *    On !ok: setErrorMensaje(mensajeDeErrorReclasificar(error)).
 *
 * Settled announcement (us-055 D-04 case law):
 * onMovida fires INSIDE the PATCH ok branch, AFTER the PATCH resolves — never
 * optimistically before. The screen's onMovida handler calls announceForAccessibility.
 *
 * Copy (UX-clarity fix, reclasificar-bucket-y-categoria, 2026-09-14): the
 * trigger's accessibilityLabel and the Modal's visible title both name
 * "bucket y categoría", not just "categoría" — the modal already groups
 * options under bucket section headers (point 2 above), so the copy now
 * matches what the picker actually does. Previously: accessibilityLabel
 * "Cambiar categoría de {descripcion}", Modal title "Cambiar categoría".
 *
 * 6. "+ Crear categoría" (agregar-categoria-desde-selector, issue #744): a
 *    Pressable inside the Modal, always available once it is open (no
 *    dependency on the catalog having resolved — creating a categoría is
 *    an independent POST). Opens `NuevaCategoriaForm` in place of the
 *    bucket/categoría sections, with `bucketInicial={categoriaActual.bucket}`
 *    — editable, NOT fixed (unlike `AgregarCategoriaControl`'s bucket-detail
 *    page, issue #743, where the bucket is unambiguous): the usability
 *    finding behind this issue was wanting a categoría in a bucket OTHER
 *    than the one the user is currently looking at. `categoriaActual.bucket`
 *    can be the `'SinCategoria'` sentinel (see `GrupoMovimientosMobile`) —
 *    not a member of `BUCKETS_ASIGNABLES` — `NuevaCategoriaForm`'s
 *    `SelectorChips` only offers real buckets, so that sentinel is passed
 *    through `bucketInicial` typed loosely and simply never matches any
 *    chip, leaving the picker unselected (same "no regression" fallback
 *    `bucketInicial` already has when omitted).
 *
 *    On success: the created categoría is (a) appended to this control's
 *    OWN cached `catalogo` state, so its bucket section shows it without
 *    waiting for a refetch, (b) selected for THIS row via the exact same
 *    `handleSelectCategoria` branch a tap on an existing option would take
 *    (same-bucket commits directly, cross-bucket opens the SAME
 *    confirmation Alert — ADR-015: creating a categoría is not a bypass for
 *    the money-move confirmation), and (c) reported upward via
 *    `onCategoriaCreada`, which `BucketDetalleScreen` wires to the SAME
 *    `handleCategoriaCreada`/`categoriaVersion` bump `AgregarCategoriaControl`
 *    already uses (issue #743) — every OTHER row's own cached catalog picks
 *    it up too, on its next open, with no remount of the groups tree.
 *
 * Pure: no route, no router.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { fetchCatalogo, reclasificarCategoria } from '../../api/categorias';
import { solicitarRecargaResumen } from '../../api/resumen-refresh';
import { agruparPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { mensajeDeErrorReclasificar } from '../../domain/mensajes-reclasificar';
import { ETIQUETA_BUCKET } from '../../theme/colors';
import type { CatalogoDto, CategoriaDto } from '../../domain/catalogo.types';
import { NuevaCategoriaForm } from '../configuracion/NuevaCategoriaForm';

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
   * Called on EVERY successful reclassify, AFTER the PATCH resolves ok
   * (settled announcement, us-055 D-04 lesson) — cross-bucket AND
   * same-bucket alike (confirmacion-reclasificar, issue #749). Receives the
   * ETIQUETA_BUCKET display label of the destination bucket for a
   * cross-bucket move (e.g. 'Necesidades', 'Gustos', 'Ahorro'), or the
   * destination CATEGORÍA's own nombre for a same-bucket move.
   * The screen's handler owns both setAnuncio and announceForAccessibility —
   * this control never calls AccessibilityInfo (single announcement source, D-20).
   */
  readonly onMovida: (label: string) => void;
  /**
   * agregar-categoria-desde-bucket (issue #743): an opaque token (bumped by
   * `BucketDetalleScreen` on every successful categoría creation) that
   * invalidates ONLY this control's own per-instance `catalogo` cache — not
   * the component tree. A `key`-based remount of the groups subtree was
   * tried first and reverted: `GrupoMovimientosMobile` keeps its own
   * `expandido` accordion state, so remounting collapsed every open group
   * the instant a categoría was created, which is a worse regression than
   * the staleness this prop fixes (a tester expands a row to reclassify,
   * doesn't find the categoría, creates it, and would lose their place).
   * Optional and defaulted to `undefined` so every pre-existing caller/test
   * that doesn't pass it keeps the exact prior "fetch once, cache for the
   * component's lifetime" behaviour — see the effect below.
   */
  readonly categoriaVersion?: number;
  /**
   * agregar-categoria-desde-selector (issue #744): REQUIRED, same
   * `onMovida`/`onReclasificado` banned-pattern discipline (us-044 PR7) —
   * called once a categoría created from THIS control's own "+" affordance
   * has been appended to this control's local `catalogo` and selected for
   * the row. `BucketDetalleScreen` wires this to the SAME
   * `handleCategoriaCreada` that bumps `categoriaVersion` for
   * `AgregarCategoriaControl` (issue #743), so every OTHER row's own cached
   * catalog picks up the new categoría too.
   */
  readonly onCategoriaCreada: (categoria: CategoriaDto) => void;
  /**
   * patrón-desde-movimiento (issue #745): REQUIRED, same
   * `onMovida`/`onReclasificado`/`onCategoriaCreada` banned-pattern
   * discipline (us-044 PR7) — called on EVERY successful reclassify
   * (same-bucket AND cross-bucket alike), AFTER the PATCH resolves ok
   * (settled, same as `onMovida`), with the row's description and the
   * DESTINATION categoría id. `BucketDetalleScreen` wires this to a
   * screen-owned offer overlay (see that screen's own docblock for why
   * the offer's state lives there rather than in this control — a `cargar`-
   * triggered reload, e.g. from a bucket/periodo change, still unmounts
   * this control's own tree, so any state kept HERE could still be lost;
   * the reclassify-triggered reload itself no longer unmounts anything,
   * issue #762 fix, but the screen-level home stays the simpler, uniform
   * choice regardless of which refresh path fired).
   */
  readonly onOfrecerPatron: (info: {
    descripcion: string;
    categoriaId: string;
  }) => void;
}

function esBucketAsignable(bucket: string): bucket is BucketAsignable {
  return (BUCKETS_ASIGNABLES as readonly string[]).includes(bucket);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReclasificarMobileControl({
  tx,
  categoriaActual,
  onReclasificado,
  onMovida,
  categoriaVersion,
  onCategoriaCreada,
  onOfrecerPatron,
}: ReclasificarMobileControlProps) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoDto | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [creandoCategoria, setCreandoCategoria] = useState(false);

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

  // agregar-categoria-desde-bucket (issue #743): invalidate ONLY this
  // control's own cached `catalogo` when `categoriaVersion` changes — never
  // a remount (see the prop's own docblock). `categoriaVersion === undefined`
  // (every pre-existing caller) makes this a permanent no-op, so nothing
  // changes for a caller that doesn't opt in. When it IS provided, this also
  // fires once on mount (`catalogo` is already `null` then, so `setCatalogo
  // (null)` is a no-op re-render-wise) — the only observable effect is on a
  // LATER change, which is exactly the "categoría created elsewhere" signal.
  // If the modal happens to be open when that fires, the effect above
  // refetches immediately instead of waiting for the next open.
  useEffect(() => {
    if (categoriaVersion === undefined) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCatalogo(null);
  }, [categoriaVersion]);

  function handleAbrirModal() {
    setErrorMensaje(null);
    setModalAbierto(true);
  }

  function handleCerrarModal() {
    setModalAbierto(false);
    // Do NOT clear catalogo — cache it so re-open is instant.
  }

  /**
   * alCategoriaCreada (issue #744) — the created categoría is selected for
   * this row via the EXACT SAME `handleSelectCategoria` branch a tap on an
   * existing option takes (same-bucket direct commit, cross-bucket Alert),
   * reported upward via `onCategoriaCreada` (bumps `categoriaVersion` for
   * every OTHER row — see this prop's own docblock). This control's own
   * `categoriaVersion` effect above reacts to that same bump by nulling its
   * cached `catalogo`, so no separate local-cache append is needed here —
   * the next open (or, if the modal is still open, the effect below) fetches
   * the now-fresh catalog straight from the server.
   */
  function alCategoriaCreada(categoria: CategoriaDto) {
    setCreandoCategoria(false);
    onCategoriaCreada(categoria);
    handleSelectCategoria(categoria.id, categoria.bucket, categoria.nombre);
  }

  /**
   * commit(categoriaId, movidaLabel?) — calls the PATCH and handles the settled ok/error path.
   * `movidaLabel` is the string `onMovida` is called with on success — the
   * ETIQUETA_BUCKET display label for a cross-bucket move, or the
   * destination categoría's nombre for a same-bucket move (confirmacion-
   * reclasificar, issue #749). `commit` itself does not need to know which
   * case it is — it just forwards whatever label the caller computed.
   */
  async function commit(categoriaId: string, movidaLabel?: string) {
    setErrorMensaje(null);
    const resultado = await reclasificarCategoria(tx.id, categoriaId);

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

    // Fire the screen-owned announcement handler (cross-bucket AND
    // same-bucket alike, confirmacion-reclasificar). This is the
    // settled-announcement: fires AFTER the PATCH resolves, NEVER before.
    if (movidaLabel !== undefined) {
      onMovida(movidaLabel);
    }

    // patrón-desde-movimiento (issue #745): every successful reclassify
    // offers to turn it into a pattern, targeting the categoría it just
    // committed TO. Fired in the SAME synchronous tick as `onReclasificado`
    // above (no await between them) — this is deliberate, see this
    // control's own `onOfrecerPatron` docblock and `BucketDetalleScreen`'s:
    // React 18 batches this with the screen's `fase: 'loading'` update from
    // `onReclasificado`, so the offer is already part of the SAME render
    // that shows the loading state, instead of appearing on this
    // (about-to-unmount) control and being lost.
    onOfrecerPatron({ descripcion: tx.descripcion, categoriaId });
  }

  function handleSelectCategoria(
    categoriaId: string,
    bucketCategoria: string,
    nombreCategoria: string,
  ) {
    const esMismoBucket = bucketCategoria === categoriaActual.bucket;

    if (esMismoBucket) {
      // Same-bucket: commit directly, no Alert — but still announce via
      // onMovida with the destination categoría's own nombre
      // (confirmacion-reclasificar, issue #749).
      void commit(categoriaId, nombreCategoria);
      return;
    }

    // Cross-bucket: show Alert with us-044 guard.
    if (mostrandoAlerta.current) return;
    mostrandoAlerta.current = true;

    const etiquetaActual =
      ETIQUETA_BUCKET[categoriaActual.bucket] ?? categoriaActual.bucket;
    const etiquetaNueva = ETIQUETA_BUCKET[bucketCategoria] ?? bucketCategoria;
    // Destino COMPLETO, "{bucket} · {categoría}" (issue #782): nombrar solo
    // el bucket perdía la mitad de la decisión que el usuario acaba de
    // tomar — elige "Necesidades · Salud" en el picker y el Alert le
    // contesta "a Necesidades", sin confirmarle nunca que Salud entró.
    // Gemelo de `apps/web/.../ReclasificarCategoriaControl.tsx`.
    const destinoLabel = `${etiquetaNueva} · ${nombreCategoria}`;

    Alert.alert(
      'Confirmar cambio de grupo',
      `Esto mueve ${tx.montoLabel} de ${etiquetaActual} a ${destinoLabel}.`,
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
            // Cross-bucket: pass the FULL destination label, bucket +
            // categoría (already computed above for the Alert body), so the
            // anuncio repite exactamente lo que el Alert prometió. El
            // mismo-bucket sigue mandando solo el nombre de la categoría
            // (ahí el bucket no cambia), ver la otra rama de
            // handleSelectCategoria.
            void commit(categoriaId, destinoLabel);
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
        accessibilityLabel={`Cambiar grupo y categoría de ${tx.descripcion}`}
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
                Cambiar grupo y categoría
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

            {creandoCategoria ? (
              /* "+ Crear categoría" (issue #744): replaces the picker body
                 while open — same "at most one panel" idiom the reclassify
                 surfaces on web use, avoids a cluttered Modal. */
              <View style={{ padding: 16 }}>
                <NuevaCategoriaForm
                  bucketInicial={
                    esBucketAsignable(categoriaActual.bucket)
                      ? categoriaActual.bucket
                      : undefined
                  }
                  onCreada={alCategoriaCreada}
                  onCancelar={() => setCreandoCategoria(false)}
                />
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Crear categoría"
                  testID="reclasificar-crear-categoria-trigger"
                  onPress={() => setCreandoCategoria(true)}
                  style={{ paddingHorizontal: 16, paddingTop: 12 }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '500',
                      color: '#3B4266',
                    }}
                  >
                    + Crear categoría
                  </Text>
                </Pressable>

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
                    <Text style={{ color: '#8A8F9C' }}>
                      Cargando categorías...
                    </Text>
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
                            cat.id === categoriaActual.id;

                          return (
                            <Pressable
                              key={cat.id}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected: esCategoriaActual,
                              }}
                              testID={`reclasificar-opcion-${cat.id}`}
                              onPress={() =>
                                handleSelectCategoria(
                                  cat.id,
                                  cat.bucket,
                                  cat.nombre,
                                )
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
                                <Text
                                  style={{ fontSize: 13, color: '#3B4266' }}
                                >
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
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
