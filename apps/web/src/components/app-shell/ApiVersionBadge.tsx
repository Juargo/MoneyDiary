import { useApiVersion } from '@/api/use-api-version'

/**
 * ApiVersionBadge — muestra qué versión del API está usando el web
 * (GET /version cross-origin). Chrome no crítico: mientras carga o si falla,
 * no renderiza nada (el hook no reintenta). Se inyecta como `footer` del
 * `Sidebar` desde `_authenticated.tsx`, que ya vive bajo el QueryClientProvider
 * — así el `Sidebar` sigue siendo presentacional y testeable sin provider.
 */
export function ApiVersionBadge() {
  const { data } = useApiVersion()

  if (!data) {
    return null
  }

  const commit = data.commit && data.commit !== 'local' ? ` · ${data.commit}` : ''

  return (
    <p className="px-3 text-xs text-muted-foreground" data-testid="api-version">
      API v{data.version}
      {commit}
    </p>
  )
}
