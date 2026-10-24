# VAI

Aplicación de taxi para Santo Domingo: usuario, conductor, administración y despacho.
Versión de prueba 1.2, español y DOP. Android/iOS con Expo; panel web con Auth0 SPA y API Express.

## Probar

Instalar el APK de perfil preview y elegir Probar como usuario/conductor/administrador.
La presentación usa datos ficticios guardados localmente y mapas reales con Internet.
No requiere servidor, login ni Wi-Fi compartido. No produce viajes ni cobros reales.

`npm ci` · `npm test` · `npm --prefix server ci` · `npm --prefix server test`.
No utilizar Expo Go para login: se requiere el módulo nativo Auth0 incluido en el APK.

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
y RideNavigation. App.web usa Auth0 SPA/PKCE; NativeApp mantiene Auth0 nativo. La demo tiene
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
instalaciones y Auth0 existentes; el nombre visible y el icono son VAI.
