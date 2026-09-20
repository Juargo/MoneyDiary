import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import type { EdicionFila } from '../../api/commit-ingesta';
import { formatearFilaPreview } from '../../domain/preview-cartola';
import type { GrupoCategoriaPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import type { CategoriaDto } from '../../domain/catalogo.types';
import { COLORS, ETIQUETA_BUCKET } from '../../theme/colors';
import { SelectorChips } from '../configuracion/SelectorChips';
import { NuevaCategoriaForm } from '../configuracion/NuevaCategoriaForm';

/**
 * HojaClasificacion — the tap-row bottom sheet: a bucket radiogroup, then a
 * categoría radiogroup filtered to that bucket, then Confirmar/Cancelar
 * (Phase 7, design.md D-06; MOB-PRV-07). One instance serves the whole
 * screen; `subir.tsx`'s `revisando` state (Phase 8) opens it for whichever
 * row was tapped by changing `fila`/`categoriaActualId`/`visible`. Unlike
 * `ReclasificarMobileControl` (detalle/), this sheet never calls the
 * network and shows no Alert — it only reports a local pending edit;
 * `commitIngesta` (Phase 8) is the one and only write.
 *
 * Reuses `SelectorChips` (configuracion/, US-044) for BOTH radiogroups
 * instead of duplicating `ReclasificarMobileControl`'s inline bucket-
 * sections Modal body: that control shows every bucket's categorías at
 * once (no selection step), while this sheet needs a genuine two-step
 * bucket→categoría filter (MOB-PRV-07) — `SelectorChips` already IS that
 * generic radiogroup primitive (DRY: extracting something new from
 * `ReclasificarMobileControl` would duplicate what already exists).
 *
 * Pure UI: no fetch, no port. `grupos` (already `agruparPorBucket`-shaped)
 * and `categoriaActualId` are supplied by the caller — design's fetch-
 * ownership decision is that the SCREEN fetches the catalog once on
 * entering `revisando` (Phase 8), so this sheet stays presentational
 * (ADR-024).
 *
 * "+ Crear categoría" (agregar-categoria-desde-selector, issue #744): a
 * trigger next to the categoría radiogroup, shown only once a bucket is
 * chosen (mirrors web's `FilaRevision` "+", gated the same way on its own
 * bucket cascade) — opens the REAL `NuevaCategoriaForm` with
 * `bucketFijo={bucketSeleccionado}`. Unlike the two reclassify surfaces
 * (web `ReclasificarCategoriaControl`, mobile `ReclasificarMobileControl`),
 * the bucket here IS fixed, not a picker: by the time this "+" is reachable
 * the user has already completed the sheet's own two-step bucket→categoría
 * cascade, so re-opening a bucket choice inside the creation form would be
 * a THIRD, redundant bucket picker in the same sheet. This is still "pure"
 * in the sense the file docblock claims: the sheet itself makes no fetch —
 * `NuevaCategoriaForm` (same as `AgregarCategoriaControl`/
 * `ReclasificarMobileControl`) is what owns the `crearCategoria` POST.
 *
 * On success, the created categoría is (a) selected immediately for THIS
 * row (`categoriaSeleccionada` — no need to wait for `grupos` to reflect
 * it) and (b) reported upward via `onCategoriaCreada`, which `subir.tsx`
 * merges into its own `catalogo.grupos` state (screen-owned catalog,
 * per this file's own docblock) so the row list's other affordances and any
 * later re-open of this sheet see it too.
 */
export interface HojaClasificacionProps {
  readonly visible: boolean;
  /** The row this sheet edits — used for display context and `rowIndex`. */
  readonly fila: PreviewFilaDto;
  /** The row's current categoría id (design's "the current categoría" prop), or `null`. */
  readonly categoriaActualId: string | null;
  readonly grupos: readonly GrupoCategoriaPorBucket[];
  readonly onConfirmar: (edicion: EdicionFila) => void;
  readonly onCancelar: () => void;
  /**
   * agregar-categoria-desde-selector (issue #744): REQUIRED, same
   * banned-pattern discipline (us-044 PR7) as `onConfirmar`/`onCancelar`.
   * See this file's own docblock for the full contract.
   */
  readonly onCategoriaCreada: (categoria: CategoriaDto) => void;
}

export function HojaClasificacion({
  visible,
  fila,
  categoriaActualId,
  grupos,
  onConfirmar,
  onCancelar,
  onCategoriaCreada,
}: HojaClasificacionProps) {
  return (
    <Modal
      testID="hoja-clasificacion"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancelar}
    >
      {/* Rendered ONLY while `visible`, and `key`ed by the row, so the
          selection state below initializes fresh on every opening instead
          of being synced from an effect — no stale-props risk, no
          `react-hooks/*` suppressions. */}
      {visible ? (
        <HojaClasificacionContenido
          key={fila.rowIndex}
          fila={fila}
          categoriaActualId={categoriaActualId}
          grupos={grupos}
          onConfirmar={onConfirmar}
          onCancelar={onCancelar}
          onCategoriaCreada={onCategoriaCreada}
        />
      ) : null}
    </Modal>
  );
}

type ContenidoProps = Omit<HojaClasificacionProps, 'visible'>;

function esBucketAsignable(bucket: string): bucket is BucketAsignable {
  return (BUCKETS_ASIGNABLES as readonly string[]).includes(bucket);
}

function HojaClasificacionContenido({
  fila,
  categoriaActualId,
  grupos,
  onConfirmar,
  onCancelar,
  onCategoriaCreada,
}: ContenidoProps) {
  const gruposAsignables = grupos.filter(
    (g): g is GrupoCategoriaPorBucket & { bucket: BucketAsignable } =>
      esBucketAsignable(g.bucket),
  );
  const grupoActual = gruposAsignables.find((g) =>
    g.categorias.some((c) => c.id === categoriaActualId),
  );

  const [bucketSeleccionado, setBucketSeleccionado] = useState<
    BucketAsignable | ''
  >(() => grupoActual?.bucket ?? '');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(
    () => categoriaActualId ?? '',
  );
  // agregar-categoria-desde-selector (issue #744).
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  const buckets = gruposAsignables.map((g) => g.bucket);
  const categoriasDelBucket =
    gruposAsignables.find((g) => g.bucket === bucketSeleccionado)?.categorias ??
    [];

  function handleSelectBucket(bucket: BucketAsignable) {
    setBucketSeleccionado(bucket);
    setCategoriaSeleccionada('');
  }

  function handleConfirmar() {
    if (!categoriaSeleccionada) return;
    onConfirmar({
      rowIndex: fila.rowIndex,
      categoriaId: categoriaSeleccionada,
    });
  }

  /**
   * alCategoriaCreada (issue #744) — selects the created categoría for
   * THIS row directly (no need to wait for `grupos` to reflect it) and
   * reports it upward via `onCategoriaCreada` (see this file's own
   * docblock for the full contract).
   */
  function alCategoriaCreada(categoria: CategoriaDto) {
    setCreandoCategoria(false);
    setCategoriaSeleccionada(categoria.id);
    onCategoriaCreada(categoria);
  }

  const formateada = formatearFilaPreview(fila);
  const puedeConfirmar = categoriaSeleccionada !== '';

  return (
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
          padding: 16,
          gap: 16,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: COLORS.heading,
              }}
            >
              Clasificar movimiento
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.muted }}>
              {formateada.descripcion}
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.muted }}>
              {formateada.fecha}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            testID="hoja-cancelar"
            onPress={onCancelar}
          >
            <Text style={{ fontSize: 14, color: COLORS.ingreso }}>
              Cancelar
            </Text>
          </Pressable>
        </View>

        <SelectorChips
          testID="hoja-bucket"
          label="Bucket"
          options={buckets}
          value={bucketSeleccionado as BucketAsignable}
          getOptionLabel={(b) => ETIQUETA_BUCKET[b] ?? b}
          onChange={handleSelectBucket}
        />

        {creandoCategoria ? (
          /* "+ Crear categoría" (issue #744): bucket FIXED to
             `bucketSeleccionado` — see this file's docblock for why a
             picker would be a redundant third bucket choice here. Replaces
             the categoría radiogroup + Confirmar while open, same
             "at most one panel" idiom `ReclasificarMobileControl` uses. */
          <NuevaCategoriaForm
            bucketFijo={bucketSeleccionado || undefined}
            onCreada={alCategoriaCreada}
            onCancelar={() => setCreandoCategoria(false)}
          />
        ) : (
          <>
            <SelectorChips
              testID="hoja-categoria"
              label="Categoría"
              options={categoriasDelBucket.map((c) => c.id)}
              value={categoriaSeleccionada}
              getOptionLabel={(id) =>
                categoriasDelBucket.find((c) => c.id === id)?.nombre ?? id
              }
              onChange={setCategoriaSeleccionada}
            />

            {bucketSeleccionado !== '' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Crear categoría"
                testID="hoja-crear-categoria-trigger"
                onPress={() => setCreandoCategoria(true)}
                style={{ paddingVertical: 4 }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '500',
                    color: COLORS.ingreso,
                  }}
                >
                  + Crear categoría
                </Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
              accessibilityState={{ disabled: !puedeConfirmar }}
              disabled={!puedeConfirmar}
              testID="hoja-confirmar"
              onPress={handleConfirmar}
              style={{
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: puedeConfirmar
                  ? COLORS.ingreso
                  : COLORS.canvas,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: puedeConfirmar ? '#ffffff' : COLORS.muted,
                }}
              >
                Confirmar
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
