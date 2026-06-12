import { ExtensionNoPermitidaError } from '../errors/extension-no-permitida.error';

/**
 * Extensiones aceptadas para archivos bancarios.
 *   .xlsx — pipeline original (ADR-007).
 *   .pdf  — pipeline PDF (ADR-009). Conviven, no se reemplazan.
 */
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.pdf'] as const;

export type ExtensionPermitida = (typeof EXTENSIONES_PERMITIDAS)[number];

export class Extension {
  private constructor(private readonly _valor: ExtensionPermitida) {}

  static desdeNombreArchivo(nombreArchivo: string): Extension {
    const ultimoPunto = nombreArchivo.lastIndexOf('.');
    const raw = ultimoPunto === -1 ? '' : nombreArchivo.slice(ultimoPunto).toLowerCase();

    if (!(EXTENSIONES_PERMITIDAS as readonly string[]).includes(raw)) {
      throw new ExtensionNoPermitidaError(raw || nombreArchivo, EXTENSIONES_PERMITIDAS);
    }

    return new Extension(raw as ExtensionPermitida);
  }

  get valor(): ExtensionPermitida {
    return this._valor;
  }

  esXlsx(): boolean {
    return this._valor === '.xlsx';
  }

  esPdf(): boolean {
    return this._valor === '.pdf';
  }

  static get permitidas(): readonly string[] {
    return EXTENSIONES_PERMITIDAS;
  }
}
