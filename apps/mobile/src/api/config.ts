/**
 * Lee las variables de entorno EXPO_PUBLIC_* una sola vez (build-time,
 * inlineadas por Metro). Stub de scaffold (T2.7, PR 2) — el cliente HTTP que
 * las consume (`client.ts`, fetchResumen) es scope de PR 3.
 *
 * Nota de seguridad (D4, design.md): EXPO_PUBLIC_API_KEY queda inlineado en
 * el binario compilado y es extraíble de un build descargado. Es un
 * deterrente de scraping casual, NO autenticación real.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
