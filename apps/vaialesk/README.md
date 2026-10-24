# Vaialesk 1.1 — MVP de movilidad

App Android/iOS con React Native y Expo SDK 57. Incluye mapas interactivos, rutas por calles, viajes en efectivo, experiencia de pasajero y conductor, y panel de administración dentro de la misma app.

## Presentación para una persona, desde cualquier red

Instala el APK `preview` y abre **Probar la presentación**. Esta opción no depende del computador, del API ni de una cuenta de Auth0. El progreso se guarda en el teléfono con AsyncStorage; los mapas, la búsqueda de direcciones y el cálculo de rutas requieren Internet.

1. En **Pasajero**, elige origen y destino: busca una dirección incluyendo la ciudad, usa los lugares sugeridos, selecciona un punto en el mapa o utiliza tu ubicación como origen.
2. Revisa distancia, tiempo y tarifa estimada en COP. Pulsa **Pedir viaje**.
3. En **Administración**, pulsa **Aprobar conductor** para el perfil de prueba.
4. En **Conductor**, pulsa **Conectarme** y luego **Aceptar viaje**.
5. Prueba **Simular llegada al origen**, después **Pasajero a bordo · Iniciar viaje**.
6. Usa **Simular avance en el mapa** y **Llegamos · Finalizar viaje**.
7. Vuelve a **Pasajero**, califica con estrellas y revisa **Historial**.
8. En **Administración**, comprueba los indicadores, conductores, viajes y cancelaciones. Puedes ver un viaje en el mapa desde el historial.

Las tres vistas comparten los mismos viajes de prueba en ese teléfono. No se crean viajes reales ni se cobran pagos. La ubicación simulada está identificada en el mapa. Para repetir desde cero: **Cuenta → Reiniciar presentación**; requiere confirmación y solo borra los datos locales de la presentación.

## Modo conectado

**Entrar con mi cuenta** conserva Google y Microsoft mediante Auth0. Los datos de presentación están separados de los usuarios y viajes del servidor.

- Pasajero: origen/destino elegibles, ruta y estimación, solicitud, cancelación durante la búsqueda o el viaje, conductor asignado, historial y calificación.
- Conductor: nombre, vehículo y placa; solicitud de aprobación; conexión/desconexión; aceptación; ubicación de primer plano con permiso; inicio y finalización del viaje. Un conductor aprobado puede volver al modo pasajero cuando no tiene un viaje activo.
- Administración: indicadores de actividad reciente, revisión/aprobación/rechazo de conductores, vehículos, usuarios, viajes, mapa y cancelación administrativa. Solo las cuentas con rol `admin` tienen acceso.

El cliente consulta el API cada 3 segundos. Los perfiles, viajes y calificaciones se guardan en Supabase. El API conserva metadatos de vehículos, ubicación y rutas en `server/.data/operations.json` mediante escrituras atómicas; ese directorio no se publica en Git. Presérvalo al mover el servidor. El historial conectado muestra los 100 viajes más recientes del ámbito autorizado.

## Configurar y ejecutar

Requiere Node.js 20 o superior. Desde esta carpeta:

```bash
npm ci
npm --prefix server ci
```

Copia `.env.example` a `.env` y completa los valores públicos del cliente:

```env
EXPO_PUBLIC_API_URL=http://IP_DEL_COMPUTADOR:3000
EXPO_PUBLIC_AUTH0_DOMAIN=tu-tenant.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=client_id_native
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api-vaialesk
EXPO_PUBLIC_AUTH0_GOOGLE_CONNECTION=google-oauth2
EXPO_PUBLIC_AUTH0_MICROSOFT_CONNECTION=windowslive
```

En `server/.env`, configura los valores de `server/.env.example`. La clave `SUPABASE_SERVICE_ROLE_KEY` solo pertenece al servidor. Nunca la incluyas en Expo, EAS, el APK ni Git.

```bash
npm run api
```

Verifica `GET /health`. En una red local, utiliza la IP del computador; `localhost` en Android apunta al teléfono. Para usar el modo conectado desde otra red se necesita publicar el API en un servidor HTTPS accesible. **La presentación autónoma no necesita ese despliegue.**

### Auth0 y Supabase

1. Usa una aplicación Auth0 de tipo **Native** con las conexiones Google/Microsoft habilitadas.
2. Crea el API con Identifier/audience `https://api-vaialesk` y firma RS256. El audience debe coincidir exactamente en cliente y servidor.
3. En **Applications → APIs → Vaialesk API → Application Access**, busca el Client ID de la aplicación Native y pulsa **Edit → User-delegated Access → Grant Access**. Debe aparecer un **Grant ID** y **Revoke Access**. La política **Per-app authorization** requiere este permiso incluso si las conexiones de Google/Microsoft ya están habilitadas.
4. Habilita **Allow Offline Access** en el API y refresh token rotation en la aplicación para renovar sesiones.
5. En **Allowed Callback URLs** y **Allowed Logout URLs** de la aplicación Native registra, sustituyendo `DOMAIN`:

   ```text
   vaialesk://DOMAIN/android/com.vaialesk.mobile/callback
   vaialesk://DOMAIN/ios/com.vaialesk.mobile/callback
   ```

6. Conserva la Action Post Login `auth0/supabase-role-action.js` del proyecto, que aporta nombre y email namespaced al token. Ejecuta `supabase/schema.sql` en una base nueva; en bases existentes conserva las migraciones y los datos.
7. Para una cuenta administrativa existente, asigna el rol desde un proceso de confianza en Supabase:

   ```sql
   update public.profiles set role = 'admin'
   where auth0_sub = 'SUB_EXACTO_DE_LA_CUENTA_AUTH0';
   ```

   También puedes configurar `ADMIN_AUTH0_SUBS` en el servidor con una lista de subjects exactos separados por comas. Solo se promocionan esas identidades verificadas por Auth0. El cliente no puede otorgarse el rol `admin`. El panel de la presentación administra únicamente datos locales de prueba.

La API valida firma, issuer y audience, y limita los datos visibles a sus participantes y administradores. La aceptación de viajes usa una actualización condicional; las solicitudes y aceptaciones por identidad se serializan dentro del proceso del API. Para operar varias instancias deben añadirse también restricciones de viaje activo en la base de datos.

## Mapas y ubicación

No se necesita una clave de Google Maps. Se usan Leaflet 1.9.4 y tiles de OpenStreetMap con atribución visible, sin descarga masiva ni modo offline. La búsqueda Nominatim se ejecuta solo al pulsar **Buscar dirección**, con caché y separación entre solicitudes; no hay autocompletado por pulsación. Las rutas se calculan con OSRM y, si el servicio no responde, se muestra explícitamente una estimación aproximada.

- [Política de tiles de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- [Política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
- [API de OSRM](https://project-osrm.org/docs/v26.6.1/http)

La presentación mueve el marcador únicamente al pulsar los controles de simulación. El modo conectado comparte GPS solo con permiso de primer plano, como conductor conectado y con un viaje asignado; detiene la captura al salir del modo o terminar el viaje. No implementa navegación giro a giro ni seguimiento en segundo plano.

## Generar APK

```bash
npx eas-cli build --profile preview --platform android
```

El perfil `preview` genera un APK firmado con JavaScript incluido, sin Metro. El entorno EAS `development` debe tener las variables públicas para el modo conectado. `react-native-auth0` requiere el APK y no funciona con Expo Go. Reinstala el APK al cambiar módulos nativos, dominio Auth0 o configuración de red.

En `preview` y `development`, el plugin `with-android-test-api` permite HTTP únicamente al host del API configurado. El resto de hosts exige HTTPS y la excepción no se activa en `production`.

## Verificación

```bash
npm test
npm --prefix server test
npx expo export --platform android
```

Las pruebas cubren el recorrido completo de presentación y API, permisos, aprobación de conductores, coordenadas inválidas, cancelaciones, calificaciones, duplicados, aceptación simultánea, persistencia, el arranque sin importar Auth0 en Expo Go y errores de conexión. El API requiere puertos locales disponibles para sus pruebas HTTP.
