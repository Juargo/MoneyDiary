/**
 * impacto-catalogo.ts — US-044 PR6b, T6b.2
 *
 * `ImpactoCatalogo` union + `fraseDeImpacto` — the pure Alert.alert payload
 * translator for both confirmation flows on the edit-category screen.
 *
 * Ported verbatim from
 * `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts:180-247`,
 * adapted for mobile:
 *
 *   - `ETIQUETA_BUCKET` is consumed from `src/theme/colors.ts:57-62` — the
 *     same data, already shipped in mobile (design §1.6: "not ported —
 *     `src/theme/colors.ts:57-62` already ships it"). Web's import path
 *     (`lib/bucket-labels`) is NOT ported.
 *   - `etiquetaTransacciones` is consumed from `domain/plural.ts` (ported
 *     in PR5a, T5a.4). Same function, different module path.
 *   - `ImpactoCatalogo` members are renamed to be self-documenting in the
 *     mobile context: `'eliminar'` (web) → `'eliminar-categoria'`,
 *     `'cambiar-bucket'` stays the same. The rename makes the switch
 *     exhaustive over mobile's own union without ambiguity.
 *   - The `const _exhaustive: never = i` totality guard is preserved
 *     verbatim (tsc-enforced exhaustiveness, design §1.6).
 *
 * The zero case SOFTENS the sentence — it never SKIPS the confirmation.
 * Both `ImpactoCatalogo` members return a full `{titulo, lineas, textoConfirmar}`
 * regardless of `transaccionesCount`. This is the invariant design §1.11 names.
 *
 * Pure: no React, no fetch, no env.
 */

import { ETIQUETA_BUCKET } from '../theme/colors';
import { etiquetaTransacciones } from './plural';

export type ImpactoCatalogo =
  | {
      readonly tipo: 'eliminar-categoria';
      readonly nombre: string;
      readonly transaccionesCount: number;
    }
  | {
      readonly tipo: 'cambiar-bucket';
      readonly nombre: string;
      readonly transaccionesCount: number;
      readonly bucketAnterior: string;
      readonly bucketNuevo: string;
    };

/** Resolve bucket wire name → user-facing label via the already-shipped map. */
function etiqueta(bucket: string): string {
  return ETIQUETA_BUCKET[bucket] ?? bucket;
}

/**
 * Translate an `ImpactoCatalogo` into the exact copy rendered by
 * `Alert.alert` in `EditarCategoria`. The returned `lineas` are joined
 * with `'\n'` at the call site (design §1.11's shape).
 */
export function fraseDeImpacto(i: ImpactoCatalogo): {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly textoConfirmar: string;
} {
  switch (i.tipo) {
    case 'eliminar-categoria': {
      const lineas =
        i.transaccionesCount > 0
          ? [
              `Vas a eliminar «${i.nombre}».`,
              `${etiquetaTransacciones(i.transaccionesCount)} ${i.transaccionesCount === 1 ? 'queda' : 'quedan'} en Sin categoría, en todos los períodos.`,
              'Esta acción no se puede deshacer.',
            ]
          : [
              `Vas a eliminar «${i.nombre}».`,
              'No tiene transacciones asociadas.',
              'Esta acción no se puede deshacer.',
            ];
      return {
        titulo: 'Eliminar categoría',
        lineas,
        textoConfirmar: 'Eliminar',
      };
    }
    case 'cambiar-bucket': {
      const cabecera = `«${i.nombre}» pasa de ${etiqueta(i.bucketAnterior)} a ${etiqueta(i.bucketNuevo)}.`;
      const lineas =
        i.transaccionesCount > 0
          ? [
              cabecera,
              `Esto mueve ${etiquetaTransacciones(i.transaccionesCount)} en TODOS los períodos, incluidos los meses ya cerrados.`,
              'Tu resumen 50/30/20 va a cambiar para esos meses.',
            ]
          : [
              cabecera,
              'No tiene transacciones asociadas, así que no se mueve ningún monto.',
            ];
      return {
        titulo: 'Cambiar el bucket',
        lineas,
        textoConfirmar: 'Cambiar bucket',
      };
    }
    default: {
      // Totality guard: tsc raises a compile error if a new ImpactoCatalogo
      // member is added without a corresponding case in this switch.
      const _exhaustive: never = i;
      return _exhaustive;
    }
  }
}
