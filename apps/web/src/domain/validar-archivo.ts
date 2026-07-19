/**
 * validarArchivoWeb — validación pura del lado cliente para
 * `POST /api/ingestas` (`upload-cartola-ui`, design.md Decision 2). Corre
 * ANTES de `mutate()`/`postIngesta` — la web queda por debajo del cap del
 * proxy Vite/Vercel (413 duro), así que se falla rápido y honesto en vez de
 * dejar que el request llegue a romperse en el proxy.
 *
 * Sin `fetch`, sin React — testeable en aislamiento con Vitest puro (SOLID
 * SRP, mismo espíritu que `formatear-monto.ts`). El backend sigue siendo la
 * autoridad de tamaño real (10 MB) — este límite web (4 MB) es defensa en
 * profundidad, no la regla de negocio canónica.
 */
export const LIMITE_SUBIDA_WEB_BYTES = 4 * 1024 * 1024

const EXTENSIONES_PERMITIDAS = ['.xlsx', '.pdf']

export type ArchivoValidacion =
  | { readonly tag: 'valido' }
  | { readonly tag: 'rechazado'; readonly message: string }

function tieneExtensionPermitida(nombre: string): boolean {
  const nombreLower = nombre.toLowerCase()
  return EXTENSIONES_PERMITIDAS.some((extension) => nombreLower.endsWith(extension))
}

export function validarArchivoWeb(file: File): ArchivoValidacion {
  if (!tieneExtensionPermitida(file.name)) {
    return { tag: 'rechazado', message: 'Formato no soportado. Sube un archivo .xlsx o .pdf.' }
  }

  if (file.size >= LIMITE_SUBIDA_WEB_BYTES) {
    return {
      tag: 'rechazado',
      message:
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
    }
  }

  return { tag: 'valido' }
}
