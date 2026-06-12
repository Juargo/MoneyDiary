export type BancoConocido =
  | 'Banco de Chile'
  | 'BancoEstado'
  | 'BCI'
  | 'Santander'

export type TipoCuentaConocido =
  | 'CuentaRUT'
  | 'Cuenta Corriente'
  | 'Cuenta Vista'

export type GrupoPresupuesto =
  | 'Ingresos'
  | 'Necesidades'
  | 'Gustos'
  | 'Ahorro'
  | 'SinCategorizar'

export interface Categoria {
  nombre: string
  grupo: GrupoPresupuesto
  icon: string | null
}

export interface Transaccion {
  id: string
  ingestaId: string
  fecha: string // ISO 8601
  descripcion: string
  cargo: number
  abono: number
  banco: BancoConocido
  tipoCuenta: TipoCuentaConocido
  numeroCuenta: string
  categoria: Categoria
}

export interface ListTransaccionesResponse {
  total: number
  transacciones: Transaccion[]
}

export interface UploadIngestaResponse {
  message: string
  ingestaId: string
  archivo: {
    nombre: string
    extension: string
    tamanoBytes: number
  }
  banco: {
    banco: BancoConocido
    tipoCuenta: TipoCuentaConocido
    numeroCuenta: string
  }
  transacciones: {
    total: number
    cargos: number
    abonos: number
    totalCargos: number
    totalAbonos: number
  }
}
