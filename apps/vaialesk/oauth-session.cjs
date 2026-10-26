function codeExchange(auth, expected, callbackCode) {
  const exchanges = new Map();
  return url => {
    const code = callbackCode(url, expected);
    const values = new URL(url).searchParams.getAll('sb_flow_id');
    if (values.length > 1 || values.length === 1 && !/^[a-zA-Z0-9_-]{8,64}$/.test(values[0])) throw new Error('El flujo de acceso no es válido.');
    const flowId = values[0], cacheKey = `${code}:${flowId || ''}`;
    if (!exchanges.has(cacheKey)) {
      if (exchanges.size >= 32) exchanges.delete(exchanges.keys().next().value);
      exchanges.set(cacheKey, auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined).then(({ data, error }) => {
        if (error || !data?.session) throw new Error('No pudimos completar tu sesión. Vuelve a iniciar sesión.');
        return data.session;
      }));
    }
    return exchanges.get(cacheKey);
  };
}
module.exports = { codeExchange };
