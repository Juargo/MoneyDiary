/**
 * ConfiguracionTabs — la lista de secciones vertical de CA-02 (US-042
 * design.md §1/Q7e). `Perfil` lleva `aria-current="page"` (una lista de tabs
 * que no dice cuál panel se muestra es un defecto de a11y, no una elección
 * de estilo — proposal §7). `Categorías` es un placeholder INERTE, mismo
 * tratamiento verbatim que `NavItem.tsx:56-68` (`<button type="button"
 * disabled aria-disabled="true">` — sin `href`, no focuseable, no en el tab
 * order, anunciado como deshabilitado out of the box): reusar el ÚNICO
 * patrón que la app ya tiene para "no construido todavía" en vez de inventar
 * uno segundo para el mismo concepto (`dry`). US-043 lo cambia a un link en
 * una línea, igual que el placeholder del nav.
 */
export function ConfiguracionTabs() {
  return (
    <nav aria-label="Secciones de configuración">
      <ul className="flex flex-col gap-1">
        <li>
          <span
            aria-current="page"
            className="block rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900"
          >
            Perfil
          </span>
        </li>
        <li>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-400"
          >
            Categorías
          </button>
        </li>
      </ul>
    </nav>
  );
}
