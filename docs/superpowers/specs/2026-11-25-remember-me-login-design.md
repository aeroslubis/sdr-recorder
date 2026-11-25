# Design Spec: WebUI "Remember Me" & Browser Password Save Support

- **Date:** 2026-11-25
- **Approach:** Browser-Native Password Manager + "Remember Me" Session Persistence
- **Size:** Small change (focused enhancement across login UI, auth context, and `/api/auth/login`)

---

## 1. Intent & Why

Users logging into the WebUI want to avoid re-entering credentials on repeat visits without compromising security. Storing raw or reversible passwords in browser `localStorage` is unsafe and conflicts with the project rule that `LoginView` inputs must initialize empty. Pairing standard browser password-manager form semantics with an explicit **"Remember me"** session option delivers both convenience and safety with minimal complexity.

## 2. Goals & Non-Goals

### Goals
- Improve `<form>` and `<input>` semantics in `frontend/src/components/LoginView.tsx` so browser password managers reliably offer to save credentials on first login.
- Add an unchecked-by-default **"Remember me"** checkbox to `LoginView.tsx` (in English, matching Supabase theme tokens).
- Extend JWT expiration (default `30` days via `JWT_REMEMBER_EXPIRATION_DAYS`) and persist the token in `localStorage` when **"Remember me"** is checked; keep the default `24` hour expiration and store the token in `sessionStorage` when unchecked.
- Clear tokens from both `localStorage` and `sessionStorage` on logout or invalid/expired session.

### Non-Goals / Anti-Goals
- Never store plaintext or client-encrypted passwords in `localStorage`, `sessionStorage`, or application state.
- Never pre-fill default credentials in `LoginView.tsx`.
- Do not introduce SQLite-backed refresh tokens or `/api/auth/refresh` endpoints in this iteration.

## 3. Constraints

- All WebUI text, labels, and comments must be in **English**.
- `LoginView` username and password inputs must initialize to `''`.
- `POST /api/auth/login` must remain backwards-compatible when `remember_me` is omitted (defaults to `False`).
- Backend tests (`pytest`) and frontend tests (`npm test -- --run` + `npm run build`) must pass.

## 4. Approaches Considered

1. **Browser Password Manager + "Remember me" Checkbox (Chosen):** Combines proper `<form>`/`name`/`autocomplete` attributes for browser-native password saving with a `remember_me` flag that switches between `sessionStorage` (24h) and `localStorage` (30d). Safest and simplest; works over LAN HTTP even when browsers restrict password auto-save on non-HTTPS origins.
2. **Browser Form Semantics Only (Dropped):** Zero backend changes, but keeps sessions locked to 24h in `localStorage` and offers no control on shared devices or non-HTTPS LAN hosts.
3. **Refresh Tokens in SQLite + "Remember me" (Dropped):** Enables cross-restart token revocation, but adds unnecessary schema, endpoint, and client-retry complexity for a single-admin NVR.

## 5. Architecture & Component Changes

- **Backend (`backend/config.py`, `backend/models.py`, `backend/routers/auth_router.py`):**
  - Add `JWT_REMEMBER_EXPIRATION_DAYS` env setting (default `30`) in `backend/config.py` and document in `.env.example`.
  - Add `remember_me: bool = False` to `UserLogin` in `backend/models.py`.
  - In `POST /api/auth/login`, pass `expires_delta=timedelta(days=config.JWT_REMEMBER_EXPIRATION_DAYS)` to `create_access_token()` when `payload.remember_me` is `True`; otherwise keep default `JWT_EXPIRATION_HOURS` (`24`h).
- **Frontend (`frontend/src/components/LoginView.tsx`, `frontend/src/context/AuthContext.tsx`):**
  - Update `<form>` in `LoginView.tsx` with `method="post"` and explicit `name="username"` / `name="password"` attributes while keeping `autoComplete="username"` and `autoComplete="current-password"`.
  - Add a **"Remember me"** checkbox (`useState(false)`) and pass `(username, password, rememberMe)` to `onLogin`.
  - Update `AuthContext.tsx` so `login(username, password, rememberMe = false)` sends `remember_me` in the JSON body, writes the token to `localStorage` when `rememberMe` is `true` or `sessionStorage` when `false` (clearing the other storage), reads from both on session bootstrap, and clears both on `logout` or `401`.
- **Verification:**
  - Backend tests in `backend/tests/test_api_auth_radio.py` verifying default 24h vs extended `remember_me=True` JWT `exp` claim and backwards compatibility.
  - Frontend tests in `frontend/src/__tests__/LoginView.test.tsx` (and `AuthContext` coverage) verifying empty inputs, checkbox toggle, `rememberMe` callback argument, and `localStorage` vs `sessionStorage` persistence.
