# VAI

Aplicación de taxi para Santo Domingo: usuario, conductor, administración y despacho.
Versión de prueba 1.4.0 (Android 7), español y DOP. Android/iOS con Expo; panel web y API Express. Acceso social con Supabase Auth: Google, Microsoft y Apple, sin cliente Auth0.

## Probar

Instalar el APK de perfil preview y elegir Probar como usuario/conductor/administrador.
La presentación usa datos ficticios guardados localmente y mapas reales con Internet.
No requiere servidor, login ni Wi-Fi compartido. No produce viajes ni cobros reales.

`npm ci` · `npm test` · `npm --prefix server ci` · `npm --prefix server test`.
No utilizar Expo Go para login: el callback OAuth necesita el esquema del APK instalado.

## Documentación

- [Alcance frente a la propuesta y dependencias pendientes](docs/scope-review.md)
- [Guía, permisos, arquitectura, instalación y operación](docs/operations.md)
- Variables públicas: .env.example; privadas: server/.env.example.
- Compilación Android: `eas build --platform android --profile preview`.
- Panel: `npx expo export --platform web` y publicar salida en HTTPS.
- API: `npm --prefix server start`; Dockerfile y referencia server/render.yaml.

## Arquitectura y límites

`shared/operations.cjs` contiene reglas comunes: tarifas, vencimientos, habilitación, ledger,
reservas, incidentes, permisos y trazabilidad. UI: MobilityApp, OperationsPanel, TripControls
y RideNavigation. Móvil y panel usan Supabase Auth con OAuth PKCE S256. La demo tiene
su motor local separado del API. El servidor recalcula la tarifa y verifica cada operación.
Perfiles/viajes/calificaciones se guardan en Supabase; metadatos operativos se guardan con
escrituras atómicas en un volumen privado; fotografías en bucket Supabase privado. Auditoría
HMAC y respaldos AES-GCM son configurables. La instancia piloto serializa las mutaciones.
Antes de escalar, migrar operación/ledger/locks a transacciones y restricciones de base.

Mapas Leaflet/OpenStreetMap, búsqueda Nominatim por botón y rutas OSRM con alternativa
aproximada identificada. El piloto debe contratar/configurar capacidad y políticas del
proveedor de mapas; no se da por suficiente el servicio público para una operación masiva.
Ubicación solo de primer plano; la app detiene el seguimiento al pasar a segundo plano.

Solo efectivo. AZUL/CardNET sin contratar, push/entrega SOS, alojamiento público, iOS/tiendas,
textos legales, respaldos y monitoreo activos requieren configuración y aceptación externa.
No se declara completado el MVP contractual mientras sigan esos pendientes.

Se mantienen slug, identificadores Android/iOS y callback `vaialesk` por compatibilidad con
instalaciones existentes; el nombre visible y el icono son VAI.

## Experiencia ligera 1.3

Casa/Trabajo, repetición de rutas con tarifa actual, preferencias y referencia de recogida, y ahorro de datos en Cuenta. Sin nuevas dependencias. Ver [decisiones, límites y mediciones](docs/lightweight-experience.md).

## Versión y diagnóstico de conexión (1.3.2)

La versión se muestra debajo del nombre VAI al abrir la aplicación y en la cabecera de cada rol. Android 1.3.2 corresponde a la compilación 6. La versión del API es independiente.

En Entrar con mi cuenta y en el error de carga del espacio conectado, Comprobar conexión consulta /health/ready sin enviar credenciales. Distingue red inaccesible, dirección incorrecta y servidor/base de datos no listos. El servidor de prueba sigue en http://192.168.68.104:3000 y necesita estar encendido y accesible desde la red del teléfono; compartir Wi-Fi no garantiza acceso si hay aislamiento o VPN.

## Acceso social 1.4.0

[Configuración de proveedores, migración segura, pruebas y límites](docs/social-auth.md).
Google/Microsoft requieren credenciales propias en Supabase. Apple requiere Apple Developer.
No se declara operativo el acceso real hasta configurar y probar los proveedores y el API.
