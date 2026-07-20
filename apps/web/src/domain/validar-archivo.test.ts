import { describe, expect, it } from 'vitest'
import { LIMITE_SUBIDA_WEB_BYTES, validarArchivoWeb } from './validar-archivo'

function archivoDeTamano(nombre: string, tamanoBytes: number): File {
  return new File([new Uint8Array(tamanoBytes)], nombre)
}

describe('validarArchivoWeb', () => {
  it('acepta un .xlsx bajo el límite de 4 MB', () => {
    const archivo = archivoDeTamano('cartola.xlsx', 1024)

    expect(validarArchivoWeb(archivo)).toEqual({ tag: 'valido' })
  })

  it('acepta un .pdf bajo el límite de 4 MB', () => {
    const archivo = archivoDeTamano('cartola.pdf', 1024)

    expect(validarArchivoWeb(archivo)).toEqual({ tag: 'valido' })
  })

  it('rechaza una extensión no soportada (.csv) con el mensaje exacto', () => {
    const archivo = archivoDeTamano('cartola.csv', 1024)

    expect(validarArchivoWeb(archivo)).toEqual({
      tag: 'rechazado',
      message: 'Formato no soportado. Sube un archivo .xlsx o .pdf.',
    })
  })

  it('rechaza un archivo sin extensión reconocida (.docx) con el mismo mensaje', () => {
    const archivo = archivoDeTamano('cartola.docx', 1024)

    expect(validarArchivoWeb(archivo)).toEqual({
      tag: 'rechazado',
      message: 'Formato no soportado. Sube un archivo .xlsx o .pdf.',
    })
  })

  it('rechaza un .xlsx exactamente en el límite de 4 MB con el mensaje exacto', () => {
    const archivo = archivoDeTamano('cartola.xlsx', LIMITE_SUBIDA_WEB_BYTES)

    expect(validarArchivoWeb(archivo)).toEqual({
      tag: 'rechazado',
      message:
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
    })
  })

  it('rechaza un .pdf por sobre el límite de 4 MB', () => {
    const archivo = archivoDeTamano('cartola.pdf', LIMITE_SUBIDA_WEB_BYTES + 1)

    expect(validarArchivoWeb(archivo)).toEqual({
      tag: 'rechazado',
      message:
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
    })
  })

  it('acepta un archivo exactamente 1 byte bajo el límite (caso límite, CU-01)', () => {
    const archivo = archivoDeTamano('cartola.xlsx', LIMITE_SUBIDA_WEB_BYTES - 1)

    expect(validarArchivoWeb(archivo)).toEqual({ tag: 'valido' })
  })

  it('valida extensión antes que tamaño: un .csv sobredimensionado reporta el mensaje de formato', () => {
    const archivo = archivoDeTamano('cartola.csv', LIMITE_SUBIDA_WEB_BYTES + 1)

    expect(validarArchivoWeb(archivo)).toEqual({
      tag: 'rechazado',
      message: 'Formato no soportado. Sube un archivo .xlsx o .pdf.',
    })
  })
})
