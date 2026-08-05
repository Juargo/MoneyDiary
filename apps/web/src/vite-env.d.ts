/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL base absoluta del API, para llamadas públicas cross-origin (hoy solo
   * `GET /version`). Pública — NO contiene secretos (la `x-api-key` sigue
   * inyectándose server-side por el proxy). Dev: `http://localhost:3000`;
   * prod: la URL de Render, seteada como env var del proyecto en Vercel.
   */
  readonly VITE_API_BASE_URL?: string;
}
