// Registra los matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`,
// ...) en el `expect` de Vitest y aplica la augmentación de tipos en todo el
// programa. Cargado por `vitest.config.ts` vía `setupFiles`.
import '@testing-library/jest-dom/vitest'

// jsdom no implementa `Element.prototype.scrollIntoView` (usado por
// `TransaccionesAgrupadas`'s scroll+highlight, WG-05) — sin este polyfill
// cualquier test que monte un componente que la invoque lanza un
// `TypeError`. Tests que quieren observar la llamada (p.ej.
// `TransaccionesAgrupadas.spec.tsx`) reasignan `Element.prototype.
// scrollIntoView` a su propio `vi.fn()` por test, lo cual sigue funcionando
// verbatim sobre este no-op base.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
