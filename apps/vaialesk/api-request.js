// Include credentials, the network request and response parsing in one deadline.
export async function requestApi({
  apiUrl, path, getCredentials, options = {}, timeoutMs = 15000,
  fetchImpl = fetch
}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("El servidor no respondió a tiempo. Comprueba tu conexión y reintenta."));
      controller.abort();
    }, timeoutMs);
  });
  const request = async () => {
    const credentials = await getCredentials();
    if (controller.signal.aborted) return;
    let response;
    try {
      response = await fetchImpl(`${apiUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
          Authorization: `Bearer ${credentials.accessToken}`
        }
      });
    } catch {
      throw new Error("No se pudo conectar al API. Comprueba que esté encendido y que la URL sea accesible desde el teléfono; localhost apunta al propio teléfono.");
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`El API devolvió una respuesta inválida (HTTP ${response.status}). Revisa su URL y el servidor.`);
    }
    if (!response.ok) {
      throw new Error(body?.error || `No se pudo completar la solicitud (HTTP ${response.status}).`);
    }
    if (path === "/api/me" && (!body?.profile?.id || !["passenger", "driver", "admin", "dispatcher"].includes(body.profile.role))) {
      throw new Error("El API no devolvió un perfil válido. Revisa la configuración del servidor y reintenta.");
    }
    return body;
  };
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Public readiness check: no session credentials, tokens or automatic login retry.
export function apiDescription(apiUrl) {
  try { return new URL(apiUrl).origin; } catch { return "Servidor sin configurar"; }
}
export async function checkApi({ apiUrl, fetchImpl = fetch, timeoutMs = 8000 }) {
  let url;
  try { url = new URL(apiUrl); } catch { throw new Error("Esta instalación no tiene un servidor válido configurado."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("La dirección del servidor no es válida.");
  const controller = new AbortController(); let timer;
  const deadline = new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("El servidor no respondió. Comprueba que el computador esté encendido y abre la dirección mostrada seguida de /health/ready desde el navegador del teléfono."));},timeoutMs);});
  const request = async()=>{
    let response;
    try { response=await fetchImpl(`${apiUrl.replace(/\/$/,"")}/health/ready`,{signal:controller.signal}); }
    catch { throw new Error("El teléfono no pudo alcanzar el servidor. Prueba la dirección mostrada seguida de /health/ready en su navegador. Si tampoco abre, revisa la red de invitados, VPN y acceso del computador desde la Wi-Fi."); }
    let body;try {body=await response.json();}catch {throw new Error("La dirección respondió, pero no corresponde a un API de VAI válido.");}
    if(!response.ok || body?.status!=="ready")throw new Error("El servidor respondió, pero todavía no está listo. Revisa su conexión con la base de datos.");
    return {version:typeof body.version==="string"?body.version.slice(0,30):null};
  };
  try{return await Promise.race([request(),deadline]);}finally{clearTimeout(timer);}
}
