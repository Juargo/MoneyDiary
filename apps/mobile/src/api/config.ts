/**
 * Lee las variables de entorno EXPO_PUBLIC_* una sola vez (build-time,
 * inlineadas por Metro). Consumidas por `client.ts` (fetchResumen, PR 3).
 *
 * Nota de seguridad (D4, design.md): EXPO_PUBLIC_API_KEY queda inlineado en
 * el binario compilado y es extraíble de un build descargado. Es un
 * deterrente de scraping casual, NO autenticación real.
 *
 * Un `API_BASE_URL` ausente/vacío se trata como "no configurado" — el
 * cliente HTTP debe fallar de forma visible ({tag:'network'}) en vez de
 * hacer fetch a `undefined/...` (design.md B.3).
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || undefined;
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
