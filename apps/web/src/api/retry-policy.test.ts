import { describe, expect, it } from 'vitest';
import { TAGS_ERROR_PERMANENTE, esErrorPermanente } from './retry-policy';

// ingesta-pdf-password Slice 4 (Phase 18, design.md D-10): a protected-PDF
// 400 (`code: 'PDF_PROTEGIDO' | 'PDF_PASSWORD_INCORRECTA'`) rides the SAME
// `'invalid'` tag every other 400 already uses (client.ts, Phase 16/17's
// additive `code?` widening). This is a regression guard, not new behavior
// — `'invalid'` was already permanent before this change (client.error must
// never auto-retry a "wrong password" response: the user retries by typing,
// not by TanStack Query's retry machinery). If this test ever fails, that
// IS the finding — it means the widening in Phase 16 accidentally changed
// retry semantics for every other 'invalid' consumer too.
describe('retry-policy — ingesta-pdf-password Slice 4 (Phase 18)', () => {
  it("'invalid' sigue siendo un tag permanente después de que ApiError ganó 'code' opcional (PDF_PROTEGIDO/PDF_PASSWORD_INCORRECTA no deben auto-reintentarse)", () => {
    expect(TAGS_ERROR_PERMANENTE.has('invalid')).toBe(true);
  });

  it('esErrorPermanente sigue considerando permanente un ApiError "invalid" con code PDF_PROTEGIDO', () => {
    expect(
      esErrorPermanente({
        tag: 'invalid',
        message: 'El archivo PDF requiere una contraseña.',
        code: 'PDF_PROTEGIDO',
      }),
    ).toBe(true);
  });
});

// issue #778 (catálogo incompleto): previewIngesta/postCommitIngesta ahora
// mapean el 409 CATALOGO_INCOMPLETO al mismo tag 'invalid' que un 400 (ver
// client.ts). Sin este test explícito, `esErrorPermanente` ya lo trataría
// como permanente porque solo mira `tag` — pero el objetivo del cambio en
// client.ts era justamente que el 409 dejara de reintentarse, así que se
// documenta con su propio caso en vez de depender solo de la cobertura
// genérica de 'invalid' de arriba.
describe('retry-policy — issue #778 (catálogo incompleto)', () => {
  it('un ApiError "invalid" con code CATALOGO_INCOMPLETO (409) es permanente — no se reintenta', () => {
    expect(
      esErrorPermanente({
        tag: 'invalid',
        message:
          'No pudimos clasificar los movimientos: falta la categoría Desconocido de Gustos en tu catálogo.',
        code: 'CATALOGO_INCOMPLETO',
      }),
    ).toBe(true);
  });
});
