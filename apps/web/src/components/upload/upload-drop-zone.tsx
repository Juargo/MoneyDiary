import { useRef, useState, type DragEvent } from 'react'
import { FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UploadDropZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const [file] = files
    // TODO: wire to POST /api/ingestas
    // eslint-disable-next-line no-console
    console.log('archivo seleccionado:', file.name)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
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
        'cursor-pointer hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isDragging ? 'border-primary bg-primary/5' : 'border-outline-variant',
      )}
    >
      <div className="mb-8 flex size-20 items-center justify-center rounded-full bg-primary-fixed">
        <FileUp
          className="size-8 text-on-primary-fixed"
          strokeWidth={1.75}
        />
      </div>

      <h2 className="text-2xl font-bold text-on-surface md:text-3xl">
        Arrastra tu archivo .xlsx aquí
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        O haz clic para seleccionar tu cartola desde tu computador
      </p>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openPicker()
        }}
        className="mt-8 rounded-lg bg-primary px-8 py-3 text-sm font-bold text-on-primary shadow-md transition-transform hover:bg-primary/95 active:scale-95"
      >
        Subir nuevo archivo
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
