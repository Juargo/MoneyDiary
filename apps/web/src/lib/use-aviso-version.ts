/**
 * Punto de consumo React del controlador de "hay una versión nueva" (issue
 * #751). `controladorVersion` es la única instancia global de producción —
 * `main.tsx` la usa directamente para `iniciar()` el intervalo y los
 * listeners de `visibilitychange`/`vite:preloadError`, y `useAvisoVersion`
 * la consume por defecto sin necesitar un `<Provider>` montado (mismo patrón
 * que `use-preferencia-tema.ts`/`controladorTema`). Los tests de componentes
 * inyectan un fake vía `<ContextoControladorVersion.Provider value={...}>`.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import {
  crearControladorVersion,
  type ControladorVersion,
  type EstadoVersion,
} from './controlador-version';

export const controladorVersion: ControladorVersion = crearControladorVersion({
  fetch: (...args) => window.fetch(...args),
  documento: document,
  ventana: window,
});

export const ContextoControladorVersion =
  createContext<ControladorVersion>(controladorVersion);

export function useAvisoVersion(): EstadoVersion {
  const controlador = useContext(ContextoControladorVersion);
  return useSyncExternalStore(
    controlador.suscribir,
    controlador.obtenerEstado,
    controlador.obtenerEstado,
  );
}
