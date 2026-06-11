export type BancoConocido =
  | 'Banco de Chile'
  | 'BancoEstado'
  | 'BCI'
  | 'Santander'

export type TipoCuentaConocido =
  | 'CuentaRUT'
  | 'Cuenta Corriente'
  | 'Cuenta Vista'

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
