# Acceso social VAI 1.4.0

Android: compilación 7; mismo paquete `com.vaialesk.mobile` y esquema `vaialesk`.
El móvil y el panel usan OAuth con Google, Microsoft y Apple mediante Supabase Auth.
No existe dependencia ejecutable de Auth0. Supabase gestiona las sesiones; no es una
implementación OAuth propia. Su plan gratuito tiene cuotas y condiciones, no uso ilimitado.

## Estado de entrega

El código y las exportaciones Android/web están preparados. El 26 de octubre de 2026 se aplicó al proyecto remoto la migración `20261026161219_supabase_social_auth.sql`. Se verificó por conteos y checksum que permanecen intactos los dos perfiles y el viaje existentes; la vinculación de identidades sociales sigue pendiente del primer acceso verificado. En el proyecto actual,
Google ya está habilitado con un cliente OAuth propio de VAI y verificado en `/auth/v1/settings`. Su audiencia sigue restringida a la organización hasta autorizar las pruebas externas. Azure/Microsoft y Apple siguen desactivados. Los retornos a la aplicación y la prueba de sesión real siguen pendientes.
Los botones consultan esta configuración al entrar y permiten actualizarla. Una opción
pendiente no abre un navegador que termine en un error. La demo sigue funcionando.
Los proveedores requieren credenciales propias: las credenciales de desarrollo compartidas
por Auth0 no se pueden trasladar como si fueran de VAI. Apple Developer aún no está contratado.
La disponibilidad del botón confirma configuración habilitada, no sustituye la prueba real.

No hay servidor HTTPS público publicado. La configuración de prueba conserva
`http://192.168.68.104:3000`; no funciona desde otra red. No desactivar Proton VPN.
Para usar DigitalOcean hay que publicar el API con el esquema ya migrado y volver a compilar
con su dirección HTTPS. El APK 1.3.2 no es compatible con el API 1.4: aún usa tokens Auth0.

## Configurar el proyecto Supabase

Proyecto existente: `tghmeiipujlsjzaobkbg`. Las claves de proveedores se introducen
únicamente en el panel de Supabase; jamás en archivos EXPO_PUBLIC, el repositorio o el chat.
El cliente sólo lleva URL y clave pública anon/publishable. El servidor conserva service_role.

1. Authentication → URL Configuration: registrar exactamente `vaialesk://auth/callback`.
2. Registrar también `https://panel.TU-DOMINIO/` como redirect web y Site URL cuando exista.
   Para revisión local puede autorizarse explícitamente `http://localhost:8788/`;
   no usar comodines globales en producción.
3. Google Cloud: crear un cliente OAuth tipo Web, configurar consentimiento y usuarios
   de prueba si la aplicación está en modo Testing. Registrar como redirect del proveedor:
   `https://tghmeiipujlsjzaobkbg.supabase.co/auth/v1/callback`.
   Añadir Client ID y Secret en Authentication → Sign In / Providers → Google y habilitar.
4. Microsoft Entra: registrar una aplicación con el alcance de cuentas que se vaya a admitir
   (por ejemplo, cuentas de organizaciones y personales), redirect Web igual al anterior.
   Registrar ID y secreto en Azure (Microsoft) de Supabase, configurar tenant consistente
   con el tipo de cuenta y las claims opcionales `email` y `xms_edov`. VAI solicita `email`.
5. Apple: requiere Apple Developer, App ID con Sign in with Apple, Services ID, Team ID,
   Key ID y clave de firma. Registrar el dominio Supabase y el mismo callback HTTPS.
   El secreto web Apple debe renovarse antes de caducar (como máximo, seis meses).
   Esta entrega usa OAuth en navegador para Android y web. La prueba/publicación de iOS
   y una experiencia nativa Apple en iOS requieren una entrega adicional específica.
6. Volver a VAI → Entrar con mi cuenta → Actualizar opciones de acceso.

## Migración sin borrar viajes

Hacer un respaldo de SQL, JSON operativo y documentos privados antes del cambio.
La migración `supabase/migrations/20261026161219_supabase_social_auth.sql` ya está aplicada en el proyecto actual y registrada por Supabase. Para otro entorno, aplicarla antes del API 1.4. No volver a ejecutar migraciones históricas de Auth0 indiscriminadamente sobre el entorno actualizado.
Agrega `profiles.supabase_user_id` con UUID de Auth y unicidad; conserva `profiles.id`,
`auth0_sub` histórico, roles, conductores, viajes y las referencias del archivo operativo.
Las políticas RLS pasan a la identidad Supabase. La columna histórica no autentica usuarios.

No se enlazan cuentas por correo, nombre, una claim editable ni una elección del cliente.
Para cada cuenta existente, el operador debe comprobar la titularidad y enlazar los UUID.
Crear/confirmar primero la identidad social en Supabase sin entrar todavía al espacio del API.
La función siguiente sólo admite ejecución desde SQL privilegiado/service_role:

```sql
select public.link_vai_identity('UUID-DEL-PERFIL-VAI', 'UUID-DEL-USUARIO-SUPABASE');
```

La función falla si la identidad ya tiene otro perfil o el perfil está enlazado a otra
cuenta. No borrar el segundo perfil ni fusionar saldos automáticamente: reconciliarlo
manualmente si el usuario ya entró al API y se creó uno nuevo.
Esto conserva historial/roles y las claves `operations.staff`, ledger, documentos y preferencias.
Se mantiene el UUID de perfil usado por favoritos locales; no se copia la antigua sesión Auth0.

Configurar `ADMIN_SUPABASE_USER_IDS` sólo con UUID exactos de administradores verificados.
No reutilizar `ADMIN_AUTH0_SUBS`; no conceder administración por correo ni user_metadata.
Un nuevo usuario social recibe rol pasajero. Un conductor continúa sujeto a aprobación.

Actualizar API y panel/APK juntos. El servidor comprueba el esquema antes de abrir el puerto;
`/health/ready` debe devolver `version: 1.4.0`, `auth: supabase`, `status: ready`.
No cambiar la suscripción ni borrar el tenant Auth0 automáticamente. Una vez probados todos
los accesos y perfiles, el propietario puede resolver su suscripción de Auth0 desde su cuenta.

## Sesión, seguridad y ligereza

PKCE S256 con aleatoriedad y SHA-256 nativos de Expo; se rechaza un enlace con tokens
implícitos o destino distinto. El callback web es la raíz HTTPS, el nativo es el anterior.
Los callbacks duplicados del navegador/Linking sólo canjean una vez el mismo código y flow ID.
El cliente de Auth se importa solo: no se empaquetan los módulos Supabase de base de datos,
Storage ni Realtime en el móvil. El backend sigue usando su SDK de servidor.

Android/iOS: sesión y verificadores fragmentados en SecureStore; cada fragmento respeta
límites de tamaño y conserva caracteres Unicode. Escritura atómica del manifiesto,
serialización de renovaciones y borrado al cerrar sesión. En web se usa sessionStorage por
pestaña, no persistencia indefinida en localStorage. No se guardan contraseñas de proveedores.
Renovación automática sólo en primer plano; los datos de demo/favoritos siguen en AsyncStorage.

El API usa getClaims: firma verificada con JWKS y caché para claves asimétricas; la librería
consulta Auth para claves simétricas antiguas. Comprueba issuer, audience authenticated,
caducidad, UUID, rol authenticated y proveedor social permitido; ignora user_metadata para roles.
El cierre de sesión revoca el refresh token local. Un access token emitido puede seguir
siendo válido hasta su vencimiento: configurar una duración razonable en Supabase.

## Prueba de aceptación real, pendiente de completar configuración

1. Abrir VAI y comprobar 1.4.0 · compilación 7. Probar los cuatro roles de demo.
2. Configurar proveedor, volver a actualizar opciones. Cancelar el navegador: debe poder reintentar.
3. Entrar con Google y Microsoft; Apple después de configurar su cuenta. Comprobar regreso
   al APK sin pantalla blanca, cerrar/abrir VAI y verificar restauración de sesión.
4. Entrar a un perfil migrado: mismo UUID, historial, saldo, documentos y rol.
5. Cuenta nueva: pasajero; intentar acceso administrativo debe fallar.
6. Crear viaje, aprobar conductor/documentos, aceptar con una segunda cuenta autorizada,
   llegar, validar PIN, completar y calificar. Un mismo usuario no se acepta su propio viaje.
7. Cerrar sesión: API inaccesible sin token. Revocar acceso del proveedor y comprobar renovación.
8. Publicar API/panel HTTPS y repetir desde datos móviles/otra red antes de enviarlo al hermano.

Pruebas automatizadas: `npm test` y `npm --prefix server test`.
Las pruebas con JWT firmado y SDK real no sustituyen una sesión real con cada proveedor.

## Referencias oficiales

- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/social-sign-in/auth-azure
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/pricing
- https://docs.expo.dev/build-reference/local-builds/
