/**
 * BucketDetalleScreen — M1 read-only bucket detail screen (US-056, D-12/D-20/MDET-01/MDET-02).
 *
 * Owns the fetch lifecycle and state machine (loading|error|data) for
 * GET /api/buckets/{bucket}/detalle. Mirrors the categoria/[id].tsx pattern:
 * the screen component is the logical owner of its data, keeping the route
 * thin (just useLocalSearchParams → props).
 *
 * State machine (D-12):
 * - loading  — fetchDetalleBucketMes in flight
 * - error    — typed ApiError result
 * - data     — successful DTO; empty = viewModel.grupos.length === 0 (NOT a 4th tag)
 *
 * `cargar` is a useCallback([bucket, periodo]) that re-fires when bucket or periodo changes.
 * `onReclasificado={cargar}` is passed into GrupoMovimientosMobile so every successful
 * reclassify PATCH refetches the open M1 detail (D-17/D-18).
 *
 * Screen-owned `anuncio` state + `status-reclasificar` live-region Text OUTSIDE
 * the groups map — survives a moved row's removal (D-20/MDET-05).
 * Period change clears anuncio via useEffect([periodo]) (web parity).
 *
 * `onMovida` handler: setAnuncio + AccessibilityInfo.announceForAccessibility
 * (settled-announcement, us-055 D-04 case law). The screen is the ONLY caller of
 * AccessibilityInfo in this change (D-20 single announcement source).
 *
 * NO useFocusEffect for initial load (categoria/[id].tsx:55-58 rationale: the
 * route unmounts on nav-away, so mounting = every visit).
 *
 * `AgregarCategoriaControl` (agregar-categoria-desde-bucket, issue #743):
 * mounted in the header, gated on `BUCKETS_ASIGNABLES.includes(bucket)` —
 * `SinCategoria` cannot own a categoría. On success, `handleCategoriaCreada`
 * both announces via the SAME shared `anuncio`/AccessibilityInfo mechanism
 * `handleMovida` uses, and bumps `categoriaVersion`, forwarded as a PROP
 * through `GrupoMovimientosMobile` down to every row's
 * `ReclasificarMobileControl` (never a `key` on the groups container — a
 * `key`-based remount was tried first and reverted: `GrupoMovimientosMobile`
 * keeps its own `expandido` accordion state, so remounting the subtree
 * collapsed every already-expanded group the instant a categoría was
 * created, which defeats the exact flow this feature exists to smooth: a
 * user expands a group to reclassify a movement, doesn't find the categoría
 * they want, creates it from this screen, and should NOT lose their place).
 * `ReclasificarMobileControl` caches its OWN catalog fetch in local state
 * for its component lifetime ("Do NOT clear catalogo — cache it so re-open
 * is instant") — there is no shared/global mobile cache to invalidate the
 * way web's TanStack Query lets `useCrearCategoria` seed `['categorias']`.
 * That control's own `categoriaVersion` effect clears ONLY its cached
 * `catalogo` (not the component) when the prop changes, so its NEXT open
 * refetches fresh and includes the just-created categoría — the same
 * "immediately usable without a reload" guarantee web gets from cache
 * seeding, achieved here per-instance instead (no shared cache exists to
 * seed on mobile), without touching any accordion state.
 *
 * `ofrecerPatron` overlay (patrón-desde-movimiento, issue #745): every
 * successful reclassify also offers to turn it into a pattern
 * (`OfrecerPatronMobileControl`). Its trigger, `onOfrecerPatron`, fires in
 * the SAME synchronous tick as `onReclasificado` (see
 * `ReclasificarMobileControl.commit()`) — and `onReclasificado` is `cargar`,
 * which sets `fase: 'loading'` and unmounts the ENTIRE groups subtree
 * (issue #762, pre-existing and NOT fixed here: reclassifying still
 * collapses every expanded group). If this offer's state lived inside that
 * subtree — or inside `ReclasificarMobileControl` itself — it would be
 * destroyed in the very same render that tries to show it, and the offer
 * would never be reachable. The fix scoped to THIS feature: `ofrecerPatron`
 * is SCREEN state (like `anuncio`), and the offer is rendered in ALL THREE
 * fase branches (loading/error/data) as a fixed-position overlay — a stable
 * sibling outside the conditional subtree, the same discipline
 * `statusRegion` already uses for `anuncio`. Because both `estado.fase` and
 * `ofrecerPatron` update in the same batched render (React 18 automatic
 * batching, no `await` between the two calls in `commit()`), the offer
 * shows up ALREADY correct in the very first `loading` render — it never
 * flashes and disappears. It stays visible through the loading spinner and
 * survives into the reloaded `data` state, closing only when the user
 * dismisses it or the pattern is created. This does NOT fix #762 itself:
 * expanded groups still collapse on every reclassify.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchDetalleBucketMes } from '../../api/client';
import { aDetalleBucketMesViewModel } from '../../domain/detalle-bucket-mes-view-model';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { ETIQUETA_BUCKET } from '../../theme/colors';
import { SelectorPeriodoMes } from '../SelectorPeriodoMes';
import { GrupoMovimientosMobile } from './GrupoMovimientosMobile';
import { AgregarCategoriaControl } from './AgregarCategoriaControl';
import { OfrecerPatronMobileControl } from './OfrecerPatronMobileControl';
import { copiaPorApiError } from '../../domain/api-error';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';
import type { ApiError } from '../../domain/api-error';

type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: DetalleBucketMesDto };

interface BucketDetalleScreenProps {
  /** Raw wire bucket key (e.g. 'Deseos') — display label resolved via ETIQUETA_BUCKET. */
  readonly bucket: string;
  /** When 'sin-categoria', highlights the SinCategoria group (D-19/MDET-03). */
  readonly destacar?: string;
  /** Current period (YYYY-MM or undefined = backend resolves current month). */
  readonly periodo?: string;
  /** Called by SelectorPeriodoMes when the user navigates months. */
  readonly onChangePeriodo: (periodo: string) => void;
  /** Back navigation. */
  readonly onBack: () => void;
}

/**
 * BucketDetalleScreen — M1 screen with full fetch ownership.
 */
export function BucketDetalleScreen({
  bucket,
  destacar,
  periodo,
  onChangePeriodo,
  onBack,
}: BucketDetalleScreenProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });
  // Screen-owned announcement state (D-20)
  const [anuncio, setAnuncio] = useState('');
  // agregar-categoria-desde-bucket (issue #743): bumped on every successful
  // categoría creation and threaded down as a PROP (never a `key`) — see
  // this file's own docblock for why this is what refreshes the reclassify
  // pickers without collapsing any expanded group.
  const [categoriaVersion, setCategoriaVersion] = useState(0);
  // patrón-desde-movimiento (issue #745): screen-owned so it survives the
  // fase transition to 'loading' a reclassify triggers — see this file's
  // own docblock for why this state cannot live inside the groups subtree.
  const [ofrecerPatron, setOfrecerPatron] = useState<{
    descripcion: string;
    categoriaId: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    const resultado = await fetchDetalleBucketMes(bucket, periodo);
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, [bucket, periodo]);

  // Fire on mount and on period/bucket change (D-12). No useFocusEffect (D-12).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // Clear anuncio whenever period changes (web parity BucketDetalleMesPage.tsx:79-82).
  // Also clears any pending "patrón desde movimiento" offer (issue #745):
  // an offer targeting last period's row makes no sense once the user has
  // navigated away from it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnuncio('');

    setOfrecerPatron(null);
  }, [periodo]);

  /**
   * Reclassify move handler (D-18/D-20 — wired T-15). Reused for BOTH
   * cross-bucket AND same-bucket moves (confirmacion-reclasificar, issue
   * #749): `ReclasificarMobileControl` calls this with the destination
   * bucket's label for a cross-bucket move, or the destination categoría's
   * name for a same-bucket move — this handler just formats whichever
   * string it receives, so it needed no change to support the second
   * caller. The control calls this ONLY after the PATCH resolves ok
   * (settled announcement, us-055 D-04 lesson). This screen is the ONLY
   * caller of AccessibilityInfo in this change (single announcement source,
   * D-20).
   */
  function handleMovida(label: string) {
    setAnuncio(`Movida a ${label}.`);
    AccessibilityInfo.announceForAccessibility(`Movida a ${label}.`);
  }

  /**
   * handleCategoriaCreada (issue #743): reuses the SAME `anuncio`/
   * AccessibilityInfo mechanism `handleMovida` uses above — one screen-level
   * announcement path for every mutation this screen can trigger, not a new
   * one per affordance. Also bumps `categoriaVersion`, which flows down as a
   * PROP (see this file's docblock for why a per-instance cache clear, not a
   * remount, is what mobile needs here).
   *
   * Second wiring (issue #744): also passed straight through
   * `GrupoMovimientosMobile` to every row's own `ReclasificarMobileControl`
   * (its new "+ Crear categoría" affordance) — a categoría created from
   * EITHER entry point bumps the SAME `categoriaVersion`, so every OTHER
   * row's reclassify picker picks it up too, not just the row/screen that
   * created it. Stays zero-arg (TypeScript accepts a zero-arg handler
   * wherever `(categoria: CategoriaDto) => void` is expected) since this
   * screen only needs to know THAT one was created, never which.
   */
  function handleCategoriaCreada() {
    setCategoriaVersion((v) => v + 1);
    setAnuncio('Categoría creada.');
    AccessibilityInfo.announceForAccessibility('Categoría creada.');
  }

  /**
   * handleOfrecerPatron (issue #745): sets the SCREEN-owned offer state —
   * see this file's docblock for why it must live here rather than inside
   * `ReclasificarMobileControl`/the groups subtree. Fired unconditionally
   * on EVERY successful reclassify (same-bucket and cross-bucket alike); a
   * second reclassify simply replaces whichever offer was pending (same
   * "latest action wins" discipline as `ReclasificarCategoriaControl`'s web
   * counterpart).
   */
  function handleOfrecerPatron(info: {
    descripcion: string;
    categoriaId: string;
  }) {
    setOfrecerPatron(info);
  }

  /**
   * handlePatronCreado (issue #745): reuses the SAME `anuncio`/
   * AccessibilityInfo mechanism every other mutation on this screen uses —
   * copy verbatim from web's `BucketDetalleMesPage.tsx` `alPatronCreado`.
   */
  function handlePatronCreado(patron: string) {
    setOfrecerPatron(null);
    const mensaje = `Patrón «${patron}» creado. Se usará en tus próximas importaciones.`;
    setAnuncio(mensaje);
    AccessibilityInfo.announceForAccessibility(mensaje);
  }

  // patrón-desde-movimiento (issue #745): fixed-position overlay, rendered
  // as a stable sibling in ALL THREE fase branches below (same discipline
  // as `statusRegion`) — see this file's docblock for why.
  const ofrecerPatronOverlay = ofrecerPatron ? (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
      }}
    >
      <OfrecerPatronMobileControl
        descripcion={ofrecerPatron.descripcion}
        categoriaId={ofrecerPatron.categoriaId}
        onCreado={handlePatronCreado}
        onCerrar={() => setOfrecerPatron(null)}
      />
    </View>
  ) : null;

  // status-reclasificar live-region: OUTSIDE groups map — stable sibling (D-20/MDET-05).
  // Rendered in ALL states so it is never unmounted by a state transition.
  const statusRegion = (
    <Text
      testID="status-reclasificar"
      accessibilityRole="alert"
      // RN accessibilityLiveRegion is valid at runtime but TypeScript's RN types don't
      // expose it on TextProps; spread it to avoid tsc errors (D-20).

      {...({ accessibilityLiveRegion: 'polite' } as any)}
    >
      {anuncio}
    </Text>
  );

  if (estado.fase === 'loading') {
    return (
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Back button always present so user can escape a slow load (D-12) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al resumen"
            onPress={onBack}
            style={{ paddingHorizontal: 16, paddingTop: 8 }}
          >
            <Text style={{ fontSize: 14, color: '#3B4266' }}>
              ‹ Volver al resumen
            </Text>
          </Pressable>
          {statusRegion}
          <View
            testID="bucket-detalle-loading"
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text>Cargando...</Text>
          </View>
        </SafeAreaView>
        {/* patrón-desde-movimiento (issue #745): survives this fase — see
            this file's docblock. */}
        {ofrecerPatronOverlay}
      </View>
    );
  }

  if (estado.fase === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {statusRegion}
          <View
            testID="bucket-detalle-error"
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <Text style={{ color: '#D1495B', textAlign: 'center' }}>
              {copiaPorApiError(estado.error)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
              onPress={() => void cargar()}
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: '#3B4266',
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14 }}>Reintentar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver al resumen"
              onPress={onBack}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, color: '#3B4266' }}>
                ‹ Volver al resumen
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
        {ofrecerPatronOverlay}
      </View>
    );
  }

  // data state
  const viewModel = aDetalleBucketMesViewModel(estado.dto);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;
  const esVacio = viewModel.grupos.length === 0;
  // SinCategoria (and any future non-spend bucket) cannot own a categoría
  // (issue #743) — same gate ReclasificarMobileControl already applies to
  // its own picker groups.
  const bucketEsAsignable = (BUCKETS_ASIGNABLES as readonly string[]).includes(
    viewModel.bucket,
  );

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F3F5' }}>
        {/* Back button (D-12) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al resumen"
          onPress={onBack}
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#3B4266' }}>
            ‹ Volver al resumen
          </Text>
        </Pressable>

        {/* Status live-region: always present OUTSIDE groups (D-20/MDET-05) */}
        {statusRegion}

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* M1 header (MDET-02) */}
          <View testID="bucket-detalle-header" style={{ marginBottom: 16 }}>
            {/* Display label via ETIQUETA_BUCKET — NOT raw wire key (MDET-02) */}
            <Text
              style={{ fontSize: 20, fontWeight: 'bold', color: '#2D2F3A' }}
            >
              {etiqueta}
            </Text>

            <SelectorPeriodoMes periodo={periodo} onChange={onChangePeriodo} />

            {/* porcentajeLabel: '—' when sinPorcentaje (SIN_PORCENTAJE_LABEL/MOB-06) */}
            <Text style={{ fontSize: 14, color: '#8A8F9C' }}>
              {viewModel.porcentajeLabel}
            </Text>

            {/* metaLabel / sinMeta: 'Sin meta' text from sinMeta flag (D-22/MDET-02 — screen-layer) */}
            <Text style={{ fontSize: 14, color: '#8A8F9C' }}>
              {viewModel.sinMeta ? 'Sin meta' : viewModel.metaLabel}
            </Text>

            <Text style={{ fontSize: 16, fontWeight: '600', color: '#2D2F3A' }}>
              {viewModel.totalLabel}
            </Text>
            <Text style={{ fontSize: 13, color: '#8A8F9C' }}>
              {viewModel.totalTransacciones} transacciones
            </Text>

            {bucketEsAsignable && (
              <View style={{ marginTop: 12 }}>
                <AgregarCategoriaControl
                  bucket={viewModel.bucket as BucketAsignable}
                  onCreada={handleCategoriaCreada}
                />
              </View>
            )}
          </View>

          {esVacio ? (
            <View
              testID="bucket-detalle-vacio"
              style={{ alignItems: 'center', paddingVertical: 32 }}
            >
              <Text
                style={{ fontSize: 14, color: '#8A8F9C', textAlign: 'center' }}
              >
                No hay transacciones este mes.
              </Text>
            </View>
          ) : (
            // NO `key={categoriaVersion}` here (issue #743, reverted after
            // review): this subtree is NEVER remounted on categoría creation —
            // `categoriaVersion` is instead threaded down as a plain prop (see
            // this file's own docblock) so `GrupoMovimientosMobile`'s own
            // `expandido` accordion state survives.
            <View testID="bucket-detalle-grupos">
              {viewModel.grupos.map((grupo, idx) => (
                <GrupoMovimientosMobile
                  key={grupo.categoriaId ?? 'sin-categoria'}
                  grupo={estado.dto.grupos[idx]!}
                  bucket={bucket}
                  destacar={destacar}
                  onReclasificado={cargar}
                  onMovida={handleMovida}
                  categoriaVersion={categoriaVersion}
                  onCategoriaCreada={handleCategoriaCreada}
                  onOfrecerPatron={handleOfrecerPatron}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      {ofrecerPatronOverlay}
    </View>
  );
}
