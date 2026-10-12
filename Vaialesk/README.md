# Vaialesk

MVP móvil de movilidad urbana para iOS y Android, construido con React Native y Expo SDK 57. Incluye vistas de pasajero, conductor y administración para demostrar el flujo principal del producto. El API está en Node.js/Express y Supabase gestiona autenticación, persistencia y eventos en tiempo real. Los viajes usan efectivo como único medio de pago.

## Ejecutar la app

1. Instala Node.js 20 o superior.
2. Desde esta carpeta, ejecuta `npm install`.
3. Copia `.env.example` a `.env` y configura Supabase y Google Maps.
4. Inicia Expo con `npm start`; abre el proyecto en un simulador o con Expo Go.

Sin credenciales, la app abre en modo demostración local. El mapa necesita una clave de Google Maps para mostrar cartografía en los builds nativos.

## Configurar Supabase y API

1. Crea un proyecto Supabase y ejecuta `supabase/schema.sql` en el SQL Editor.
2. Activa Email en Authentication y configura las claves públicas en `.env`.
3. Copia `server/.env.example` a `server/.env` y añade la URL, `anon key` y `service role key` del proyecto.
4. Inicia el API con `npm run api` y verifica `GET /health`.
5. Configura `EXPO_PUBLIC_API_URL` con una URL alcanzable desde el dispositivo (la IP local del equipo, no `localhost`, en un teléfono físico).

La clave `service_role` solo va en el entorno del servidor. El API valida el JWT con Supabase Auth y vuelve a comprobar los roles; nunca la incluyas en la app. Asigna los roles `driver` y `admin` desde un proceso administrativo confiable; los usuarios nuevos siempre empiezan como pasajeros. La app aún no incluye pantallas de autenticación, por eso su flujo demostrativo no crea viajes reales aunque se configure Supabase.

## Alcance MVP y siguientes integraciones

- **Pasajero:** solicitud de viaje, seguimiento en mapa, compartir código de viaje, SOS y calificación.
- **Conductor:** aprobación, aceptar solicitudes, iniciar/finalizar viaje y resumen de ganancias de muestra.
- **Administración:** revisión de conductores, viajes recientes y entrada a soporte.
- **Tiempo real:** suscripción Supabase Realtime a cambios del viaje cuando hay configuración.
- **Pagos:** efectivo; no se procesan pagos digitales.

Las pantallas muestran datos de muestra y cambios locales para poder probar el flujo sin cuentas configuradas. Para producción todavía se requiere una interfaz de autenticación, captura y almacenamiento seguro de documentos, gestión de contactos/llamadas de emergencia, navegación giro a giro, tarifas calculadas en servidor, operaciones de soporte, controles antifraude y pruebas en dispositivos. El botón SOS es un prototipo visual y no envía alertas reales.
