import { createFileRoute } from '@tanstack/react-router';
import { AyudaPage } from '@/components/AyudaPage';

/**
 * `/ayuda` — converts the "Ayuda" nav item from its long-lived
 * `'placeholder'` kind (WDS-03) to a real route. Thin container, same idiom
 * as `routes/_authenticated/registrar.tsx`/`semaforo.tsx`: no data fetching
 * and no `Route.*` hooks here, so all content coverage lives on `AyudaPage`
 * itself (`AyudaPage.test.tsx`).
 */
export const Route = createFileRoute('/_authenticated/ayuda')({
  component: AyudaPage,
});
