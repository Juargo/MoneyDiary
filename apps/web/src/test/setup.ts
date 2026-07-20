// Registra los matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`,
// ...) en el `expect` de Vitest y aplica la augmentación de tipos en todo el
// programa. Cargado por `vitest.config.ts` vía `setupFiles`.
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement these two APIs (month-year-picker, WMYP-01) —
// Radix Popover calls them when opening/positioning and throws without a
// shim. Stubbed globally here so any test that opens a Radix popover works
// without repeating this per test file.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn()
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}
