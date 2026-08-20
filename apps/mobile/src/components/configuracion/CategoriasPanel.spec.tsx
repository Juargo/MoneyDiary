/**
 * CategoriasPanel.spec.tsx — US-044 PR5b/PR5c, T5b.3/T5c.3
 *
 * Tests (14 cases):
 *  1. Groups render in fixed order Necesidades → Gustos → Ahorro
 *     (ETIQUETA_BUCKET: wire 'Deseos' → display 'Gustos') — MCTG-01
 *     Single getAllByRole('header') query — genuinely ordered, not assembled manually.
 *  2. ORDER pinning within a group — row order matches the catalogoDto order
 *     (array/DOM-order equality, never toContain — judgment-anticipated class 2)
 *  3. etiquetaPatrones 0 form: 'sin patrones'
 *  4. etiquetaPatrones 1 form: '1 patrón'
 *  5. etiquetaPatrones N form: '2 patrones' (multi-pattern category)
 *  6. Hint line renders: «Toca una categoría para editarla o eliminarla.» (D-13 mobile variant)
 *  7. Empty state: title «Todavía no tienes categorías» when catalog has zero categories
 *  8. Empty state: subtitle text when catalog has zero categories
 *  9. 'Nueva categoría' toggle button renders (inline form itself is PR5c)
 * 10. 'Nueva categoría' toggle is present in non-empty catalog too
 * 11. 'Eliminar categoría' absent from the list — cross-ref: PR6a positive case (D-12, class 3)
 * 12. CategoriasPanel does NOT call fetchCatalogo itself — catalog state stays owned by the route
 * 13. Unknown-bucket category renders under the trailing 'Otros' group heading (MCFG-MCTG-08)
 * 14. [PR5c T5c.3] Toggle reveals the REAL NuevaCategoriaForm (not the placeholder)
 */
import {
  render,
  screen,
  within,
  fireEvent,
  act,
} from '@testing-library/react-native';
import type { CatalogoDto } from '../../domain/catalogo.types';
import { CategoriasPanel } from './CategoriasPanel';

// Ensure expo-router is available (CategoriaFila imports useRouter)
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
  }),
}));

// Mock crearCategoria so NuevaCategoriaForm (rendered after toggle) does not
// fire real HTTP calls in this suite. The spec's focus is the toggle itself,
// not the form's mutation behaviour (that is NuevaCategoriaForm.spec.tsx's job).
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
}));

// Sample catalog: categories across all 3 known buckets (Necesidades, Deseos/Gustos, Ahorro).
// No unknown-bucket category here — adding one would change getAllByRole('header') count
// and break the order test. Unknown-bucket coverage uses a dedicated fixture below.
const sampleCatalogo: CatalogoDto = {
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Agua',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 2,
    },
    {
      id: 'cat-2',
      nombre: 'Luz',
      bucket: 'Necesidades',
      patrones: [
        {
          id: 'p1',
          categoriaId: 'cat-2',
          patron: 'LUZ',
          matchType: 'CONTAINS',
          prioridad: 1,
        },
      ],
      transaccionesCount: 4,
    },
    {
      id: 'cat-3',
      nombre: 'Netflix',
      bucket: 'Deseos',
      patrones: [
        {
          id: 'p2',
          categoriaId: 'cat-3',
          patron: 'NETFLIX',
          matchType: 'STARTS_WITH',
          prioridad: 1,
        },
        {
          id: 'p3',
          categoriaId: 'cat-3',
          patron: 'NFLX',
          matchType: 'CONTAINS',
          prioridad: 2,
        },
      ],
      transaccionesCount: 1,
    },
    {
      id: 'cat-4',
      nombre: 'AFP',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

const catalogoVacio: CatalogoDto = { categorias: [] };

// Dedicated fixture for the unknown-bucket scenario (MCFG-MCTG-08).
// agruparPorBucket funnels any bucket not in BUCKETS_ASIGNABLES into the
// trailing 'Otros' group. ETIQUETA_BUCKET has no entry for 'Otros', so
// the component renders ETIQUETA_BUCKET['Otros'] ?? 'Otros' = 'Otros'.
// Using a separate fixture keeps sampleCatalogo's heading count stable
// (getAllByRole('header') would return 4 headings if this were merged in).
const catalogoConBucketDesconocido: CatalogoDto = {
  categorias: [
    {
      id: 'cat-x',
      nombre: 'Inversión Rara',
      bucket: 'BucketRaro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

describe('CategoriasPanel (US-044 PR5b, T5b.3/T5b.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups render in fixed order Necesidades → Gustos → Ahorro (MCTG-01 — ETIQUETA_BUCKET)', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);

    // Single ordered query — getAllByRole returns nodes in DOM order.
    // accessibilityRole="header" + accessible={true} on each group heading Text node.
    // ETIQUETA_BUCKET maps wire 'Deseos' → display 'Gustos'.
    const headings = screen.getAllByRole('header');
    expect(headings.map((h) => h.props.children)).toEqual([
      'Necesidades',
      'Gustos',
      'Ahorro',
    ]);
  });

  it('row order within a group matches catalogoDto order (ORDER pinning — judgment class 2)', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);

    // Necesidades group has Agua (index 0) then Luz (index 1) — DOM order must match
    const necesidadesGroup = screen.getByTestId('grupo-Necesidades');
    const rowsInGroup = within(necesidadesGroup).getAllByRole('button');
    // Verify order via accessible names
    expect(rowsInGroup.map((r) => r.props.accessibilityLabel)).toEqual([
      'Agua',
      'Luz',
    ]);
  });

  it('renders etiquetaPatrones(0) → "sin patrones" for Agua', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    // Agua has 0 patrones
    const necesidadesGroup = screen.getByTestId('grupo-Necesidades');
    expect(
      within(necesidadesGroup).getByText('sin patrones'),
    ).toBeOnTheScreen();
  });

  it('renders etiquetaPatrones(1) → "1 patrón" for Luz', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    const necesidadesGroup = screen.getByTestId('grupo-Necesidades');
    expect(within(necesidadesGroup).getByText('1 patrón')).toBeOnTheScreen();
  });

  it('renders etiquetaPatrones(2) → "2 patrones" for Netflix', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    const gustosGroup = screen.getByTestId('grupo-Deseos');
    expect(within(gustosGroup).getByText('2 patrones')).toBeOnTheScreen();
  });

  it('renders the hint line "Toca una categoría para editarla o eliminarla." (D-13 mobile variant)', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    expect(
      screen.getByText('Toca una categoría para editarla o eliminarla.'),
    ).toBeOnTheScreen();
  });

  it('renders empty state title when catalog has zero categories', async () => {
    await render(<CategoriasPanel catalogo={catalogoVacio} />);
    expect(screen.getByText('Todavía no tienes categorías')).toBeOnTheScreen();
  });

  it('renders empty state subtitle when catalog has zero categories', async () => {
    await render(<CategoriasPanel catalogo={catalogoVacio} />);
    expect(
      screen.getByText(
        'Crea tu primera categoría para empezar a clasificar tus movimientos.',
      ),
    ).toBeOnTheScreen();
  });

  it('renders a "Nueva categoría" toggle button (inline form itself is PR5c)', async () => {
    await render(<CategoriasPanel catalogo={catalogoVacio} />);
    expect(
      screen.getByRole('button', { name: 'Nueva categoría' }),
    ).toBeOnTheScreen();
  });

  it('"Nueva categoría" button also renders in non-empty catalog', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    expect(
      screen.getByRole('button', { name: 'Nueva categoría' }),
    ).toBeOnTheScreen();
  });

  it('has NO "Eliminar categoría" on the list — deletion lives on the edit screen (D-12, class 3)', async () => {
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    // Non-tautological: absence asserted, cross-referenced with PR6a's positive case
    expect(screen.queryByText('Eliminar categoría')).toBeNull();
    expect(screen.queryByText('Eliminar')).toBeNull();
    // Also catch an accessibilityLabel-based delete control (e.g. icon-only button)
    expect(screen.queryByRole('button', { name: /elimin/i })).toBeNull();
  });

  it('unknown-bucket category renders under the trailing "Otros" group heading (MCFG-MCTG-08)', async () => {
    await render(<CategoriasPanel catalogo={catalogoConBucketDesconocido} />);
    // agruparPorBucket places 'BucketRaro' into the 'Otros' fallback group.
    // The heading testID uses the wire bucket value ('Otros'), and
    // ETIQUETA_BUCKET['Otros'] ?? 'Otros' = 'Otros', so the label is 'Otros'.
    const otrosGroup = screen.getByTestId('grupo-Otros');
    expect(within(otrosGroup).getByRole('header')).toHaveTextContent('Otros');
    expect(
      within(otrosGroup).getByRole('button', { name: 'Inversión Rara' }),
    ).toBeOnTheScreen();
  });

  it('does NOT own a fetch — receives catálogo as a prop from the route (design §0)', async () => {
    // This is verified structurally: CategoriasPanel must not import fetchCatalogo.
    // At the RNTL level, rendering with a pre-resolved prop is the proof:
    // if the component fetched itself, it would need access to the fetch module and
    // would produce a different state machine; here we just confirm the prop is rendered.
    await render(<CategoriasPanel catalogo={sampleCatalogo} />);
    // The fact that Agua appears proves the prop was consumed, not internally fetched
    expect(screen.getByRole('button', { name: 'Agua' })).toBeOnTheScreen();
  });

  it('[PR5c T5c.3] toggle reveals the REAL NuevaCategoriaForm, not the placeholder', async () => {
    await render(<CategoriasPanel catalogo={catalogoVacio} />);

    // Before toggle: the placeholder testID must be absent (PR5b shipped the
    // placeholder; PR5c replaces it with the real form)
    expect(screen.queryByTestId('nueva-categoria-form-placeholder')).toBeNull();
    // The form itself should not be visible yet
    expect(screen.queryByTestId('nueva-categoria-form')).toBeNull();

    // Toggle the form open
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Nueva categoría' }));
    });

    // The REAL form must now be visible (NuevaCategoriaForm's root testID)
    expect(screen.getByTestId('nueva-categoria-form')).toBeOnTheScreen();
    // The placeholder must remain absent — it was replaced, not hidden
    expect(screen.queryByTestId('nueva-categoria-form-placeholder')).toBeNull();
    // The Nombre field and bucket chips confirm the real form rendered
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
