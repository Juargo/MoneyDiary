import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  archivoCoincideConIdentidad,
  borrarBorrador,
  cargarBorrador,
  guardarBorrador,
  identidadDeArchivo,
} from './borrador-revision';
import type { PreviewIngestaDtoConCanonicos } from '@/api/types';
import { unaFilaPreview } from '@/test-utils/preview-fixtures';

function unaPreview(): PreviewIngestaDtoConCanonicos {
  return {
    banco: 'BancoEstado',
    tipoCuenta: 'CuentaRUT',
    numeroCuenta: '12345678',
    estructura: { totalFilasDatos: 1 },
    muestra: [],
    filas: [unaFilaPreview({ rowIndex: 0 })],
    resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
  };
}

function unArchivo(
  nombre = 'cartola.xlsx',
  tamanoBytes = 1024,
  ultimaModificacion = 1_700_000_000_000,
): File {
  return new File([new Uint8Array(tamanoBytes)], nombre, {
    lastModified: ultimaModificacion,
  });
}

const AHORA = 1_700_100_000_000;

describe('borrador-revision', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  describe('identidadDeArchivo / archivoCoincideConIdentidad', () => {
    it('matches a file against its own identity', () => {
      const archivo = unArchivo();
      expect(
        archivoCoincideConIdentidad(archivo, identidadDeArchivo(archivo)),
      ).toBe(true);
    });

    it('does not match when name differs', () => {
      const identidad = identidadDeArchivo(unArchivo('a.xlsx'));
      expect(archivoCoincideConIdentidad(unArchivo('b.xlsx'), identidad)).toBe(
        false,
      );
    });

    it('does not match when size differs', () => {
      const identidad = identidadDeArchivo(unArchivo('a.xlsx', 100));
      expect(
        archivoCoincideConIdentidad(unArchivo('a.xlsx', 200), identidad),
      ).toBe(false);
    });

    it('does not match when lastModified differs', () => {
      const identidad = identidadDeArchivo(unArchivo('a.xlsx', 100, 1));
      expect(
        archivoCoincideConIdentidad(unArchivo('a.xlsx', 100, 2), identidad),
      ).toBe(false);
    });
  });

  describe('guardarBorrador / cargarBorrador round-trip', () => {
    it('returns null when nothing was saved', () => {
      expect(cargarBorrador(AHORA)).toBeNull();
    });

    it('round-trips archivo identity, preview, and edits', () => {
      const archivo = unArchivo('cartola.xlsx', 2048, 123);
      const preview = unaPreview();
      const edits = new Map<number, string | null>([
        [0, 'cat-nec-1'],
        [3, null],
      ]);

      guardarBorrador({ archivo, preview, edits, ahora: AHORA });
      const cargado = cargarBorrador(AHORA);

      expect(cargado).not.toBeNull();
      expect(cargado?.archivo).toEqual({
        nombre: 'cartola.xlsx',
        tamano: 2048,
        ultimaModificacion: 123,
      });
      expect(cargado?.preview).toEqual(preview);
      expect(cargado?.edits).toEqual([
        [0, 'cat-nec-1'],
        [3, null],
      ]);
      expect(cargado?.savedAt).toBe(AHORA);
    });

    it('overwrites a previous draft (write-through, no merge)', () => {
      const archivo1 = unArchivo('primero.xlsx');
      const archivo2 = unArchivo('segundo.xlsx');
      guardarBorrador({
        archivo: archivo1,
        preview: unaPreview(),
        edits: new Map(),
        ahora: AHORA,
      });
      guardarBorrador({
        archivo: archivo2,
        preview: unaPreview(),
        edits: new Map(),
        ahora: AHORA,
      });

      expect(cargarBorrador(AHORA)?.archivo.nombre).toBe('segundo.xlsx');
    });
  });

  describe('age limit (24h)', () => {
    it('loads a draft saved just under 24h ago', () => {
      guardarBorrador({
        archivo: unArchivo(),
        preview: unaPreview(),
        edits: new Map(),
        ahora: AHORA,
      });
      const casiVeinticuatroHoras = AHORA + 24 * 60 * 60 * 1000 - 1;
      expect(cargarBorrador(casiVeinticuatroHoras)).not.toBeNull();
    });

    it('discards and clears a draft older than 24h', () => {
      guardarBorrador({
        archivo: unArchivo(),
        preview: unaPreview(),
        edits: new Map(),
        ahora: AHORA,
      });
      const masDeVeinticuatroHoras = AHORA + 24 * 60 * 60 * 1000 + 1;

      expect(cargarBorrador(masDeVeinticuatroHoras)).toBeNull();
      // Second load confirms it was actually removed, not just skipped once.
      expect(sessionStorage.getItem('md:borrador-revision:v1')).toBeNull();
    });
  });

  describe('corrupted / malformed storage', () => {
    it('returns null and clears storage on invalid JSON', () => {
      sessionStorage.setItem('md:borrador-revision:v1', '{not json');
      expect(cargarBorrador(AHORA)).toBeNull();
      expect(sessionStorage.getItem('md:borrador-revision:v1')).toBeNull();
    });

    it('returns null on a well-formed but wrong-shaped object', () => {
      sessionStorage.setItem(
        'md:borrador-revision:v1',
        JSON.stringify({ hola: 'mundo' }),
      );
      expect(cargarBorrador(AHORA)).toBeNull();
    });

    it('returns null on a schema version mismatch', () => {
      sessionStorage.setItem(
        'md:borrador-revision:v1',
        JSON.stringify({
          version: 999,
          archivo: { nombre: 'a', tamano: 1, ultimaModificacion: 1 },
          preview: unaPreview(),
          edits: [],
          savedAt: AHORA,
        }),
      );
      expect(cargarBorrador(AHORA)).toBeNull();
    });
  });

  describe('storage failure resilience', () => {
    let originalSetItem: typeof Storage.prototype.setItem;

    beforeEach(() => {
      originalSetItem = Storage.prototype.setItem;
    });

    afterEach(() => {
      Storage.prototype.setItem = originalSetItem;
    });

    it('guardarBorrador never throws when sessionStorage.setItem throws (quota/private mode)', () => {
      Storage.prototype.setItem = () => {
        throw new DOMException('QuotaExceededError');
      };

      expect(() =>
        guardarBorrador({
          archivo: unArchivo(),
          preview: unaPreview(),
          edits: new Map(),
          ahora: AHORA,
        }),
      ).not.toThrow();
    });

    it('cargarBorrador never throws when sessionStorage.getItem throws', () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = () => {
        throw new Error('blocked');
      };

      expect(() => cargarBorrador(AHORA)).not.toThrow();
      expect(cargarBorrador(AHORA)).toBeNull();

      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('borrarBorrador', () => {
    it('removes a saved draft', () => {
      guardarBorrador({
        archivo: unArchivo(),
        preview: unaPreview(),
        edits: new Map(),
        ahora: AHORA,
      });
      borrarBorrador();
      expect(cargarBorrador(AHORA)).toBeNull();
    });

    it('is a no-op when nothing was saved', () => {
      expect(() => borrarBorrador()).not.toThrow();
    });
  });
});
