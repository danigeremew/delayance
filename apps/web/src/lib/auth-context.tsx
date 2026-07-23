'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, clearTokens, getAccessToken, logoutApi, setTokens, updateProfileApi } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthContextType {

  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  setAuthSession: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; email?: string }) => Promise<User>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const userData = await apiFetch<User>('/auth/me');
      setUser(userData);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const setAuthSession = useCallback(
    (tokens: { accessToken: string; refreshToken: string }, userData: User) => {
      setTokens(tokens.accessToken, tokens.refreshToken);
      setUser(userData);
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; email?: string }) => {
    const updated = await updateProfileApi(data);
    setUser(updated);
    return updated;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        setAuthSession,
        logout,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
