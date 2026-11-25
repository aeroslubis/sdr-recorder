export const TOKEN_KEY = 'sdr_auth_token';

export function readStoredToken(): string | null {
  let localToken: string | null = null;
  try {
    localToken = typeof window !== 'undefined' ? window.localStorage?.getItem?.(TOKEN_KEY) ?? null : null;
  } catch {
    localToken = null;
  }
  if (localToken) {
    return localToken;
  }
  try {
    return typeof window !== 'undefined' ? window.sessionStorage?.getItem?.(TOKEN_KEY) ?? null : null;
  } catch {
    return null;
  }
}

export function clearStoredTokens(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.removeItem?.(TOKEN_KEY);
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem?.(TOKEN_KEY);
    }
  } catch {}
}

export function saveStoredToken(token: string, rememberMe: boolean): void {
  clearStoredTokens();
  try {
    if (typeof window !== 'undefined') {
      if (rememberMe) {
        window.localStorage?.setItem?.(TOKEN_KEY, token);
      } else {
        window.sessionStorage?.setItem?.(TOKEN_KEY, token);
      }
    }
  } catch {}
}
