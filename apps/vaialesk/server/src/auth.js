const OAUTH_PROVIDERS = new Set(['google', 'azure', 'apple']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// getClaims verifies the signature via the project's cached JWKS, or calls Auth
// for legacy symmetric keys. Never authorize a decoded, unverified JWT.
export function createTokenVerifier(auth, supabaseUrl) {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  return async token => {
    const { data, error } = await auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims || !UUID.test(claims.sub || '') || claims.iss !== issuer || claims.aud !== 'authenticated' || claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() || claims.is_anonymous === true || !OAUTH_PROVIDERS.has(claims.app_metadata?.provider)) throw new Error('Invalid VAI session');
    return { sub: claims.sub, name: typeof claims.user_metadata?.full_name === 'string' ? claims.user_metadata.full_name.slice(0, 80) : typeof claims.user_metadata?.name === 'string' ? claims.user_metadata.name.slice(0, 80) : 'Pasajero' };
  };
}
