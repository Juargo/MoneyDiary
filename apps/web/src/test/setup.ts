// Registra los matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`,
// ...) en el `expect` de Vitest y aplica la augmentación de tipos en todo el
// programa. Cargado por `vitest.config.ts` vía `setupFiles`.
import '@testing-library/jest-dom/vitest';
// vitest-axe matchers — `toHaveNoViolations` for CA-10 accessibility assertions.
import * as axeMatchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
import type { AxeMatchers } from 'vitest-axe/matchers';
expect.extend(axeMatchers);

// Augment Vitest's Assertion interface with the axe matcher.
// The type parameter <T> mirrors Vitest's own Assertion<T> declaration exactly
// (no default — see vitest/dist/chunks/global.d.*.ts `interface Assertion<T>`).
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
  interface Assertion<T> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// Raise Testing Library's async timeout above its 1000ms default. Router-driven
// tests boot through an async `beforeLoad` (fetch → route match → render); the
// full monorepo test command (`pnpm -r test`) runs the api/web/mobile runners
// in parallel and saturates the CPU, pushing that boot past 1000ms and making
// `waitFor`/`findBy*` time out on an empty body. 5000ms absorbs the contention
// without masking a real hang (an actually stuck test still fails, just slower).
configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement these two APIs (month-year-picker, WMYP-01) —
// Radix Popover calls them when opening/positioning and throws without a
// shim. Stubbed globally here so any test that opens a Radix popover works
// without repeating this per test file.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
// jsdom's `window.scrollTo` exists but is unimplemented and logs a
// "Not implemented: Window's scrollTo()" error — Radix popover positioning
// calls it on open. Stubbed out here rather than per test file.
window.scrollTo = vi.fn();
