import { useRef, useState, type DragEvent } from 'react'
import { FileUp, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUploadIngesta } from '@/api/use-upload-ingesta'
import { formatCLP } from '@/lib/format'

export function UploadDropZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const upload = useUploadIngesta()

  function openPicker() {
    if (upload.isPending) return
    inputRef.current?.click()
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const [file] = files
    upload.mutate(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (upload.isPending) return
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (upload.isPending) return
    handleFiles(e.dataTransfer.files)
  }

  if (upload.isSuccess) {
    return (
      <UploadSuccess
        data={upload.data}
        onReset={() => {
          upload.reset()
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {upload.isError && (
        <div className="flex items-start gap-3 rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container">
          <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <div>
            <p className="font-semibold">No se pudo procesar el archivo</p>
            <p className="mt-1 opacity-90">{upload.error.message}</p>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-disabled={upload.isPending}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center rounded-2xl border-2 border-dashed bg-surface-container-lowest px-8 py-14 text-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          upload.isPending
            ? 'cursor-wait border-outline-variant opacity-80'
            : 'cursor-pointer hover:border-primary/60',
          !upload.isPending && isDragging
            ? 'border-primary bg-primary/5'
            : !upload.isPending && 'border-outline-variant',
        )}
      >
        <div className="mb-8 flex size-20 items-center justify-center rounded-full bg-primary-fixed">
          {upload.isPending ? (
            <Loader2
              className="size-8 animate-spin text-on-primary-fixed"
              strokeWidth={1.75}
            />
          ) : (
            <FileUp
              className="size-8 text-on-primary-fixed"
              strokeWidth={1.75}
            />
          )}
        </div>

        <h2 className="text-2xl font-bold text-on-surface md:text-3xl">
          {upload.isPending
            ? 'Procesando tu archivo…'
            : 'Arrastra tu archivo .xlsx aquí'}
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          {upload.isPending
            ? 'Esto puede tomar unos segundos. No cierres la ventana.'
            : 'O haz clic para seleccionar tu cartola desde tu computador'}
        </p>

        <button
          type="button"
          disabled={upload.isPending}
          onClick={(e) => {
            e.stopPropagation()
            openPicker()
          }}
          className="mt-8 flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-on-primary shadow-md transition-transform hover:bg-primary/95 active:scale-95 disabled:cursor-wait disabled:opacity-70"
        >
          {upload.isPending && (
            <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
          )}
          {upload.isPending ? 'Subiendo…' : 'Subir nuevo archivo'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}

type UploadSuccessProps = {
  data: import('@/api/types').UploadIngestaResponse
  onReset: () => void
}

function UploadSuccess({ data, onReset }: UploadSuccessProps) {
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary-fixed/40 px-8 py-10">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary">
          <CheckCircle2
            className="size-10 text-on-primary"
            strokeWidth={2}
          />
        </div>

        <h2 className="text-2xl font-bold text-on-surface md:text-3xl">
          ¡Archivo procesado!
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          Tu cartola fue analizada y las transacciones quedaron guardadas.
        </p>
      </div>

      <dl className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4 text-sm">
        <Detail label="Archivo" value={data.archivo.nombre} />
        <Detail label="Banco" value={data.banco.banco} />
        <Detail label="Tipo cuenta" value={data.banco.tipoCuenta} />
        <Detail
          label="Transacciones"
          value={data.transacciones.total.toString()}
        />
        <Detail
          label="Total cargos"
          value={formatCLP(data.transacciones.totalCargos)}
        />
        <Detail
          label="Total abonos"
          value={formatCLP(data.transacciones.totalAbonos)}
        />
      </dl>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg bg-primary px-8 py-3 text-sm font-bold text-on-primary shadow-md transition-transform active:scale-95"
        >
          Subir otro archivo
        </button>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-lowest px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-on-surface">
        {value}
      </dd>
    </div>
  )
}
