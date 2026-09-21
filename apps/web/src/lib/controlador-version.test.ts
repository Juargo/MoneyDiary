import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearControladorVersion } from './controlador-version';

/**
 * controlador-version.test.ts (issue #751). Mismo patrón que
 * `controlador-tema.test.ts`: toda dependencia del entorno (`fetch`,
 * `documento`, `ventana`) es un fake inyectado — nada de `localStorage`,
 * `document`/`window` reales ni red real.
 */

interface DocumentoFalsoOpciones {
  readonly commitActual?: string | null;
}

function crearDocumentoFalso(opciones: DocumentoFalsoOpciones = {}) {
  const commitActual =
    opciones.commitActual === undefined ? 'abc1234' : opciones.commitActual;
  let visibilityState: DocumentVisibilityState = 'visible';
  const listenersVisibilidad = new Set<() => void>();
  const documento = {
    get visibilityState() {
      return visibilityState;
    },
    querySelector: (selector: string) => {
      if (selector === 'meta[name="app-commit"]' && commitActual !== null) {
        return { getAttribute: () => commitActual };
      }
      return null;
    },
    addEventListener: (tipo: string, listener: () => void) => {
      if (tipo === 'visibilitychange') listenersVisibilidad.add(listener);
    },
    removeEventListener: (tipo: string, listener: () => void) => {
      if (tipo === 'visibilitychange') listenersVisibilidad.delete(listener);
    },
  } as unknown as Document;
  return {
    documento,
    ocultar() {
      visibilityState = 'hidden';
      listenersVisibilidad.forEach((listener) => listener());
    },
    mostrar() {
      visibilityState = 'visible';
      listenersVisibilidad.forEach((listener) => listener());
    },
  };
}

function crearVentanaFalsa() {
  const listenersPreload = new Set<
    (evento: { preventDefault: () => void }) => void
  >();
  const ventana = {
    addEventListener: (
      tipo: string,
      listener: (evento: { preventDefault: () => void }) => void,
    ) => {
      if (tipo === 'vite:preloadError') listenersPreload.add(listener);
    },
    removeEventListener: (
      tipo: string,
      listener: (evento: { preventDefault: () => void }) => void,
    ) => {
      if (tipo === 'vite:preloadError') listenersPreload.delete(listener);
    },
    setInterval: (...args: Parameters<typeof setInterval>) =>
      setInterval(...args),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
  } as unknown as Window;
  return {
    ventana,
    emitirPreloadError() {
      const evento = { preventDefault: vi.fn() };
      listenersPreload.forEach((listener) => listener(evento));
      return evento;
    },
  };
}

function crearFetchOk(commit: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ commit }),
  }) as unknown as typeof fetch;
}

function crearFetchError() {
  return vi
    .fn()
    .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
}

describe('crearControladorVersion', () => {
  it('estado inicial: no hay nueva versión disponible', () => {
    const { documento } = crearDocumentoFalso();
    const { ventana } = crearVentanaFalsa();
    const controlador = crearControladorVersion({
      fetch: crearFetchOk('abc1234'),
      documento,
      ventana,
    });

    expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(false);
  });

  it('verificarAhora detecta un commit distinto y notifica a los suscriptores', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
    const { ventana } = crearVentanaFalsa();
    const controlador = crearControladorVersion({
      fetch: crearFetchOk('def5678'),
      documento,
      ventana,
    });
    const listener = vi.fn();
    controlador.suscribir(listener);

    await controlador.verificarAhora();

    expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('verificarAhora con el mismo commit no marca nueva versión ni notifica', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
    const { ventana } = crearVentanaFalsa();
    const controlador = crearControladorVersion({
      fetch: crearFetchOk('abc1234'),
      documento,
      ventana,
    });
    const listener = vi.fn();
    controlador.suscribir(listener);

    await controlador.verificarAhora();

    expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('verificarAhora pide /version.json sin caché (cache: "no-store")', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
    const { ventana } = crearVentanaFalsa();
    const fetchFalso = crearFetchOk('abc1234');
    const controlador = crearControladorVersion({
      fetch: fetchFalso,
      documento,
      ventana,
    });

    await controlador.verificarAhora();

    expect(fetchFalso).toHaveBeenCalledWith('/version.json', {
      cache: 'no-store',
    });
  });

  it('verificarAhora no lanza si el fetch falla (red caída) y no marca nueva versión', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
    const { ventana } = crearVentanaFalsa();
    const controlador = crearControladorVersion({
      fetch: crearFetchError(),
      documento,
      ventana,
    });

    await expect(controlador.verificarAhora()).resolves.toBeUndefined();
    expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(false);
  });

  it('verificarAhora no lanza y no marca nueva versión si la respuesta no es ok', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
    const { ventana } = crearVentanaFalsa();
    const fetchFalso = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const controlador = crearControladorVersion({
      fetch: fetchFalso,
      documento,
      ventana,
    });

    await expect(controlador.verificarAhora()).resolves.toBeUndefined();
    expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(false);
  });

  it('verificarAhora no hace fetch si no hay meta app-commit en el documento', async () => {
    const { documento } = crearDocumentoFalso({ commitActual: null });
    const { ventana } = crearVentanaFalsa();
    const fetchFalso = crearFetchOk('def5678');
    const controlador = crearControladorVersion({
      fetch: fetchFalso,
      documento,
      ventana,
    });

    await controlador.verificarAhora();

    expect(fetchFalso).not.toHaveBeenCalled();
  });

  describe('iniciar()', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('revisa en cada tick del intervalo mientras el documento está visible', async () => {
      const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
      const { ventana } = crearVentanaFalsa();
      const fetchFalso = crearFetchOk('def5678');
      const controlador = crearControladorVersion({
        fetch: fetchFalso,
        documento,
        ventana,
        intervaloMs: 1000,
      });
      controlador.iniciar();

      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchFalso).toHaveBeenCalledTimes(1);
      expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(true);
    });

    it('NO revisa en el tick del intervalo si la pestaña está en segundo plano', async () => {
      const { documento, ocultar } = crearDocumentoFalso({
        commitActual: 'abc1234',
      });
      const { ventana } = crearVentanaFalsa();
      ocultar();
      const fetchFalso = crearFetchOk('def5678');
      const controlador = crearControladorVersion({
        fetch: fetchFalso,
        documento,
        ventana,
        intervaloMs: 1000,
      });
      controlador.iniciar();

      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchFalso).not.toHaveBeenCalled();
    });

    it('revisa inmediatamente cuando la pestaña vuelve a estar visible', async () => {
      const { documento, ocultar, mostrar } = crearDocumentoFalso({
        commitActual: 'abc1234',
      });
      const { ventana } = crearVentanaFalsa();
      ocultar();
      const fetchFalso = crearFetchOk('def5678');
      const controlador = crearControladorVersion({
        fetch: fetchFalso,
        documento,
        ventana,
        intervaloMs: 60_000,
      });
      controlador.iniciar();

      mostrar();
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchFalso).toHaveBeenCalledTimes(1);
      expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(true);
    });

    it('un evento vite:preloadError marca nueva versión disponible y previene el default', () => {
      const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
      const { ventana, emitirPreloadError } = crearVentanaFalsa();
      const controlador = crearControladorVersion({
        fetch: crearFetchOk('abc1234'),
        documento,
        ventana,
      });
      const listener = vi.fn();
      controlador.suscribir(listener);
      controlador.iniciar();

      const evento = emitirPreloadError();

      expect(evento.preventDefault).toHaveBeenCalledTimes(1);
      expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('la función de limpieza detiene el intervalo y remueve el listener de vite:preloadError', async () => {
      const { documento } = crearDocumentoFalso({ commitActual: 'abc1234' });
      const { ventana, emitirPreloadError } = crearVentanaFalsa();
      const fetchFalso = crearFetchOk('def5678');
      const controlador = crearControladorVersion({
        fetch: fetchFalso,
        documento,
        ventana,
        intervaloMs: 1000,
      });
      const limpiar = controlador.iniciar();

      limpiar();
      emitirPreloadError();
      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchFalso).not.toHaveBeenCalled();
      expect(controlador.obtenerEstado().nuevaVersionDisponible).toBe(false);
    });
  });
});
