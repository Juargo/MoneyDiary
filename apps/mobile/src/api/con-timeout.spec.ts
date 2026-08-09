import { conTimeout } from './con-timeout';

describe('conTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the promise value when it settles before the timeout', async () => {
    const promise = Promise.resolve('valor');

    await expect(conTimeout(promise, 1000)).resolves.toBe('valor');
  });

  it('rejects with the original error when the promise rejects before the timeout', async () => {
    const promise = Promise.reject(new Error('fallo real'));

    await expect(conTimeout(promise, 1000)).rejects.toThrow('fallo real');
  });

  it('rejects once the timeout elapses when the promise never settles (hang protection)', async () => {
    const promiseQueNuncaResuelve = new Promise<string>(() => {});

    const assertion = expect(
      conTimeout(promiseQueNuncaResuelve, 20_000),
    ).rejects.toThrow('Tiempo de espera agotado (20000ms)');

    jest.advanceTimersByTime(20_000);

    await assertion;
  });
});
