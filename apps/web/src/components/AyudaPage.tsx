import { Link } from '@tanstack/react-router';

/**
 * AyudaPage — content for `/ayuda` (nav conversion from the long-lived
 * `'placeholder'` item, WDS-03). Router-agnostic composition, same reasoning
 * as `SemaforoDetallePage`: only its internal `<Link>`s need a router, so it
 * is tested directly (`AyudaPage.test.tsx`, via the shared
 * `src/test/router-harness.tsx`) rather than through the thin route
 * container (`routes/_authenticated/ayuda.tsx`).
 *
 * Read-mode page (impeccable craft-floor): single `h1`, one `h2` per
 * section, definition-first prose, no invented product claims — every fact
 * here already exists elsewhere (the worst-of-3 sentence is copied verbatim
 * from `SemaforoDetallePage` so the two never drift; the bucket labels come
 * from `ETIQUETA_BUCKET`). Plain page shell (no `DASHBOARD_CARD_CLASS`) to
 * match `/semaforo`'s own shell, per design.md §5 precedent — this is prose
 * to read, not a data card.
 */
export function AyudaPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-4 pb-12">
      <h1 className="text-2xl font-bold text-foreground">Ayuda</h1>

      <section
        aria-labelledby="ayuda-como-funciona"
        className="flex flex-col gap-3"
      >
        <h2
          id="ayuda-como-funciona"
          className="text-lg font-semibold text-foreground"
        >
          Cómo funciona MoneyDiary
        </h2>
        <ol className="flex list-inside list-decimal flex-col gap-2 text-sm text-foreground">
          <li>Subís tu cartola (el archivo que te da tu banco).</li>
          <li>
            Revisás los movimientos — muchos ya vienen clasificados solos por
            tus patrones — y ajustás lo que falte en Necesidades, Gustos o
            Ahorro.
          </li>
          <li>
            El semáforo responde "¿estoy bien este mes?" con un veredicto verde,
            amarillo o rojo.
          </li>
        </ol>
      </section>

      <section aria-labelledby="ayuda-semaforo" className="flex flex-col gap-3">
        <h2
          id="ayuda-semaforo"
          className="text-lg font-semibold text-foreground"
        >
          El semáforo
        </h2>
        <p className="text-sm text-foreground">
          Tu semáforo global es el peor de los tres grupos: si uno está en rojo,
          todo el mes queda en rojo.
        </p>
        <Link
          to="/semaforo"
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Ver tu semáforo del mes
        </Link>
      </section>

      <section aria-labelledby="ayuda-glosario" className="flex flex-col gap-3">
        <h2
          id="ayuda-glosario"
          className="text-lg font-semibold text-foreground"
        >
          Glosario
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-semibold text-foreground">Cartola</dt>
            <dd className="text-muted-foreground">
              El archivo (.xlsx o .pdf) que descargás de tu banco con los
              movimientos del mes.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Ingesta</dt>
            <dd className="text-muted-foreground">
              Cada vez que subís una cartola. Queda registrada en Gestionar
              cartolas como exitosa o fallida.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Movimiento</dt>
            <dd className="text-muted-foreground">
              Un ingreso o gasto individual, ya sea importado desde una cartola
              o registrado a mano.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">
              Buckets (Necesidades, Gustos, Ahorro y Sin categoría)
            </dt>
            <dd className="text-muted-foreground">
              Los grupos del método 50/30/20 en que se clasifica cada
              movimiento. "Sin categoría" agrupa lo que todavía no tiene un
              patrón de clasificación asignado.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">
              Patrones de clasificación
            </dt>
            <dd className="text-muted-foreground">
              Reglas que asignan una categoría a un movimiento según su
              descripción, para no tener que clasificarlo a mano cada mes.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Modo demo</dt>
            <dd className="text-muted-foreground">
              Una cuenta de ejemplo, con datos de muestra, para probar
              MoneyDiary sin crear una cuenta real. En demo, las superficies de
              escritura quedan de solo lectura.
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="ayuda-donde-hago"
        className="flex flex-col gap-3"
      >
        <h2
          id="ayuda-donde-hago"
          className="text-lg font-semibold text-foreground"
        >
          ¿Dónde hago…?
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-foreground">
          <li>
            <Link
              to="/subir"
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Subir cartola
            </Link>{' '}
            — para cargar el archivo de tu banco.
          </li>
          <li>
            <Link
              to="/registrar"
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Registrar movimiento
            </Link>{' '}
            — para un ingreso o gasto que no viene de una cartola.
          </li>
          <li>
            <Link
              to="/ingestas"
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Gestionar cartolas
            </Link>{' '}
            — para ver o eliminar las cartolas ya subidas.
          </li>
          <li>
            <Link
              to="/configuracion"
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Configuración
            </Link>{' '}
            — para tu perfil, tus categorías y patrones.
          </li>
        </ul>
      </section>
    </div>
  );
}
