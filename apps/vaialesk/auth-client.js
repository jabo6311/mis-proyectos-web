import 'react-native-url-polyfill/auto';
import './native-oauth-crypto';
import { GoTrueClient } from '@supabase/auth-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { secureSessionStorage } from './secure-session-storage.cjs';
import { publicConfig } from './auth-flow.cjs';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
let client, subscription;
export const authConfigured = publicConfig(url, key);
export function getAuthClient() {
  if (!authConfigured) throw new Error('El acceso con cuentas todavía no está configurado en esta instalación. Puedes usar la presentación.');
  if (!client) {
    client = { auth: new GoTrueClient({ url: `${url.replace(/\/$/, '')}/auth/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` }, flowType: 'pkce', storageKey: 'vai.auth.v1', storage: secureSessionStorage(SecureStore), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, fetch: authFetch }) };
    const refresh = state => state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    subscription = AppState.addEventListener('change', refresh);
  }
  return client;
}
export async function authFetch(input, init = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
}
export async function getCredentials() {
  const { data, error } = await getAuthClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Tu sesión terminó. Sal e inicia sesión de nuevo.');
  return { accessToken: data.session.access_token };
}
export async function getProviderAvailability() {
  if (!authConfigured) return {};
  const response = await authFetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: key } });
  if (!response.ok) throw new Error('No pudimos comprobar las opciones de acceso. Reintenta.');
  const settings = await response.json();
  return settings.external || {};
}
