export function useAuth() {
  return { user: null, isAuthenticated: false };
}

export type AuthState = { user: string | null; isAuthenticated: boolean };
