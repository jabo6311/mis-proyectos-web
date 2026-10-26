// Shared OAuth policy. PKCE exchanges an authorization code; never accept tokens
// pasted into a URL, an arbitrary redirect, or a provider-supplied app role.
const PROVIDERS = [
  { id: 'google', name: 'Google' },
  { id: 'azure', name: 'Microsoft', scopes: 'email' },
  { id: 'apple', name: 'Apple' }
];
const NATIVE_REDIRECT = 'vaialesk://auth/callback';
function callbackCode(value, expected) {
  const url = new URL(value), target = new URL(expected);
  if (url.protocol !== target.protocol || url.host !== target.host || url.pathname !== target.pathname || url.username || url.password || url.hash) throw new Error('El enlace de acceso no corresponde a VAI. Inicia sesión de nuevo.');
  if (url.searchParams.has('error')) throw new Error('El proveedor no completó el acceso. Puedes reintentarlo o elegir otra cuenta.');
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) throw new Error('El acceso no devolvió un código válido. Vuelve a iniciar sesión.');
  return codes[0];
}
function oauthOptions(id, redirectTo) {
  const provider = PROVIDERS.find(p => p.id === id);
  if (!provider) throw new Error('Proveedor de acceso no disponible.');
  return { provider: id, options: { redirectTo, skipBrowserRedirect: true, ...(provider.scopes ? { scopes: provider.scopes } : {}) } };
}
function publicConfig(url, key) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && typeof key === 'string' && key.length > 20 && !key.startsWith('sb_secret_');
  } catch { return false; }
}
module.exports = { PROVIDERS, NATIVE_REDIRECT, callbackCode, oauthOptions, publicConfig };
