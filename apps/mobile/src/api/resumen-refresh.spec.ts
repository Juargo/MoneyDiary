// RED-first (review fix #1/#2, upload-cartola-ui Slice 2b): the CU-10
// "resumen refetches after upload" acceptance is asserted end-to-end in
// `app/index.spec.tsx`, but the pub/sub primitive itself (`resumen-refresh.ts`)
// had no unit coverage of its own — this closes that gap directly.
import {
  registrarRecargaResumen,
  desregistrarRecargaResumen,
  solicitarRecargaResumen,
} from './resumen-refresh';

describe('resumen-refresh (pub/sub)', () => {
  it('invokes the registered listener when a recarga is solicited', () => {
    const listener = jest.fn();

    registrarRecargaResumen(listener);
    solicitarRecargaResumen();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('solicitarRecargaResumen with no listener registered is a safe no-op (no throw)', () => {
    // No prior registration in this test's own scope — desregistrarRecargaResumen
    // is used defensively to clear any listener left by a sibling test/module.
    expect(() => solicitarRecargaResumen()).not.toThrow();
  });

  // INVERTED by US-050 D-13 (was "re-registering replaces the previous
  // listener" — true only under the old single-slot implementation). A
  // `Set<() => void>` has no "replace" semantics for two distinct callback
  // identities: registering a second, different listener without
  // unregistering the first now means BOTH accumulate and BOTH fire — this
  // is precisely what lets `ResumenAnual` coexist with `app/index.tsx`'s
  // `cargar()` as two independent subscribers. The old assumption (last
  // registration always wins) is retired, not silently dropped: a real
  // subscriber's identity-stable re-registration (unregister-then-register,
  // e.g. React effect cleanup on a dependency change) is what
  // "desregistrarRecargaResumen does NOT clear a newer listener registered
  // after it" (above) and the D-13 cases (below) already cover.
  it('registering two distinct listeners without unregistering the first accumulates both (D-13)', () => {
    const primero = jest.fn();
    const segundo = jest.fn();

    registrarRecargaResumen(primero);
    registrarRecargaResumen(segundo);
    solicitarRecargaResumen();

    expect(segundo).toHaveBeenCalledTimes(1);
    expect(primero).toHaveBeenCalledTimes(1);
  });

  it('desregistrarRecargaResumen clears the slot only if it still holds the given listener', () => {
    const listener = jest.fn();

    registrarRecargaResumen(listener);
    desregistrarRecargaResumen(listener);
    solicitarRecargaResumen();

    expect(listener).not.toHaveBeenCalled();
  });

  it('desregistrarRecargaResumen does NOT clear a newer listener registered after it', () => {
    const stale = jest.fn();
    const current = jest.fn();

    registrarRecargaResumen(stale);
    registrarRecargaResumen(current);
    // A stale cleanup for `stale` must not clobber `current`'s registration.
    desregistrarRecargaResumen(stale);
    solicitarRecargaResumen();

    expect(current).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it('registrarRecargaResumen returns an unregister function equivalent to desregistrarRecargaResumen', () => {
    const listener = jest.fn();

    const unregister = registrarRecargaResumen(listener);
    unregister();
    solicitarRecargaResumen();

    expect(listener).not.toHaveBeenCalled();
  });

  // D-13 (US-050): the slot is promoted from a single listener to a `Set`
  // — ResumenAnual becomes a second subscriber alongside app/index.tsx's
  // main chart reload, so both must fire on one solicitarRecargaResumen().
  it('fires all registered listeners on solicitarRecargaResumen() (D-13)', () => {
    const principal = jest.fn();
    const anual = jest.fn();

    registrarRecargaResumen(principal);
    registrarRecargaResumen(anual);
    solicitarRecargaResumen();

    expect(principal).toHaveBeenCalledTimes(1);
    expect(anual).toHaveBeenCalledTimes(1);
  });

  it('unregistering one listener leaves the other subscribed (D-13)', () => {
    const principal = jest.fn();
    const anual = jest.fn();

    registrarRecargaResumen(principal);
    const unregisterAnual = registrarRecargaResumen(anual);
    unregisterAnual();
    solicitarRecargaResumen();

    expect(principal).toHaveBeenCalledTimes(1);
    expect(anual).not.toHaveBeenCalled();
  });
});
