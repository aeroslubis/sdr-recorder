import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

const TestHarness = () => {
  const { isAuthenticated, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? user?.username : 'anon'}</span>
      <button onClick={() => login('admin', '12345', false)}>LoginSession</button>
      <button onClick={() => login('admin', '12345', true)}>LoginRemember</button>
      <button onClick={() => login('admin', 'wrong', true)}>LoginFail</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

describe('AuthContext rememberMe storage behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('clears invalid tokens from both localStorage and sessionStorage on 401 bootstrap', async () => {
    localStorage.setItem('sdr_auth_token', 'stale-local');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 })
    );

    const { unmount } = render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anon'));
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();

    unmount();
    sessionStorage.setItem('sdr_auth_token', 'stale-session');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 })
    );

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anon'));
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();
  });

  test('switches cleanly between localStorage and sessionStorage across logins and clears both on logout', async () => {
    localStorage.setItem('sdr_auth_token', 'existing-remember-jwt');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 1, username: 'admin' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ token: 'session-jwt', user: { id: 1, username: 'admin' } }),
        { status: 200 }
      );
    });

    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin'));

    // Switching from rememberMe=true (localStorage) to rememberMe=false must clear localStorage
    await act(async () => {
      fireEvent.click(screen.getByText('LoginSession'));
    });

    expect(sessionStorage.getItem('sdr_auth_token')).toBe('session-jwt');
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ username: 'admin', password: '12345', remember_me: false }),
      })
    );

    // Logout must clear sessionStorage too
    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();
  });

  test('stores token in localStorage when rememberMe is true, restores session from either storage, and keeps storages empty on failed login', async () => {
    sessionStorage.setItem('sdr_auth_token', 'old-session-jwt');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 1, username: 'admin' }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.password === 'wrong') {
        return new Response(JSON.stringify({ detail: 'Invalid username or password' }), { status: 401 });
      }
      return new Response(
        JSON.stringify({ token: 'remember-jwt', user: { id: 1, username: 'admin' } }),
        { status: 200 }
      );
    });

    const { unmount } = render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin'));

    await act(async () => {
      fireEvent.click(screen.getByText('LoginRemember'));
    });
    expect(localStorage.getItem('sdr_auth_token')).toBe('remember-jwt');
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();

    unmount();
    render(
      <AuthProvider>
        <TestHarness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin'));

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('LoginFail'));
    });
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();
    expect(screen.getByTestId('auth-state').textContent).toBe('anon');
  });
});
