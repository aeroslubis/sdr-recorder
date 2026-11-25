# WebUI Remember Me & Browser Password Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable browser-native password saving on first WebUI login and add an opt-in **"Remember me"** session persistence option (`sessionStorage` 24h vs `localStorage` 30d).

**Architecture:** The backend adds an optional `remember_me: bool = False` flag to `POST /api/auth/login` that switches JWT expiration between `JWT_EXPIRATION_HOURS` (24h) and `JWT_REMEMBER_EXPIRATION_DAYS` (30d). On the frontend, `AuthContext` stores the JWT in `sessionStorage` when `rememberMe` is `false` and `localStorage` when `true`, while `LoginView` improves `<form>`/`name` semantics for browser password managers and exposes an unchecked-by-default **"Remember me"** checkbox.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, PyJWT, pytest; React 18, TypeScript (`strict: true`), Tailwind CSS, Vitest, Testing Library.

**Spec:** [2026-11-25-remember-me-login-design.md](file:///home/dev/workspaces/sdr-recorder/docs/superpowers/specs/2026-11-25-remember-me-login-design.md)

## Global Constraints

- All WebUI text, labels, tooltips, and code comments must be in **English**.
- `LoginView` username and password inputs must initialize to `''` (no default credential auto-fill, no `->` arrow symbol on submit button).
- Never store plaintext or client-encrypted passwords in `localStorage`, `sessionStorage`, or application state.
- `POST /api/auth/login` must remain backwards-compatible when `remember_me` is omitted (`False` default).
- All backend tests (`pytest`) and frontend tests + build (`npm test -- --run` and `npm run build`) must pass.

## Review Focus

- Omitting `remember_me` in `POST /api/auth/login` continues issuing a ~24h token without validation errors (tested in Task 1).
- Passing `remember_me: true` with invalid credentials still returns HTTP `401` and issues no token (tested in Task 1).
- Switching between `rememberMe=true` and `rememberMe=false` across logins clears the opposite storage (`localStorage` vs `sessionStorage`) so stale tokens never linger (tested in Task 2).
- Session bootstrap checks both `localStorage` and `sessionStorage`, and clears both on `401` or `logout()` (tested in Task 2).
- `LoginView` inputs remain empty on render, `Remember me` starts unchecked, and `<form>`/`<input>` carry `method="post"` + `name`/`autoComplete` attributes for browser password prompts (tested in Task 3).

---

### Task 1: Backend `remember_me` JWT Expiration Support

**Files:**
- Modify: `backend/config.py:11-18`
- Modify: `backend/models.py:31-33`
- Modify: `backend/routers/auth_router.py:26-48`
- Modify: `.env.example:11-15`
- Test: `backend/tests/test_api_auth_radio.py`

**Interfaces:**
- Consumes: `create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str` from `backend/auth.py`
- Produces: `UserLogin.remember_me: bool = False`, `backend.config.JWT_REMEMBER_EXPIRATION_DAYS: int` (default `30`), and `POST /api/auth/login` honoring `remember_me`.

- [ ] **Step 1: Write the failing backend tests in `backend/tests/test_api_auth_radio.py`**

```python
def test_login_remember_me_token_expiration(client):
    from datetime import datetime, timezone
    import jwt
    from backend import config

    # Default login (omitting remember_me) -> ~24h expiration
    resp_default = client.post("/api/auth/login", json={"username": "admin", "password": "12345"})
    assert resp_default.status_code == 200
    payload_default = jwt.decode(
        resp_default.json()["token"],
        config.JWT_SECRET,
        algorithms=[config.JWT_ALGORITHM],
    )
    now_ts = datetime.now(timezone.utc).timestamp()
    default_ttl = payload_default["exp"] - now_ts
    assert 23 * 3600 < default_ttl <= 25 * 3600

    # Explicit remember_me=True -> ~30d expiration
    resp_remember = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "12345", "remember_me": True},
    )
    assert resp_remember.status_code == 200
    payload_remember = jwt.decode(
        resp_remember.json()["token"],
        config.JWT_SECRET,
        algorithms=[config.JWT_ALGORITHM],
    )
    remember_ttl = payload_remember["exp"] - now_ts
    assert 29 * 86400 < remember_ttl <= 31 * 86400

    # Invalid password with remember_me=True still fails with 401
    resp_bad = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong", "remember_me": True},
    )
    assert resp_bad.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/test_api_auth_radio.py -k test_login_remember_me_token_expiration -v`
Expected: FAIL (`default_ttl` assertion passes, `remember_ttl` fails because `remember_me` is ignored and token still expires in 24h).

- [ ] **Step 3: Add `JWT_REMEMBER_EXPIRATION_DAYS`, `UserLogin.remember_me`, and `auth_router.login` expiration logic**

1. In `backend/config.py`, add `JWT_REMEMBER_EXPIRATION_DAYS = int(os.environ.get("JWT_REMEMBER_EXPIRATION_DAYS", "30"))`.
2. In `.env.example`, document `JWT_REMEMBER_EXPIRATION_DAYS=30` under the `# Security & Authentication` section.
3. In `backend/models.py`, update `UserLogin`:
   `remember_me: bool = False`
4. In `backend/routers/auth_router.py`, import `timedelta` and `backend.config`, and in `login(payload: UserLogin, ...)` compute `expires_delta = timedelta(days=config.JWT_REMEMBER_EXPIRATION_DAYS) if payload.remember_me else None` and pass `expires_delta=expires_delta` to `create_access_token(...)`.

- [ ] **Step 4: Run backend auth & full Python test suite to verify pass**

Run: `.venv/bin/pytest tests/ backend/tests/ -v`
Expected: PASS (all tests including `test_login_remember_me_token_expiration`).

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/models.py backend/routers/auth_router.py backend/tests/test_api_auth_radio.py .env.example
git commit -m "feat(auth): support remember_me extended JWT expiration"
```

---

### Task 2: Frontend `AuthContext` Dual Storage (`sessionStorage` vs `localStorage`)

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx:8-141`
- Create: `frontend/src/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (`{ username, password, remember_me }`) and `GET /api/auth/me`
- Produces: `AuthContextType.login(username: string, password: string, rememberMe?: boolean): Promise<boolean>`

- [ ] **Step 1: Write the failing tests in `frontend/src/__tests__/AuthContext.test.tsx`**

```tsx
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

const TestHarness = () => {
  const { isAuthenticated, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? user?.username : 'anon'}</span>
      <button onClick={() => login('admin', '12345', false)}>LoginSession</button>
      <button onClick={() => login('admin', '12345', true)}>LoginRemember</button>
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

  test('stores token in sessionStorage when rememberMe is false and clears localStorage', async () => {
    localStorage.setItem('sdr_auth_token', 'stale-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/auth/me') {
        return new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 });
      }
      return new Response(
        JSON.stringify({ token: 'session-jwt', user: { id: 1, username: 'admin' } }),
        { status: 200 }
      );
    });

    render(<AuthProvider><TestHarness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anon'));

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
  });

  test('stores token in localStorage when rememberMe is true and restores session on mount', async () => {
    sessionStorage.setItem('sdr_auth_token', 'old-session-jwt');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input) === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 1, username: 'admin' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ token: 'remember-jwt', user: { id: 1, username: 'admin' } }),
        { status: 200 }
      );
    });

    const { unmount } = render(<AuthProvider><TestHarness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin'));

    await act(async () => {
      fireEvent.click(screen.getByText('LoginRemember'));
    });
    expect(localStorage.getItem('sdr_auth_token')).toBe('remember-jwt');
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();

    unmount();
    render(<AuthProvider><TestHarness /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin'));

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });
    expect(localStorage.getItem('sdr_auth_token')).toBeNull();
    expect(sessionStorage.getItem('sdr_auth_token')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/__tests__/AuthContext.test.tsx --run`
Expected: FAIL (`sessionStorage.getItem('sdr_auth_token')` is `null` and `remember_me` is missing from `/api/auth/login` request body).

- [ ] **Step 3: Update `AuthContext.tsx` (`login(username, password, rememberMe = false)`)**

1. Extract helpers `readStoredToken(): string | null` (checks `localStorage` first, then `sessionStorage`) and `clearStoredTokens(): void` (removes `TOKEN_KEY` from both `localStorage` and `sessionStorage`).
2. Update `AuthContextType.login` signature to `(username: string, password: string, rememberMe?: boolean) => Promise<boolean>`.
3. Initialize `token` state via `readStoredToken()` and verify via `/api/auth/me` using `readStoredToken()`, calling `clearStoredTokens()` on non-OK response.
4. In `login(username, password, rememberMe = false)`, send `JSON.stringify({ username, password, remember_me: rememberMe })`; on success, call `clearStoredTokens()` then write `data.token` to `localStorage` when `rememberMe` is `true` or `sessionStorage` when `false`.
5. In `logout()`, call `clearStoredTokens()`.

- [ ] **Step 4: Run `AuthContext` test to verify it passes**

Run: `cd frontend && npm test -- src/__tests__/AuthContext.test.tsx --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AuthContext.tsx frontend/src/__tests__/AuthContext.test.tsx
git commit -m "feat(auth): store JWT in sessionStorage or localStorage based on rememberMe"
```

---

### Task 3: Frontend `LoginView` Browser Password Semantics & "Remember me" Checkbox

**Files:**
- Modify: `frontend/src/components/LoginView.tsx:1-135`
- Modify: `frontend/src/__tests__/LoginView.test.tsx:1-43`

**Interfaces:**
- Consumes: `AuthContextType.login(username: string, password: string, rememberMe?: boolean): Promise<boolean>` passed via `App.tsx`
- Produces: `LoginViewProps.onLogin?: (username: string, password: string, rememberMe?: boolean) => void | Promise<void | boolean>`

- [ ] **Step 1: Update & add tests in `frontend/src/__tests__/LoginView.test.tsx`**

```tsx
test('exposes browser password-manager form attributes and unchecked Remember me by default', () => {
  const { container } = render(<LoginView onLogin={jest.fn()} />);
  const form = container.querySelector('form') as HTMLFormElement;
  expect(form.getAttribute('method')).toBe('post');

  const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;
  const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
  expect(usernameInput.getAttribute('name')).toBe('username');
  expect(passwordInput.getAttribute('name')).toBe('password');

  const rememberCheckbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
  expect(rememberCheckbox.type).toBe('checkbox');
  expect(rememberCheckbox.checked).toBe(false);
});

test('passes rememberMe=true when Remember me checkbox is checked', async () => {
  const handleLogin = jest.fn();
  render(<LoginView onLogin={handleLogin} />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByLabelText(/remember me/i));
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  });

  expect(handleLogin).toHaveBeenCalledWith('admin', '12345', true);
});
```

Also update the existing `submits form with entered username and password` assertion in `LoginView.test.tsx` to `expect(handleLogin).toHaveBeenCalledWith('admin', '12345', false);`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/__tests__/LoginView.test.tsx --run`
Expected: FAIL (`Remember me` checkbox and `method="post"` / `name` attributes not present yet).

- [ ] **Step 3: Update `LoginView.tsx`**

1. Update `LoginViewProps.onLogin` to `(username: string, password: string, rememberMe?: boolean) => void | Promise<void | boolean>`.
2. Add `const [rememberMe, setRememberMe] = useState(false);` and pass `(username, password, rememberMe)` to `onLogin`.
3. Add `method="post"` on `<form>` and `name="username"` / `name="password"` on the respective `<input>` elements while keeping `autoComplete="username"` and `autoComplete="current-password"`.
4. Add an English **"Remember me"** checkbox (`id="remember-me"`) between the password field and the Sign In button, styled with Tailwind theme tokens (`accent-phosphor-green`, `border-slate`, `bg-obsidian`, `text-silver-mist`).

- [ ] **Step 4: Run full frontend tests and TypeScript/Vite production build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: All Vitest suites PASS and `tsc && vite build` exits 0 with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LoginView.tsx frontend/src/__tests__/LoginView.test.tsx
git commit -m "feat(ui): add Remember me checkbox and password manager form semantics"
```
