export const mapHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>html,body,#map{height:100%;width:100%;margin:0;background:#e9eeea;font-family:system-ui,sans-serif}#hint{position:absolute;z-index:1000;left:14px;top:12px;right:55px;pointer-events:none;background:white;border-radius:12px;padding:9px 12px;font-size:12px;color:#203d32;box-shadow:0 3px 14px #153d3315}.leaflet-control-attribution{font-size:10px!important}.pin{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px #0004}.origin{background:#197652}.destination{background:#e47856}.driver{background:#173e54;font-size:18px}</style></head><body><div id="map"></div><div id="hint">Cargando mapa…</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
function emit(data){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));else window.parent.postMessage({vaialeskMap:data},'*');}
if(!window.L){document.getElementById('hint').textContent='No se pudo abrir el mapa. Comprueba tu conexión y pulsa Recargar.';emit({type:'error'});return;}
var map=L.map('map',{zoomControl:false}).setView([4.6767,-74.0486],13), layer=L.layerGroup().addTo(map),lastFit='',count=0;
L.control.zoom({position:'topright'}).addTo(map);
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'}).addTo(map);
tiles.on('tileload',function(){count++;});
tiles.on('load',function(){if(!count)document.getElementById('hint').textContent='No cargaron los mapas. Comprueba tu conexión.';});
function point(p){return p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;}
function marker(p,kind,label){if(!point(p))return;var m=L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'',html:'<div class="pin '+kind+'" style="width:28px;height:28px">'+label+'</div>',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(layer);var text=document.createElement('span');text.textContent=p.address||label;m.bindPopup(text);}
window.setMapData=function(d){layer.clearLayers();marker(d.pickup,'origin','A');marker(d.destination,'destination','B');marker(d.driver,'driver','●');var coords=(d.coordinates||[]).filter(point).map(function(p){return[p.latitude,p.longitude];});if(coords.length>1)L.polyline(coords,{color:'#197652',weight:5,opacity:.8,dashArray:d.approximate?'8 8':null}).addTo(layer);var pts=[d.pickup,d.destination].filter(point).map(function(p){return[p.latitude,p.longitude];});var key=JSON.stringify(pts)+String(d.focusKey||'');if(lastFit!==key&&pts.length){lastFit=key;if(pts.length>1)map.fitBounds(pts,{padding:[40,65],maxZoom:15});else map.setView(pts[0],15);}document.getElementById('hint').textContent=d.hint||'A: origen · B: destino';map.invalidateSize();};
map.on('click',function(e){emit({type:'pick',latitude:e.latlng.lat,longitude:e.latlng.lng});});
window.addEventListener('message',function(e){if(e.data&&e.data.vaialeskMapData)window.setMapData(e.data.vaialeskMapData);});
emit({type:'ready'});
})();</script></body></html>`;

export function parseMapMessage(value) {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (data?.type === "ready" || data?.type === "error") return data;
    if (data?.type === "pick" && Number.isFinite(data.latitude) && Number.isFinite(data.longitude) && Math.abs(data.latitude) <= 90 && Math.abs(data.longitude) <= 180) return data;
  } catch {}
  return null;
}
