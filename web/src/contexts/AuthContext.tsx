import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '../types';
import { authApi } from '../api/auth.api';
import { resetClientCaches } from '../api/queryClient';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string, authUser: AuthUser) => void;
  logout: () => Promise<void>;
  updateUser: (updatedFields: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore user from localStorage on app load
    const storedUser = localStorage.getItem('user');
    const accessToken = localStorage.getItem('accessToken');
    if (storedUser && accessToken) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.clear();
      }
    }
    setIsLoading(false);
  }, []);

  // Every change of signed-in identity starts from an empty cache: nothing
  // fetched under one account or station may be shown to the next.
  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const { accessToken, refreshToken, user: authUser } = response.data.data!;
    resetClientCaches();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const loginWithTokens = useCallback((accessToken: string, refreshToken: string, authUser: AuthUser) => {
    resetClientCaches();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const updateUser = useCallback((updatedFields: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore logout errors
      }
    }
    localStorage.clear();
    resetClientCaches();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, loginWithTokens, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};
