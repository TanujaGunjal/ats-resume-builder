import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI, removeAuthToken, getAuthToken } from '../services/api';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const fallbackAuthContext: AuthContextType = {
  user: null,
  token: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,
  login: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  register: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  logout: () => {},
  clearError: () => {},
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = getAuthToken();
      if (storedToken) {
        setToken(storedToken);
        try {
          // Get user profile from localStorage (set during login/register)
          const userData = authAPI.getCurrentUser();
          if (userData) {
            setUser(userData);
          }
        } catch (err) {
          // Token might be invalid, clear it
          removeAuthToken();
          setToken(null);
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await authAPI.login(email, password);
      
      // The authAPI.login already saves to localStorage, so get from there
      const storedToken = getAuthToken();
      const storedUser = authAPI.getCurrentUser();
      
      if (storedToken) {
        setToken(storedToken);
      }
      
      if (storedUser) {
        setUser(storedUser);
      }
      
      // Clear error on success
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await authAPI.register(name, email, password);
      
      // The authAPI.register already saves to localStorage, so get from there
      const storedToken = getAuthToken();
      const storedUser = authAPI.getCurrentUser();
      
      if (storedToken) {
        setToken(storedToken);
      }
      
      if (storedUser) {
        setUser(storedUser);
      }
      
      // Clear error on success
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    removeAuthToken();
    setToken(null);
    setUser(null);
    setError(null);  // Clear error on logout
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    if (import.meta.env.DEV) {
      console.error('useAuth called outside AuthProvider. Falling back to unauthenticated state.');
    }
    return fallbackAuthContext;
  }
  return context;
};
