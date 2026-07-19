import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDetalleBucket, fetchResumen, fetchResumenAnual, postIngesta } from './client'
import type { DetalleBucketDto, IngestaResponseDto, ResumenAnualDto, ResumenMesDto } from './types'

const validDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '400000', porcentajeBp: 4000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '250000', porcentajeBp: 2500, estadoSemaforo: 'verde' },
    { bucket: 'Ahorro', total: '350000', porcentajeBp: 3500, estadoSemaforo: 'amarillo' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: 0, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'amarillo',
}

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchResumen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/resumen same-origin, sin base URL ni key (W0-02)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    await fetchResumen()

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen')
  })

  it('agrega el query param periodo cuando se provee', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    await fetchResumen('2026-07')

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen?periodo=2026-07')
  })

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDto) })

    const result = await fetchResumen()

    expect(result).toEqual({ ok: true, value: validDto })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 400 a {tag: "invalid"} ("período inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El período no es válido.',
    })
  })

  it('mapea un 401 a {tag: "unauthorized"} ("sin acceso")', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('invalid json')) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando buckets[0].total es number en vez de string (money-safety boundary)', async () => {
    const bodyConTotalNumerico = {
      ...validDto,
      buckets: [{ ...validDto.buckets[0], total: 400000 }, ...validDto.buckets.slice(1)],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConTotalNumerico) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando buckets[0].total es un string no decimal (p.ej. "abc") — nunca llega a formatearMontoCLP', async () => {
    const bodyConTotalMalformado = {
      ...validDto,
      buckets: [{ ...validDto.buckets[0], total: 'abc' }, ...validDto.buckets.slice(1)],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConTotalMalformado) })

    const result = await fetchResumen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})

function mesConPeriodo(periodo: string): ResumenMesDto {
  return { ...validDto, periodo }
}

const validResumenAnualDto: ResumenAnualDto = {
  anio: 2026,
  meses: Array.from({ length: 12 }, (_, i) => mesConPeriodo(`2026-${String(i + 1).padStart(2, '0')}`)),
}

describe('fetchResumenAnual', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/resumen/anual same-origin, sin base URL ni key', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validResumenAnualDto) })

    await fetchResumenAnual()

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual')
  })

  it('agrega el query param anio cuando se provee', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validResumenAnualDto) })

    await fetchResumenAnual(2026)

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual?anio=2026')
  })

  it('resuelve {ok: true, value} en un body 2xx válido con 12 meses', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validResumenAnualDto) })

    const result = await fetchResumenAnual(2026)

    expect(result).toEqual({ ok: true, value: validResumenAnualDto })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 400 a {tag: "invalid"} ("año inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El año no es válido.',
    })
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body con menos de 12 meses a {tag: "parse"}', async () => {
    const bodyIncompleto = { ...validResumenAnualDto, meses: validResumenAnualDto.meses.slice(0, 11) }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyIncompleto) })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body con más de 12 meses (13) a {tag: "parse"}', async () => {
    const bodyConExceso = {
      ...validResumenAnualDto,
      meses: [...validResumenAnualDto.meses, mesConPeriodo('2027-01')],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConExceso) })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body con meses: [] a {tag: "parse"}', async () => {
    const bodyVacio = { ...validResumenAnualDto, meses: [] }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyVacio) })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando un mes trae total malformado (money-safety boundary)', async () => {
    const bodyConTotalMalformado = {
      ...validResumenAnualDto,
      meses: [
        { ...validResumenAnualDto.meses[0], buckets: [{ ...validResumenAnualDto.meses[0].buckets[0], total: 'abc' }] },
        ...validResumenAnualDto.meses.slice(1),
      ],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConTotalMalformado) })

    const result = await fetchResumenAnual()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})

const validDetalleBucketDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
    },
  ],
}

describe('fetchDetalleBucket', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/buckets/:bucket same-origin, sin base URL ni key (W0-02)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDetalleBucketDto) })

    await fetchDetalleBucket('Necesidades')

    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Necesidades')
  })

  it('agrega el query param periodo cuando se provee y encodea el :bucket', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDetalleBucketDto) })

    await fetchDetalleBucket('Sin Categoria', '2026-07')

    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Sin%20Categoria?periodo=2026-07')
  })

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validDetalleBucketDto) })

    const result = await fetchDetalleBucket('Necesidades', '2026-07')

    expect(result).toEqual({ ok: true, value: validDetalleBucketDto })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 400 a {tag: "invalid"} (bucket o período inválido)', async () => {
    mockFetchOnce({ ok: false, status: 400 })

    const result = await fetchDetalleBucket('invalido')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('invalid')
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].cargo es number en vez de string (money-safety boundary)', async () => {
    const bodyConCargoNumerico = {
      ...validDetalleBucketDto,
      transacciones: [{ ...validDetalleBucketDto.transacciones[0], cargo: 50000 }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConCargoNumerico) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].cargo es un string no decimal (p.ej. "abc") — nunca llega a formatearMontoCLP', async () => {
    const bodyConCargoMalformado = {
      ...validDetalleBucketDto,
      transacciones: [{ ...validDetalleBucketDto.transacciones[0], cargo: 'abc' }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConCargoMalformado) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].cargo es un string vacío', async () => {
    const bodyConCargoVacio = {
      ...validDetalleBucketDto,
      transacciones: [{ ...validDetalleBucketDto.transacciones[0], cargo: '' }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConCargoVacio) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].fecha no es una fecha parseable', async () => {
    const bodyConFechaMalformada = {
      ...validDetalleBucketDto,
      transacciones: [{ ...validDetalleBucketDto.transacciones[0], fecha: 'not-a-date' }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConFechaMalformada) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].fecha es un string vacío', async () => {
    const bodyConFechaVacia = {
      ...validDetalleBucketDto,
      transacciones: [{ ...validDetalleBucketDto.transacciones[0], fecha: '' }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConFechaVacia) })

    const result = await fetchDetalleBucket('Necesidades')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})

const validIngestaDto: IngestaResponseDto = {
  ingestaId: 'ingesta-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 2048 },
  totalTransacciones: 1,
  transacciones: [
    {
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
    },
  ],
}

function archivoDePrueba(): File {
  return new File([new Uint8Array(10)], 'cartola.xlsx')
}

describe('postIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a POST /api/ingestas same-origin con el archivo en un FormData bajo el campo "file"', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaDto) })
    const archivo = archivoDePrueba()

    await postIngesta(archivo)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/ingestas')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(archivo)
  })

  it('no fija manualmente un header Content-Type (el browser genera el boundary del multipart)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaDto) })

    await postIngesta(archivoDePrueba())

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headerKeys = init.headers ? Object.keys(init.headers as Record<string, string>) : []
    expect(headerKeys.some((key) => key.toLowerCase() === 'content-type')).toBe(false)
  })

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaDto) })

    const result = await postIngesta(archivoDePrueba())

    expect(result).toEqual({ ok: true, value: validIngestaDto })
  })

  it('mapea un 400 pasando el body.message del backend verbatim (sin remap del cliente) — mensaje A', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ statusCode: 400, message: 'Banco no reconocido.', error: 'Bad Request' }),
    })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'invalid', message: 'Banco no reconocido.' })
  })

  it('mapea un 400 pasando el body.message del backend verbatim (sin remap del cliente) — mensaje B, distinto del A', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          statusCode: 400,
          message: 'El PDF no contiene texto extraíble.',
          error: 'Bad Request',
        }),
    })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El PDF no contiene texto extraíble.',
    })
  })

  it('mapea un 400 con body ilegible/malformado a un mensaje genérico de fallback', async () => {
    mockFetchOnce({ ok: false, status: 400, json: () => Promise.reject(new Error('invalid json')) })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('invalid')
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0)
  })

  it('mapea un 401 a {tag: "unauthorized"} con el mensaje fijo de sesión expirada', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un body 2xx que no cumple la forma esperada de IngestaResponseDto a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].cargo es un string no decimal (money-safety boundary)', async () => {
    const bodyConCargoMalformado = {
      ...validIngestaDto,
      transacciones: [{ ...validIngestaDto.transacciones[0], cargo: 'abc' }],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConCargoMalformado) })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando falta el sub-objeto archivo', async () => {
    const { archivo: _omitido, ...bodySinArchivo } = validIngestaDto
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodySinArchivo) })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando archivo.tamanoBytes es string en vez de number', async () => {
    const bodyConArchivoMalformado = {
      ...validIngestaDto,
      archivo: { ...validIngestaDto.archivo, tamanoBytes: '2048' },
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(bodyConArchivoMalformado) })

    const result = await postIngesta(archivoDePrueba())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})
