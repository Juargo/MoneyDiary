import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import type { EdicionFila } from '../../api/commit-ingesta';
import { formatearFilaPreview } from '../../domain/preview-cartola';
import type { GrupoCategoriaPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { COLORS, ETIQUETA_BUCKET } from '../../theme/colors';
import { SelectorChips } from '../configuracion/SelectorChips';

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
}

export function HojaClasificacion({
  visible,
  fila,
  categoriaActualId,
  grupos,
  onConfirmar,
  onCancelar,
}: HojaClasificacionProps) {
  const [bucketSeleccionado, setBucketSeleccionado] = useState<
    BucketAsignable | ''
  >('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');

  // Re-derive the initial selection only when the sheet OPENS (visible
  // false→true) — never on every re-render while it stays open, which
  // would clobber an in-progress selection if the caller re-renders with a
  // new `grupos`/`categoriaActualId` reference for an unrelated reason.
  // The sheet only ever opens for one row at a time (RN Modal is a
  // full-screen overlay, see design.md), so keying on `visible` alone is
  // sufficient — `grupos`/`categoriaActualId`/`fila` are read fresh from
  // the closure at the moment `visible` flips.
  useEffect(() => {
    if (!visible) return;
    const grupoActual = grupos.find((g) =>
      g.categorias.some((c) => c.id === categoriaActualId),
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBucketSeleccionado((grupoActual?.bucket as BucketAsignable) ?? '');
    setCategoriaSeleccionada(categoriaActualId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const gruposAsignables = grupos.filter((g) =>
    (BUCKETS_ASIGNABLES as readonly string[]).includes(g.bucket),
  );
  const buckets = gruposAsignables.map((g) => g.bucket as BucketAsignable);
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

  const formateada = formatearFilaPreview(fila);
  const puedeConfirmar = categoriaSeleccionada !== '';

  return (
    <Modal
      testID="hoja-clasificacion"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancelar}
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
              backgroundColor: puedeConfirmar ? COLORS.ingreso : COLORS.canvas,
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
        </View>
      </View>
    </Modal>
  );
}
