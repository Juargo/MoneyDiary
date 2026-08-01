import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteIngesta,
  fetchApiVersion,
  fetchDetalleBucket,
  fetchIngestas,
  fetchResumen,
  fetchResumenAnual,
  postIngesta,
  postReclasificarCategoria,
} from './client'
import type {
  ApiVersionDto,
  DetalleBucketDto,
  IngestaListItemDto,
  IngestaResponseDto,
  ReclasificarCategoriaDto,
  ResumenAnualDto,
  ResumenMesDto,
} from './types'

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
      categoria: null,
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

const validReclasificarDto: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
}

describe('postReclasificarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a PATCH /api/transacciones/:id/categoria same-origin con { categoria } en el body', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validReclasificarDto) })

    await postReclasificarCategoria('tx-1', 'Transporte')

    expect(fetchMock).toHaveBeenCalledWith('/api/transacciones/tx-1/categoria', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria: 'Transporte' }),
    })
  })

  it('encodea el :id en la URL', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validReclasificarDto) })

    await postReclasificarCategoria('tx con espacio', 'Transporte')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx%20con%20espacio/categoria',
      expect.anything(),
    )
  })

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validReclasificarDto) })

    const result = await postReclasificarCategoria('tx-1', 'Transporte')

    expect(result).toEqual({ ok: true, value: validReclasificarDto })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await postReclasificarCategoria('tx-1', 'Transporte')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 400 a {tag: "invalid"} (categoría desconocida)', async () => {
    mockFetchOnce({ ok: false, status: 400 })

    const result = await postReclasificarCategoria('tx-1', 'NoExiste')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('invalid')
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await postReclasificarCategoria('tx-1', 'Transporte')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })

  it('mapea un 404 (no existe / no es del usuario) a {tag: "server", status: 404}', async () => {
    mockFetchOnce({ ok: false, status: 404 })

    const result = await postReclasificarCategoria('tx-ajena', 'Transporte')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 404,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await postReclasificarCategoria('tx-1', 'Transporte')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await postReclasificarCategoria('tx-1', 'Transporte')

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
  duplicadosOmitidos: 0,
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

const validIngestaListItem: IngestaListItemDto = {
  id: 'ingesta-1',
  banco: 'BancoEstado',
  nombreArchivo: 'cartola-julio.xlsx',
  estado: 'PROCESADA',
  motivoFallo: null,
  fecha: '2026-07-15T00:00:00.000Z',
  totalTransacciones: 12,
}

const validIngestaFallida: IngestaListItemDto = {
  id: 'ingesta-2',
  banco: null,
  nombreArchivo: 'cartola.docx',
  estado: 'FALLIDA',
  motivoFallo: 'Extensión de archivo no soportada: .docx',
  fecha: '2026-07-16T00:00:00.000Z',
  totalTransacciones: 0,
}

describe('fetchIngestas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a GET /api/ingestas same-origin, sin base URL ni key', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaListItem] }),
    })

    await fetchIngestas()

    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas')
  })

  it('resuelve {ok: true, value} con el array de ingestas del wrapper {ingestas: [...]}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaListItem] }),
    })

    const result = await fetchIngestas()

    expect(result).toEqual({ ok: true, value: [validIngestaListItem] })
  })

  it('resuelve {ok: true, value: []} con una lista vacía', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: [] }) })

    const result = await fetchIngestas()

    expect(result).toEqual({ ok: true, value: [] })
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })

  it('mapea un body 2xx que no cumple la forma esperada (sin campo ingestas) a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ nonsense: true }) })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando body.ingestas no es un array', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: 'no-array' }) })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando un item trae totalTransacciones como string en vez de number', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [{ ...validIngestaListItem, totalTransacciones: '12' }] }),
    })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando un item le falta el campo banco', async () => {
    const { banco: _omitido, ...itemSinBanco } = validIngestaListItem
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: [itemSinBanco] }) })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('acepta un item FALLIDA con banco null, motivoFallo string, y totalTransacciones 0 (US-004, ING-03)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaFallida] }),
    })

    const result = await fetchIngestas()

    expect(result).toEqual({ ok: true, value: [validIngestaFallida] })
  })

  it('acepta una lista mixta PROCESADA + FALLIDA (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaListItem, validIngestaFallida] }),
    })

    const result = await fetchIngestas()

    expect(result).toEqual({ ok: true, value: [validIngestaListItem, validIngestaFallida] })
  })

  it('mapea a {tag: "parse"} cuando a un item le falta el campo nombreArchivo (US-004)', async () => {
    const { nombreArchivo: _omitido, ...itemSinNombreArchivo } = validIngestaListItem
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [itemSinNombreArchivo] }),
    })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando un item trae un estado fuera de la unión PROCESADA/FALLIDA (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [{ ...validIngestaListItem, estado: 'CANCELADA' }] }),
    })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando un item PROCESADA trae banco como number en vez de string|null (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [{ ...validIngestaListItem, banco: 123 }] }),
    })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea a {tag: "parse"} cuando un item trae motivoFallo como number en vez de string|null (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [{ ...validIngestaFallida, motivoFallo: 404 }] }),
    })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('invalid json')) })

    const result = await fetchIngestas()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })
})

describe('deleteIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a DELETE /api/ingestas/:id same-origin, encodeando el id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })

    await deleteIngesta('ingesta con espacio')

    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas/ingesta%20con%20espacio', { method: 'DELETE' })
  })

  it('en un 204 resuelve {ok: true, value: undefined} SIN llamar res.json() (D7 — un 204 no tiene body)', async () => {
    const jsonSpy = vi.fn().mockRejectedValue(new Error('204 has no body — json() must not be called'))
    mockFetchOnce({ ok: true, status: 204, json: jsonSpy })

    const result = await deleteIngesta('ingesta-1')

    expect(result).toEqual({ ok: true, value: undefined })
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await deleteIngesta('ingesta-1')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await deleteIngesta('ingesta-1')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })

  it('mapea un 404 (no existe / no es del usuario, anti-enumeration) a {tag: "server", status: 404}', async () => {
    mockFetchOnce({ ok: false, status: 404 })

    const result = await deleteIngesta('ingesta-ajena')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 404,
      message: 'La cartola ya no existe. La lista se actualizará.',
    })
  })

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    const result = await deleteIngesta('ingesta-1')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    })
  })
})

describe('fetchApiVersion', () => {
  const validVersion: ApiVersionDto = {
    version: '0.2.0',
    commit: 'abc1234',
    ref: 'main',
    builtAt: '2026-07-28T17:00:00.000Z',
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('llama GET {VITE_API_BASE_URL}/version cross-origin y devuelve el DTO', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test')
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validVersion) })

    const result = await fetchApiVersion()

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/version')
    expect(result).toEqual({ ok: true, value: validVersion })
  })

  it('mapea 401 a unauthorized', async () => {
    mockFetchOnce({ ok: false, status: 401 })

    const result = await fetchApiVersion()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('unauthorized')
  })

  it('mapea un body con forma inesperada a parse', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ version: 1 }) })

    const result = await fetchApiVersion()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('parse')
  })

  it('mapea un fetch rechazado (red) a network', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchApiVersion()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.tag).toBe('network')
  })
})
