// SecureStore values have practical size limits. Publish the manifest only after
// all chunks are saved; a failed write keeps the previous session readable.
function secureSessionStorage(store) {
  let queue = Promise.resolve(), sequence = 0;
  const options = { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const serial = task => { const next = queue.catch(() => {}).then(task); queue = next; return next; };
  async function manifest(key) {
    const raw = await store.getItemAsync(key, options);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!/^[a-zA-Z0-9-]+$/.test(value.id) || !Number.isInteger(value.count) || value.count < 1 || value.count > 128) throw new Error('No pudimos recuperar la sesión guardada.');
    return value;
  }
  const part = (key, record, i) => `${key}.${record.id}.${i}`;
  async function cleanup(key, record) {
    if (record) await Promise.all(Array.from({ length: record.count }, (_, i) => store.deleteItemAsync(part(key, record, i), options).catch(() => {})));
  }
  return {
    getItem: key => serial(async () => {
      const record = await manifest(key); if (!record) return null;
      const chunks = await Promise.all(Array.from({ length: record.count }, (_, i) => store.getItemAsync(part(key, record, i), options)));
      if (chunks.some(v => v === null)) throw new Error('La sesión guardada está incompleta. Inicia sesión de nuevo.');
      return chunks.join('');
    }),
    setItem: (key, value) => serial(async () => {
      const old = await manifest(key), points = Array.from(value), chunks = [];
      for (let i = 0; i < points.length; i += 400) chunks.push(points.slice(i, i + 400).join(''));
      const count = chunks.length;
      if (!count || count > 128) throw new Error('La sesión supera el tamaño permitido.');
      const record = { id: `${Date.now()}-${++sequence}`, count };
      try {
        for (let i = 0; i < count; i++) await store.setItemAsync(part(key, record, i), chunks[i], options);
        await store.setItemAsync(key, JSON.stringify(record), options);
      } catch (error) { await cleanup(key, record); throw error; }
      await cleanup(key, old);
    }),
    removeItem: key => serial(async () => { const record = await manifest(key); await store.deleteItemAsync(key, options); await cleanup(key, record); })
  };
}
module.exports = { secureSessionStorage };
