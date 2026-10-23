# Vaialesk

MVP de movilidad urbana para iOS y Android con React Native, Expo SDK 57, Auth0, Node.js y Supabase. Pasajeros y conductores se autentican con Google o Microsoft a través de Auth0. El único medio de pago implementado es efectivo.

## Requisitos

- Node.js 20 o superior.
- Una aplicación **Native** en Auth0, con Google y Microsoft configurados como conexiones habilitadas.
- Un proyecto Supabase y un API Auth0 (audience) configurado.
- EAS CLI para crear el build de desarrollo, o Android Studio/Xcode para un build local.

`react-native-auth0` requiere código nativo y **no funciona con Expo Go**. Instala el build de desarrollo generado abajo en el dispositivo para probar login y callbacks. `npm start` inicia Metro en modo development client para que el QR no abra Expo Go.

## Configurar Auth0

1. Crea una aplicación Auth0 de tipo Native. Configura las conexiones de Google y Microsoft y habilítalas para esta aplicación.
2. Crea un API en Auth0, activa la opción **Allow Offline Access** y habilita refresh token rotation en la aplicación Native. Usa como identifier/audience exactamente la misma cadena para `EXPO_PUBLIC_AUTH0_AUDIENCE` y `AUTH0_AUDIENCE`.
3. Configura estos valores en `apps/vaialesk/.env`:

   ```env
   EXPO_PUBLIC_API_URL=http://IP_DE_TU_COMPUTADOR:3000
   EXPO_PUBLIC_AUTH0_DOMAIN=tu-tenant.us.auth0.com
   EXPO_PUBLIC_AUTH0_CLIENT_ID=client_id_de_la_aplicacion_native
   EXPO_PUBLIC_AUTH0_AUDIENCE=https://api-vaialesk
   EXPO_PUBLIC_AUTH0_GOOGLE_CONNECTION=google-oauth2
   EXPO_PUBLIC_AUTH0_MICROSOFT_CONNECTION=windowslive
   EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_publishable_o_anon_key
   GOOGLE_MAPS_API_KEY=
   ```

   Ajusta el nombre de conexión de Microsoft si tu tenant usa otro (por ejemplo, una conexión de Azure AD/Entra ID).
4. En Auth0, añade estos **Allowed Callback URLs** y **Allowed Logout URLs**, sustituyendo `DOMAIN` por tu dominio:

   ```text
   vaialesk://DOMAIN/ios/com.vaialesk.mobile/callback
   vaialesk://DOMAIN/android/com.vaialesk.mobile/callback
   ```

5. Configura una Action `Login / Post Login` para poner `role: authenticated` en el **ID token**. El código en `auth0/supabase-role-action.js` también añade nombre y email namespaced al access token de la API. Publícala y añádela al flujo de login. Supabase usa el ID token para Realtime.
6. En Supabase, habilita la integración de Auth0 en **Authentication → Third-Party Auth**. Indica el tenant/region. Ejecuta `supabase/schema.sql` en una base nueva; si ya ejecutaste el esquema anterior, aplica `supabase/migrations/20261012000000_auth0_auth.sql` en su lugar.

   Si migras perfiles existentes, antes de que sus usuarios inicien sesión con Auth0, vincula cada perfil con el `sub` exacto de Auth0. La migración asigna valores temporales `legacy-supabase|...` y no puede asociar identidades automáticamente. Consulta esos perfiles y reemplaza el valor usando el ID de perfil correspondiente:

   ```sql
   select id, full_name, auth0_sub
   from public.profiles
   where auth0_sub like 'legacy-supabase|%';

   update public.profiles
   set auth0_sub = 'google-oauth2|IDENTIFICADOR'
   where id = 'UUID_DEL_PERFIL';
   ```

   Si un usuario inicia sesión antes de vincular su perfil, el API creará un perfil nuevo de pasajero para su identidad Auth0.

## Configurar el API

1. Copia `server/.env.example` a `server/.env`:

   ```env
   PORT=3000
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=clave_service_role_solo_del_servidor
   AUTH0_DOMAIN=tu-tenant.us.auth0.com
   AUTH0_AUDIENCE=https://api-vaialesk
   ```

2. Inicia el API con `npm run api`; verifica `GET /health`.
3. En un teléfono físico, usa la IP local del computador en `EXPO_PUBLIC_API_URL`, no `localhost`.

El API valida firma, issuer y audience del access token de Auth0. `SUPABASE_SERVICE_ROLE_KEY` es solo del servidor: nunca la pongas en `.env` de Expo ni la publiques.

## Probar en Android

Desde esta carpeta:

```bash
npm install
npm run api
```

En otra terminal crea el cliente nativo de desarrollo:

```bash
npx eas-cli build --profile development --platform android
```

Antes del build en la nube, crea en EAS un entorno `development` para el proyecto y carga las variables `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, `EXPO_PUBLIC_AUTH0_AUDIENCE`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Son valores del cliente; **no cargues** `SUPABASE_SERVICE_ROLE_KEY` en EAS ni en Expo.

Instala el APK entregado por EAS. Con el dispositivo en la misma red que el API, inicia Metro con `npm start` y abre Vaialesk desde el development build, no desde Expo Go. Para compilar localmente con Android Studio usa `npx expo run:android`.

## Roles y pagos

- Todo usuario Auth0 nuevo recibe un perfil de pasajero.
- El usuario puede solicitar perfil de conductor; el conductor no recibe viajes hasta que administración lo apruebe.
- El rol `admin` solo se asigna desde un proceso de confianza en Supabase. Para un perfil existente, identifica su `auth0_sub` en la base y ejecuta una actualización administrativa, por ejemplo:

  ```sql
  update public.profiles
  set role = 'admin'
  where auth0_sub = 'google-oauth2|IDENTIFICADOR';
  ```

- El API rechaza cualquier método de pago distinto a `cash`; no hay cobros digitales.

El SOS, la navegación giro a giro, carga de documentos y cálculo de tarifas todavía requieren integraciones antes de producción.
