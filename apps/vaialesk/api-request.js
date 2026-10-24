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
