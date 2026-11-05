import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, isOfflineError } from '../api';
import { loadCachedUser, saveCachedUser } from '../cache';
import { setAppBadge } from '../notifications';

const TOKEN_KEY = 'chatbox.token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) return;
        const cached = await loadCachedUser();
        if (!cancel && cached) {
          setToken(stored);
          setUser(cached);
        }
        try {
          const data = await api('/api/me', { token: stored });
          if (cancel) return;
          setToken(stored);
          setUser(data.user);
          await saveCachedUser(data.user);
        } catch (error) {
          if (cancel) return;
          if (isOfflineError(error)) {
            if (cached) {
              setToken(stored);
              setUser(cached);
            } else {
              setToken(stored);
            }
            return;
          }
          if (error?.status === 401 || error?.status === 403) {
            await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
            await saveCachedUser(null);
            setToken(null);
            setUser(null);
          } else if (cached) {
            setToken(stored);
            setUser(cached);
          }
        }
      } catch {
        // Keep whatever was restored from cache.
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const value = useMemo(() => {
    async function persist(data) {
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      await saveCachedUser(data.user);
      setToken(data.token);
      setUser(data.user);
    }

    return {
      ready,
      token,
      user,
      async login(userId, password) {
        await persist(await api('/api/auth/login', { method: 'POST', body: { userId, password } }));
      },
      async register(userId, password) {
        await persist(await api('/api/auth/register', { method: 'POST', body: { userId, password } }));
      },
      async saveName(displayName) {
        const data = await api('/api/me', { token, method: 'PATCH', body: { displayName } });
        await saveCachedUser(data.user);
        setUser(data.user);
      },
      applyUser(nextUser) {
        setUser(nextUser);
        saveCachedUser(nextUser);
      },
      async logout() {
        if (token) {
          await api('/api/me/push-token', { token, method: 'POST', body: { token: '' } }).catch(() => {});
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        await saveCachedUser(null);
        setAppBadge(0);
        setToken(null);
        setUser(null);
      },
    };
  }, [ready, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
