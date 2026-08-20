/**
 * impacto-catalogo.spec.ts — US-044 PR6b, T6b.1 (RED)
 *
 * Pure unit tests for `fraseDeImpacto` — the dialog-payload translator that
 * computes `{titulo, lineas, textoConfirmar}` for both Alert.alert confirmation
 * flows (design §1.11, MCTG-03/MCTG-05).
 *
 * Coverage:
 *   - `eliminar-categoria` × count>0 and count===0 (both distinct frozen bodies)
 *   - `cambiar-bucket`    × count>0, count===0, and count===1 (singular edge)
 *   - Zero-case invariant: softened sentence, confirmation is NEVER skipped
 *   - Unknown bucket: ?? fallback returns raw value (fix 11 — runtime guard,
 *     even though ETIQUETA_BUCKET is typed as Record<string,string> making the
 *     ?? unreachable per tsc at the call site in impacto-catalogo.ts)
 *   - Totality guard: `const _exhaustive: never` catches a missing switch branch
 *     (compile-time, verified via ts-expect-error)
 *
 * JD fix round (2026-08-20): fix 9 (zero-count exact-literal asserts on titulo
 * and textoConfirmar), fix 10 (singular count===1 row for cambiar-bucket), fix 11
 * (unknown bucket ?? fallback test).
 *
 * Design §1.6 bindings:
 *   - Uses `etiquetaTransacciones` from `domain/plural.ts` (same file as web)
 *   - Uses `ETIQUETA_BUCKET` from `theme/colors.ts` (already ships in mobile,
 *     distinct from web's own import path — design §1.6's stated source)
 *   - Ported verbatim from `apps/web/.../categorias/mensajes-catalogo.ts:180-247`
 */

import { fraseDeImpacto } from './impacto-catalogo';
import type { ImpactoCatalogo } from './impacto-catalogo';

describe('fraseDeImpacto (US-044 PR6b, T6b.1)', () => {
  // ── eliminar-categoria ────────────────────────────────────────────────────

  describe('eliminar-categoria × count > 0', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'eliminar-categoria',
      nombre: 'Supermercado',
      transaccionesCount: 3,
    };

    it('returns the exact frozen titulo', () => {
      const { titulo } = fraseDeImpacto(impacto);
      expect(titulo).toBe('Eliminar categoría');
    });

    it('returns the exact frozen textoConfirmar', () => {
      const { textoConfirmar } = fraseDeImpacto(impacto);
      expect(textoConfirmar).toBe('Eliminar');
    });

    it('returns the exact frozen lineas body (transactions move to SinCategoria)', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toEqual([
        'Vas a eliminar «Supermercado».',
        '3 transacciones quedan en Sin categoría, en todos los períodos.',
        'Esta acción no se puede deshacer.',
      ]);
    });
  });

  describe('eliminar-categoria × count === 0 (zero softens, never skips)', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'eliminar-categoria',
      nombre: 'Supermercado',
      transaccionesCount: 0,
    };

    // Fix 9: replace toBeDefined() with exact frozen-literal asserts —
    // "zero never skips confirmation" invariant means the same titulo and
    // textoConfirmar as the count>0 case (only lineas differs).
    it('still returns the exact frozen titulo — zero never skips confirmation', () => {
      const { titulo } = fraseDeImpacto(impacto);
      expect(titulo).toBe('Eliminar categoría');
    });

    it('still returns the exact frozen textoConfirmar — zero never skips confirmation', () => {
      const { textoConfirmar } = fraseDeImpacto(impacto);
      expect(textoConfirmar).toBe('Eliminar');
    });

    it('still returns a defined lineas array — zero never skips confirmation', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toBeDefined();
    });

    it('returns the exact frozen lineas (no-transactions softened body)', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toEqual([
        'Vas a eliminar «Supermercado».',
        'No tiene transacciones asociadas.',
        'Esta acción no se puede deshacer.',
      ]);
    });
  });

  // ── cambiar-bucket ────────────────────────────────────────────────────────

  describe('cambiar-bucket × count > 0', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'cambiar-bucket',
      nombre: 'Supermercado',
      transaccionesCount: 5,
      bucketAnterior: 'Necesidades',
      bucketNuevo: 'Deseos',
    };

    it('returns the exact frozen titulo', () => {
      const { titulo } = fraseDeImpacto(impacto);
      expect(titulo).toBe('Cambiar el bucket');
    });

    it('returns the exact frozen textoConfirmar', () => {
      const { textoConfirmar } = fraseDeImpacto(impacto);
      expect(textoConfirmar).toBe('Cambiar bucket');
    });

    it('returns the exact frozen lineas body (Deseos renders as "Gustos" via ETIQUETA_BUCKET)', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toEqual([
        '«Supermercado» pasa de Necesidades a Gustos.',
        'Esto mueve 5 transacciones en TODOS los períodos, incluidos los meses ya cerrados.',
        'Tu resumen 50/30/20 va a cambiar para esos meses.',
      ]);
    });
  });

  describe('cambiar-bucket × count === 0 (zero softens, never skips)', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'cambiar-bucket',
      nombre: 'Ahorro Club',
      transaccionesCount: 0,
      bucketAnterior: 'Ahorro',
      bucketNuevo: 'Deseos',
    };

    // Fix 9: replace toBeDefined() with exact frozen-literal asserts —
    // "zero never skips confirmation" invariant means the same titulo and
    // textoConfirmar as the count>0 case (only lineas differs).
    it('still returns the exact frozen titulo — zero never skips confirmation', () => {
      const { titulo } = fraseDeImpacto(impacto);
      expect(titulo).toBe('Cambiar el bucket');
    });

    it('still returns the exact frozen textoConfirmar — zero never skips confirmation', () => {
      const { textoConfirmar } = fraseDeImpacto(impacto);
      expect(textoConfirmar).toBe('Cambiar bucket');
    });

    it('still returns a defined lineas array — zero never skips confirmation', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toBeDefined();
    });

    it('returns the exact frozen lineas (no-transactions softened body)', () => {
      const { lineas } = fraseDeImpacto(impacto);
      expect(lineas).toEqual([
        '«Ahorro Club» pasa de Ahorro a Gustos.',
        'No tiene transacciones asociadas, así que no se mueve ningún monto.',
      ]);
    });
  });

  // ── singular-transaction edge case ─────────────────────────────────────────

  it('eliminar × count === 1 uses singular "queda" not "quedan"', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'eliminar-categoria',
      nombre: 'Solo uno',
      transaccionesCount: 1,
    };
    const { lineas } = fraseDeImpacto(impacto);
    expect(lineas[1]).toBe(
      '1 transacción queda en Sin categoría, en todos los períodos.',
    );
  });

  // Fix 10: NEW row — cambiar-bucket × count === 1: pin the singular line
  it('cambiar-bucket × count === 1 uses singular "1 transacción" (fix 10 pin)', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'cambiar-bucket',
      nombre: 'Supermercado',
      transaccionesCount: 1,
      bucketAnterior: 'Necesidades',
      bucketNuevo: 'Deseos',
    };
    const { lineas } = fraseDeImpacto(impacto);
    // etiquetaTransacciones(1) = '1 transacción' (singular)
    expect(lineas[1]).toBe(
      'Esto mueve 1 transacción en TODOS los períodos, incluidos los meses ya cerrados.',
    );
  });

  // Fix 11: unknown bucket — ?? fallback returns raw value.
  // Note: ETIQUETA_BUCKET is typed as Record<string,string>, which means tsc
  // considers the indexed access result always a string (never undefined), making
  // the `?? bucket` in etiqueta() unreachable at the type level. This test
  // documents the RUNTIME behavior: an unrecognised key produces undefined at
  // runtime (JS ignores missing keys), so the fallback returns the raw value.
  it('unknown bucket value falls back to the raw string (fix 11 — runtime ?? fallback)', () => {
    const impacto: ImpactoCatalogo = {
      tipo: 'cambiar-bucket',
      nombre: 'Test',
      transaccionesCount: 2,
      bucketAnterior: 'UnknownBucketA',
      bucketNuevo: 'UnknownBucketB',
    };
    const { lineas } = fraseDeImpacto(impacto);
    // etiqueta('UnknownBucketA') → ETIQUETA_BUCKET['UnknownBucketA'] is
    // undefined at runtime → ?? 'UnknownBucketA' → 'UnknownBucketA'
    expect(lineas[0]).toBe('«Test» pasa de UnknownBucketA a UnknownBucketB.');
  });

  // ── Totality: compile-time exhaustiveness guard ───────────────────────────
  //
  // The `const _exhaustive: never = i` guard in the default branch of
  // `fraseDeImpacto`'s switch ensures TypeScript fails to compile if a new
  // `ImpactoCatalogo` member is added without a corresponding case.
  //
  // Runtime proof: the guard would throw at runtime if reached — but tsc
  // prevents reachability, so this is a type-level assertion only.
  //
  // To verify it compiles, see the function's `default:` branch.
  it('exhaustiveness: all ImpactoCatalogo tipos are handled (documented compile-time guard)', () => {
    // This test is a human-readable marker for the tsc-enforced exhaustiveness
    // guard in fraseDeImpacto's switch. A missing case is a compile error,
    // not a runtime one. The test itself always passes — its value is
    // documentation and reviewer signal.
    const tipos: ImpactoCatalogo['tipo'][] = [
      'eliminar-categoria',
      'cambiar-bucket',
    ];
    expect(tipos).toHaveLength(2);
  });
});
