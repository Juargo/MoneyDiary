/**
 * CeldaFecha — bucket-detalle-lista-rediseño mobile port (Cambio 3/4).
 *
 * Shared fecha cell for BOTH mobile movimientos lists
 * (`GrupoMovimientosMobile` and `IngresosMesLista`), so the two lists read
 * identically (parity with web's `GrupoMovimientos.tsx`, which does the same
 * day + weekday split). Purely presentational — no domain import, no
 * `Date`/ISO parsing: the caller already ran `aDiaConSemana`/
 * `aFechaLargaLabel` (or read the view-model fields that already did) and
 * hands this component ready-to-render strings. Extracted to one file
 * instead of duplicating the JSX in both lists (DRY) — it also gives the RN
 * accessibility claim below exactly one place to test.
 *
 * `accessibilityLabel` on the OUTER `<Text>` is the RN equivalent of web's
 * `sr-only` span: it replaces the announced name entirely — a screen reader
 * hears "3 de agosto de 2026", never "03 LUN" (verified in
 * `CeldaFecha.spec.tsx` against RNTL's own accessible-name computation,
 * which mirrors real RN accessibility semantics — an element's own explicit
 * `accessibilityLabel` is returned as-is, without descending into its
 * children). The two inner `<Text>`s carry the VISIBLE day/weekday and no
 * label of their own on purpose.
 */

import { Text } from 'react-native';

interface CeldaFechaProps {
  /** 2-digit day, e.g. '03' (`aDiaConSemana(fechaIso).dia`). */
  readonly dia: string;
  /** Lowercase weekday abbreviation, e.g. 'lun' — uppercased here for display. */
  readonly diaSemana: string;
  /** Full Spanish date label, e.g. '3 de agosto de 2026' (`aFechaLargaLabel`). */
  readonly fechaLargaLabel: string;
}

export function CeldaFecha({
  dia,
  diaSemana,
  fechaLargaLabel,
}: CeldaFechaProps) {
  return (
    <Text
      accessibilityLabel={fechaLargaLabel}
      style={{ fontSize: 13, color: '#8A8F9C' }}
    >
      <Text style={{ fontVariant: ['tabular-nums'], color: '#2D2F3A' }}>
        {dia}
      </Text>{' '}
      <Text style={{ fontSize: 11 }}>{diaSemana.toUpperCase()}</Text>
    </Text>
  );
}
