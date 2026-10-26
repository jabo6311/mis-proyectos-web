import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { authConfigured, getAuthClient, getProviderAvailability, getCredentials } from './auth-client';
import { startLogin, completeLogin, isLoginCallback } from './auth-actions';
export default function useVaiAuth() {
  const [session, setSession] = useState(null), [loading, setLoading] = useState(authConfigured);
  const [providers, setProviders] = useState({}), [checkingProviders, setCheckingProviders] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const signing = useRef(false), mounted = useRef(true);
  const refreshProviders = useCallback(async () => {
    if (!authConfigured) return;
    setCheckingProviders(true);
    try { const value = await getProviderAvailability(); if (mounted.current) { setProviders(value); setError(''); } }
    catch { if (mounted.current) setError('No pudimos comprobar las opciones de acceso. Comprueba internet y reintenta.'); }
    finally { if (mounted.current) setCheckingProviders(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!authConfigured) return () => { mounted.current = false; };
    let subscription, links;
    async function callback(url) {
      if (!url || !isLoginCallback(url)) return;
      try { await completeLogin(url); }
      finally { if (Platform.OS === 'web') window.history.replaceState({}, document.title, '/'); }
    }
    (async () => {
      try {
        const auth = getAuthClient().auth;
        subscription = auth.onAuthStateChange((_event, value) => { if (mounted.current) setSession(value); }).data.subscription;
        if (Platform.OS !== 'web') links = Linking.addEventListener('url', ({ url }) => { callback(url).catch(() => { if (mounted.current) setError('No pudimos completar el acceso. Inicia sesión de nuevo.'); }); });
        await callback(Platform.OS === 'web' ? window.location.href : await Linking.getInitialURL());
        const result = await auth.getSession();
        if (result.error) throw result.error;
        if (mounted.current) setSession(result.data.session);
      } catch { if (mounted.current) setError('No pudimos recuperar la sesión. Vuelve a iniciar sesión.'); }
      finally { if (mounted.current) setLoading(false); }
    })();
    refreshProviders();
    return () => { mounted.current = false; subscription?.unsubscribe(); links?.remove(); };
  }, [refreshProviders]);
  async function signIn(provider) {
    if (signing.current) return;
    if (!providers[provider]) { setError('Esta opción está pendiente de configuración. Puedes usar la presentación.'); return; }
    signing.current = true; setBusy(true); setError('');
    try { await startLogin(provider); }
    catch { if (mounted.current) setError('No pudimos iniciar sesión. Comprueba internet, reintenta o elige otra cuenta.'); }
    finally { signing.current = false; if (mounted.current) setBusy(false); }
  }
  async function signOut() {
    setError('');
    try {
      const { error: failure } = await getAuthClient().auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      if (mounted.current) setSession(null);
      return true;
    } catch { if (mounted.current) setError('No pudimos cerrar la sesión. Comprueba internet y reintenta.'); return false; }
  }
  return { session, loading, error, busy, providers, checkingProviders, refreshProviders, signIn, signOut, getCredentials, configured: authConfigured };
}
