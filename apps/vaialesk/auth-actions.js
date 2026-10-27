import * as WebBrowser from 'expo-web-browser';
import { getAuthClient } from './auth-client';
import { NATIVE_REDIRECT, callbackCode, oauthOptions } from './auth-flow.cjs';
import { codeExchange } from './oauth-session.cjs';
let exchange;
export function completeLogin(url) {
  if (!exchange) exchange = codeExchange(getAuthClient().auth, NATIVE_REDIRECT, callbackCode);
  return exchange(url);
}
export async function startLogin(provider) {
  if (typeof TextEncoder === 'undefined' || !globalThis.crypto?.subtle?.digest || !globalThis.crypto?.getRandomValues) throw new Error('El teléfono no dispone de un acceso seguro. Actualiza VAI.');
  const { data, error } = await getAuthClient().auth.signInWithOAuth(oauthOptions(provider, NATIVE_REDIRECT));
  if (error || !data?.url) throw new Error('Este proveedor no pudo abrirse. Comprueba su configuración y reintenta.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, NATIVE_REDIRECT);
  if (result.type === 'success') return completeLogin(result.url);
  if (!['cancel', 'dismiss'].includes(result.type)) throw new Error('No se completó el acceso. Inténtalo de nuevo.');
  return null;
}
export function isLoginCallback(url) { return typeof url === 'string' && url.startsWith(NATIVE_REDIRECT); }
