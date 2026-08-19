import { render, screen, fireEvent } from '@testing-library/react-native';
import { TabsConfiguracion } from './TabsConfiguracion';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
}));

describe('TabsConfiguracion (US-044 PR3b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Perfil and Categorías tabs inside a tablist', async () => {
    await render(
      <TabsConfiguracion tabActiva="perfil" onCambiarTab={() => {}} />,
    );

    expect(screen.getByTestId('tabs-configuracion')).toHaveProp(
      'accessibilityRole',
      'tablist',
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByText('Perfil')).toBeOnTheScreen();
    expect(screen.getByText('Categorías')).toBeOnTheScreen();
  });

  it('marks accessibilityState.selected on the active tab only', async () => {
    const { rerender } = await render(
      <TabsConfiguracion tabActiva="perfil" onCambiarTab={() => {}} />,
    );

    const tabPerfil = screen.getByRole('tab', { name: 'Perfil' });
    const tabCategorias = screen.getByRole('tab', { name: 'Categorías' });

    expect(tabPerfil.props.accessibilityState).toHaveProperty('selected', true);
    expect(tabCategorias.props.accessibilityState).toHaveProperty(
      'selected',
      false,
    );

    await rerender(
      <TabsConfiguracion tabActiva="categorias" onCambiarTab={() => {}} />,
    );

    expect(tabPerfil.props.accessibilityState).toHaveProperty(
      'selected',
      false,
    );
    expect(tabCategorias.props.accessibilityState).toHaveProperty(
      'selected',
      true,
    );
  });

  it('calls onCambiarTab with the target key when tapping the inactive tab', async () => {
    const onCambiarTab = jest.fn();
    await render(
      <TabsConfiguracion tabActiva="perfil" onCambiarTab={onCambiarTab} />,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));
    expect(onCambiarTab).toHaveBeenCalledTimes(1);
    expect(onCambiarTab).toHaveBeenCalledWith('categorias');
  });

  it('does not trigger router navigation when switching tabs (D-01)', async () => {
    const onCambiarTab = jest.fn();
    await render(
      <TabsConfiguracion tabActiva="perfil" onCambiarTab={onCambiarTab} />,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Categorías' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('is a controlled component independent of navigation segments (D-01)', async () => {
    const onCambiarTab = jest.fn();
    await render(
      <TabsConfiguracion tabActiva="categorias" onCambiarTab={onCambiarTab} />,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    expect(onCambiarTab).toHaveBeenCalledWith('perfil');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
