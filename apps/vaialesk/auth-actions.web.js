import { getAuthClient } from './auth-client';
import { callbackCode, oauthOptions } from './auth-flow.cjs';
import { codeExchange } from './oauth-session.cjs';
let exchange;
const redirect = () => `${window.location.origin}/`;
export function completeLogin(url) {
  if (!exchange) exchange = codeExchange(getAuthClient().auth, redirect(), callbackCode);
  return exchange(url);
}
export async function startLogin(provider) {
  const { data, error } = await getAuthClient().auth.signInWithOAuth(oauthOptions(provider, redirect()));
  if (error || !data?.url) throw new Error('Este proveedor no pudo abrirse. Comprueba su configuración y reintenta.');
  window.location.assign(data.url);
}
export function isLoginCallback(url) {
  const value = new URL(url);
  return value.origin === window.location.origin && value.pathname === '/' && (value.searchParams.has('code') || value.searchParams.has('error'));
}
