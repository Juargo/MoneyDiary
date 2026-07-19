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

  it('re-registering replaces the previous listener', () => {
    const primero = jest.fn();
    const segundo = jest.fn();

    registrarRecargaResumen(primero);
    registrarRecargaResumen(segundo);
    solicitarRecargaResumen();

    expect(segundo).toHaveBeenCalledTimes(1);
    expect(primero).not.toHaveBeenCalled();
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
});
