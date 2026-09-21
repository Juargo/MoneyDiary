/**
 * Controlador de "hay una versión nueva" (issue #751). External store con el
 * mismo patrón que `controlador-tema.ts`: toda dependencia del entorno
 * (`fetch`, `documento`, `ventana`) llega inyectada — la única forma de
 * probar `iniciar()` (el intervalo + los listeners de `visibilitychange` y
 * `vite:preloadError`) en jsdom sin depender de los globales reales ni de
 * red real.
 *
 * ## Qué compara
 * Compara el `commit` embebido en `<meta name="app-commit">` (inyectado por
 * `buildInfoPlugin`, `vite.config.ts`) contra el `commit` de un fetch fresco
 * a `/version.json`. Se usa el commit (el hash de Git), no la versión
 * semver: un deploy sin bump de versión (ej. un commit `chore:`, que
 * release-please no versiona) igual sirve un bundle distinto, y el commit es
 * la identidad real de "qué está deployado" (mismo criterio que el
 * docstring de `buildInfoPlugin`).
 *
 * ## Cuándo verifica (issue #751 "no aggressive polling")
 * - `iniciar()` NO dispara un fetch inmediato — solo arma los listeners y el
 *   intervalo.
 * - En cada transición de `visibilitychange` hacia visible: una pestaña que
 *   estuvo en segundo plano se entera de inmediato al volver al frente.
 * - Cada `intervaloMs` (default 30 minutos) — SOLO si el documento está
 *   visible en ese instante. El propio `setInterval` sigue corriendo en
 *   segundo plano (no cuesta red), pero el tick es un no-op mientras la
 *   pestaña está oculta: una pestaña abierta y olvidada en segundo plano no
 *   martilla la red. 30 minutos es deliberadamente largo — esto es un aviso
 *   de cortesía ("hay una versión nueva, recarga cuando quieras"), no una
 *   sincronización en tiempo real; el chequeo en foco/visibilitychange ya
 *   cubre el caso que de verdad importa (volver a una pestaña vieja).
 * - En un evento `vite:preloadError` (Vite lo emite cuando un `import()`
 *   dinámico de un chunk con hash falla — típicamente un chunk de ruta que
 *   ya no existe en el servidor tras un deploy nuevo, ADR-030/TanStack
 *   Router `autoCodeSplitting`). Acá no hace falta el fetch: el propio
 *   fallo de import ya prueba que el bundle corriendo quedó desactualizado.
 *   `event.preventDefault()` evita que Vite relance el fallo como una
 *   excepción no capturada (lo que rompería la pantalla en vez de mostrar
 *   el mismo aviso no bloqueante que un chequeo de versión normal).
 */

export interface EstadoVersion {
  readonly nuevaVersionDisponible: boolean;
}

export interface ControladorVersion {
  /** Referencia estable entre llamadas mientras el estado no cambie —
   * requisito de `useSyncExternalStore` para no re-renderizar sin fin. */
  obtenerEstado(): EstadoVersion;
  suscribir(listener: () => void): () => void;
  /** Conecta el intervalo y los listeners de `visibilitychange`/
   * `vite:preloadError`. Devuelve la función de limpieza que los remueve. */
  iniciar(): () => void;
  /** Un chequeo puntual contra `/version.json`. Nunca lanza: cualquier
   * falla (red caída, respuesta no-ok, JSON inválido, sin meta `app-commit`
   * en el documento) simplemente no marca nada — el aviso solo debe
   * aparecer ante una señal positiva de "hay algo nuevo", nunca por una
   * falla ambigua. */
  verificarAhora(): Promise<void>;
}

const INTERVALO_DEFAULT_MS = 30 * 60 * 1000;

export function crearControladorVersion(entorno: {
  fetch: typeof globalThis.fetch;
  documento: Document;
  ventana: Window;
  intervaloMs?: number;
}): ControladorVersion {
  const { fetch: fetchInyectado, documento, ventana } = entorno;
  const intervaloMs = entorno.intervaloMs ?? INTERVALO_DEFAULT_MS;
  const listeners = new Set<() => void>();

  let estado: EstadoVersion = { nuevaVersionDisponible: false };

  function notificar(): void {
    listeners.forEach((listener) => listener());
  }

  function marcarNuevaVersion(): void {
    if (estado.nuevaVersionDisponible) {
      return;
    }
    estado = { nuevaVersionDisponible: true };
    notificar();
  }

  function leerCommitActual(): string | null {
    return (
      documento
        .querySelector('meta[name="app-commit"]')
        ?.getAttribute('content') ?? null
    );
  }

  async function verificarAhora(): Promise<void> {
    const commitActual = leerCommitActual();
    if (commitActual === null) {
      return;
    }

    let respuesta: Response;
    try {
      respuesta = await fetchInyectado('/version.json', { cache: 'no-store' });
    } catch {
      // Red caída/offline: sin señal, no se muestra nada (mismo criterio de
      // fallo silencioso que `useApiVersion`).
      return;
    }
    if (!respuesta.ok) {
      return;
    }

    let datos: { commit?: unknown };
    try {
      datos = await respuesta.json();
    } catch {
      return;
    }

    if (typeof datos.commit === 'string' && datos.commit !== commitActual) {
      marcarNuevaVersion();
    }
  }

  return {
    obtenerEstado() {
      return estado;
    },

    suscribir(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    verificarAhora,

    iniciar() {
      const limpiezas: Array<() => void> = [];

      const alCambiarVisibilidad = () => {
        if (documento.visibilityState === 'visible') {
          void verificarAhora();
        }
      };
      documento.addEventListener('visibilitychange', alCambiarVisibilidad);
      limpiezas.push(() =>
        documento.removeEventListener('visibilitychange', alCambiarVisibilidad),
      );

      const idIntervalo = ventana.setInterval(() => {
        if (documento.visibilityState === 'visible') {
          void verificarAhora();
        }
      }, intervaloMs);
      limpiezas.push(() => ventana.clearInterval(idIntervalo));

      const alFallarPreload = (evento: Event) => {
        // Evita que Vite relance el rechazo como excepción no capturada —
        // el aviso no bloqueante reemplaza a la pantalla rota.
        evento.preventDefault();
        marcarNuevaVersion();
      };
      ventana.addEventListener('vite:preloadError', alFallarPreload);
      limpiezas.push(() =>
        ventana.removeEventListener('vite:preloadError', alFallarPreload),
      );

      return () => limpiezas.forEach((limpiar) => limpiar());
    },
  };
}
