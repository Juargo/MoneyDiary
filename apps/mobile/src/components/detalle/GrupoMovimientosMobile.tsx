/**
 * GrupoMovimientosMobile — accordion group component (US-056, D-04/D-19/MDET-03).
 *
 * Renders one categoria group from the M1 bucket detail screen:
 * - First 3 rows always visible; "Ver N más" / "Ver menos" toggle for larger groups.
 * - `accessibilityState={{ expanded }}` on the toggle Pressable (MDET-03).
 * - testID families: `grupo-movimientos-${id}`, `grupo-toggle-${id}`, `movimiento-${tx.id}`.
 * - SinCategoria dual destacado mechanics (D-19/MDET-03):
 *     root always carries `testID="grupo-movimientos-sin-categoria"` (stable);
 *     INNER wrapper `testID="grupo-sin-categoria-destacado"` renders ONLY when
 *     `destacar === "sin-categoria"` — conditional, not stable.
 *
 * Each row renders a ReclasificarMobileControl (D-17/D-19). The control is wired
 * via `onReclasificado` and `onMovida` REQUIRED props threaded from BucketDetalleScreen
 * (T-15). No optional-callback silent-noop variant (us-044 PR7 banned-pattern).
 *
 * Pure: no fetch, no router.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { aFechaCorta } from '../../domain/fecha-corta';
import { formatearMontoCLP } from '../../domain/formatear-monto';
import type { GrupoDetalleBucketMesDto } from '../../domain/detalle.types';
import { ReclasificarMobileControl } from './ReclasificarMobileControl';

/** Number of rows visible before the accordion collapses the rest (web parity D-04). */
const FILAS_VISIBLES = 3;

interface TxVM {
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly montoLabel: string;
}

function asTxVM(tx: GrupoDetalleBucketMesDto['transacciones'][number]): TxVM {
  return {
    id: tx.id,
    fecha: tx.fecha,
    descripcion: tx.descripcion,
    montoLabel: formatearMontoCLP(tx.monto),
  };
}

interface GrupoMovimientosMobileProps {
  readonly grupo: GrupoDetalleBucketMesDto;
  /**
   * Raw wire bucket key (e.g. 'Deseos') for the screen that owns this group.
   * GrupoDetalleBucketMesDto does not carry the bucket key per group — the screen
   * passes its own `bucket` prop down so categoriaActual.bucket is correct for
   * same-bucket detection in ReclasificarMobileControl.
   */
  readonly bucket: string;
  /** When `"sin-categoria"`, renders the inner destacado wrapper inside SinCategoria root (D-19/MDET-03). */
  readonly destacar?: string;
  /**
   * REQUIRED: called after a successful reclassify PATCH so the screen can refetch
   * the open detail (D-17/D-18). Typically wired to BucketDetalleScreen's cargar(),
   * which is async. The prop accepts a void-or-Promise return so the async cargar
   * type is not hidden; the call site fires-and-forgets (not awaited by this component).
   * Non-optional: the us-044 PR7 banned-pattern (optional-callback-silent-noop) is
   * explicitly avoided here.
   */
  readonly onReclasificado: () => void | Promise<void>;
  /**
   * REQUIRED: called on cross-bucket success with the ETIQUETA_BUCKET display label
   * of the destination bucket. Screen owns both setAnuncio and announceForAccessibility
   * (D-20 single announcement source). Non-optional per us-044 PR7 case law.
   */
  readonly onMovida: (bucketLabel: string) => void;
}

/**
 * GrupoMovimientosMobile renders one categoría group with an expandable
 * accordion when the group has more than 3 rows. Each row includes a
 * ReclasificarMobileControl for cross-bucket reclassification (T-15/D-17).
 */
export function GrupoMovimientosMobile({
  grupo,
  bucket,
  destacar,
  onReclasificado,
  onMovida,
}: GrupoMovimientosMobileProps) {
  const [expandido, setExpandido] = useState(false);

  const categoriaId = grupo.categoriaId;
  const nombre = grupo.nombre;
  const subtotalLabel = formatearMontoCLP(grupo.subtotal);
  const transacciones = grupo.transacciones.map(asTxVM);

  const idPart = categoriaId ?? 'sin-categoria';
  const esSinCategoria = categoriaId === null;
  const debeDestacar = esSinCategoria && destacar === 'sin-categoria';

  const tieneToggle = transacciones.length > FILAS_VISIBLES;
  const filasMostradas =
    tieneToggle && !expandido
      ? transacciones.slice(0, FILAS_VISIBLES)
      : transacciones;

  const textoToggle = expandido
    ? 'Ver menos'
    : `Ver ${transacciones.length - FILAS_VISIBLES} más`;

  // categoriaActual for all transactions in this group is the group's categoria.
  // GrupoDetalleBucketMesDto does not carry the bucket key — the screen passes
  // its own `bucket` prop (the raw wire bucket key, e.g. 'Deseos') so the
  // ReclasificarMobileControl can compare categoriaActual.bucket with the
  // chosen category's bucket for same-bucket detection.
  // SinCategoria groups have no category so we use the sentinel 'SinCategoria'
  // (not a BUCKETS_ASIGNABLES member → cross-bucket Alert always shows, which
  // is correct behaviour: SinCategoria txs have no home bucket).
  const categoriaActual = {
    id: categoriaId ?? '',
    nombre,
    bucket: categoriaId !== null ? bucket : 'SinCategoria',
  };

  // Inner content (header + rows + optional toggle)
  const contenido = (
    <>
      <Text style={{ fontWeight: 'bold', fontSize: 14 }}>{nombre}</Text>
      <Text style={{ fontSize: 12, color: '#8A8F9C' }}>{subtotalLabel}</Text>

      {filasMostradas.map((tx) => (
        <View
          key={tx.id}
          testID={`movimiento-${tx.id}`}
          style={{ paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 13 }}>{aFechaCorta(tx.fecha)}</Text>
          <Text style={{ fontSize: 13 }}>{tx.descripcion}</Text>
          <Text style={{ fontSize: 13, fontWeight: '500' }}>
            {tx.montoLabel}
          </Text>
          {/* Reclassify control — wired per D-17/D-19/T-15 */}
          <ReclasificarMobileControl
            tx={tx}
            categoriaActual={categoriaActual}
            onReclasificado={onReclasificado}
            onMovida={onMovida}
          />
        </View>
      ))}

      {tieneToggle && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: expandido }}
          testID={`grupo-toggle-${idPart}`}
          onPress={() => setExpandido((prev) => !prev)}
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 13, color: '#3B4266', fontWeight: '500' }}>
            {textoToggle}
          </Text>
        </Pressable>
      )}
    </>
  );

  // SinCategoria dual destacado mechanics (D-19/MDET-03):
  // root is always `grupo-movimientos-sin-categoria` (stable);
  // inner wrapper `grupo-sin-categoria-destacado` only when destacar is active.
  if (esSinCategoria) {
    return (
      <View
        testID="grupo-movimientos-sin-categoria"
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#F3F3F5',
        }}
      >
        {debeDestacar ? (
          <View
            testID="grupo-sin-categoria-destacado"
            style={{
              borderWidth: 2,
              borderColor: '#464B69',
              borderRadius: 6,
              padding: 8,
            }}
          >
            {contenido}
          </View>
        ) : (
          contenido
        )}
      </View>
    );
  }

  return (
    <View
      testID={`grupo-movimientos-${idPart}`}
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#F3F3F5',
      }}
    >
      {contenido}
    </View>
  );
}
