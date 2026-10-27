const KEY = 'vai:api-endpoint:v1';
function normalizeApiUrl(value, {allowLocalhost=false}={}) {
  let url;
  try { url=new URL(String(value).trim()); } catch { throw Error('Escribe una dirección válida, por ejemplo https://api.tu-dominio.com.'); }
  const host=url.hostname.toLowerCase();
  const loopback=host==='localhost'||host==='127.0.0.1'||host==='[::1]';
  const parts=host.split('.').map(Number);
  const ipv4=/^\d+\.\d+\.\d+\.\d+$/.test(host)&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
  const local=ipv4&&(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168));
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol))throw Error('Usa sólo la dirección del servidor, sin usuario, contraseña ni rutas.');
  if(loopback&&!allowLocalhost)throw Error('localhost es el propio teléfono. Escribe la dirección Wi-Fi del computador o la URL HTTPS de VAI.');
  if(url.protocol==='http:'&&!local&&!(loopback&&allowLocalhost))throw Error('Fuera de la red local, el servidor debe usar HTTPS.');
  return url.origin;
}
function createEndpointStore({storage,defaultUrl,allowLocalhost=false}) {
  let snapshot={url:defaultUrl?.replace(/\/$/,''),ready:false},loading;
  const listeners=new Set();
  const publish=value=>{snapshot=value;for(const fn of listeners)fn(snapshot);};
  return {
    snapshot:()=>snapshot,
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    load(){if(!loading)loading=(async()=>{let url=snapshot.url;try{const saved=await storage.getItem(KEY);if(saved)url=normalizeApiUrl(saved,{allowLocalhost});}catch{}publish({url,ready:true});return snapshot;})();return loading;},
    async save(value,verify){await this.load();const url=normalizeApiUrl(value,{allowLocalhost});await verify(url);await storage.setItem(KEY,url);publish({url,ready:true});return url;}
  };
}
module.exports={normalizeApiUrl,createEndpointStore};
