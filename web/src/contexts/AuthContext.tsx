import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '../types';
import { authApi, DEVICE_TOKEN_KEY, type VerificationChallenge } from '../api/auth.api';
import { resetClientCaches } from '../api/queryClient';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Resolves with a challenge when this device must first enter an emailed code. */
  login: (email: string, password: string) => Promise<VerificationChallenge | null>;
  verifyDevice: (challengeToken: string, code: string) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string, authUser: AuthUser, deviceToken?: string) => void;
  logout: () => Promise<void>;
  updateUser: (updatedFields: Partial<AuthUser>) => void;
}

// Sign-out forgets the session, never the device's trust.
const clearSessionStorage = () => {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  localStorage.clear();
  if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
};

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
        clearSessionStorage();
      }
    }
    setIsLoading(false);
  }, []);

  // Every change of signed-in identity starts from an empty cache: nothing
  // fetched under one account or station may be shown to the next.
  const startSession = useCallback((data: { accessToken: string; refreshToken: string; user: AuthUser; deviceToken?: string }) => {
    resetClientCaches();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
    setUser(data.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const data = response.data.data!;
    if ('requiresVerification' in data) return data;
    startSession(data);
    return null;
  }, [startSession]);

  const verifyDevice = useCallback(async (challengeToken: string, code: string) => {
    const response = await authApi.verifyDevice(challengeToken, code);
    startSession(response.data.data!);
  }, [startSession]);

  const loginWithTokens = useCallback((accessToken: string, refreshToken: string, authUser: AuthUser, deviceToken?: string) => {
    startSession({ accessToken, refreshToken, user: authUser, deviceToken });
  }, [startSession]);

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
    clearSessionStorage();
    resetClientCaches();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, verifyDevice, loginWithTokens, logout, updateUser }}>
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
