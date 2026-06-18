import { act, render, type RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider } from '../context/AuthContext';

interface WrapperOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(
  ui: ReactElement,
  { routerProps, ...renderOptions }: WrapperOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter {...routerProps}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export async function advanceSearchTimers() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}
