/**
 * Header.spec.tsx — US-044 PR8, T8.3/T8.4.
 *
 * First spec for Header.tsx (ripgrep-verified: no spec existed before this PR).
 *
 * Tests the gear entry point (D-18 milestone: the gear makes /configuracion
 * reachable from the UI for the first time in the PR1–PR8 chain).
 *
 * Scope:
 *   - Gear renders with accessibilityLabel="Configuración" and role="button".
 *   - Tapping the gear navigates to /configuracion via router.push.
 *   - The ☰ / 'Abrir menú' stub is GONE.
 *   - The avatar stays present and is NOT a button (D-02).
 *   - The period label text renders.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Header } from './Header';

// expo-router mock — same pattern as configuracion.spec.tsx (uses
// jest.requireActual to get useEffect without a require() style import).
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof React>('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => {
      useEffect(cb, [cb]);
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

beforeEach(() => {
  mockPush.mockClear();
});

describe('Header — gear entry point (US-044 PR8)', () => {
  it('renders the gear with accessibilityLabel="Configuración"', async () => {
    // RED anchor: current Header has 'Abrir menú', not 'Configuración'.
    await render(<Header periodoLabel="agosto 2026" />);
    const gear = screen.getByLabelText('Configuración');
    expect(gear).toBeTruthy();
  });

  it('the gear has accessibilityRole="button"', async () => {
    await render(<Header periodoLabel="agosto 2026" />);
    // Narrows to label "Configuración" — tighter than getByRole('button') alone
    // because the current ☰ also had role button (just a different label).
    const gear = screen.getByRole('button', { name: 'Configuración' });
    expect(gear).toBeTruthy();
  });

  it('tapping the gear calls router.push("/configuracion")', async () => {
    await render(<Header periodoLabel="agosto 2026" />);
    const gear = screen.getByLabelText('Configuración');
    fireEvent.press(gear);
    expect(mockPush).toHaveBeenCalledWith('/configuracion');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('the ☰ / "Abrir menú" stub is gone (D-02 — gear replaces it)', async () => {
    await render(<Header periodoLabel="agosto 2026" />);
    // Absence assertion — non-tautological: paired with the gear's positive
    // label assertion above (same getByLabelText query, different label value).
    expect(screen.queryByLabelText('Abrir menú')).toBeNull();
    expect(screen.queryByText('☰')).toBeNull();
  });

  it('the avatar is present and is NOT a button (D-02)', async () => {
    await render(<Header periodoLabel="agosto 2026" />);
    // Avatar has an accessible label "Perfil" (unchanged from the original Header).
    const avatar = screen.getByLabelText('Perfil');
    expect(avatar).toBeTruthy();
    // Avatar must NOT be a button — D-02 says it stays decorative.
    expect(screen.queryByRole('button', { name: 'Perfil' })).toBeNull();
    // The gear is the ONLY button.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('renders the period label text', async () => {
    await render(<Header periodoLabel="agosto 2026" />);
    expect(screen.getByText('agosto 2026')).toBeTruthy();
  });
});
