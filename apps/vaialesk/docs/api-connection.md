# Conexión de VAI 1.4.1 (Android 8)

El acceso social puede completarse aunque el servidor del negocio no sea accesible.
La APK anterior apuntaba a una dirección Wi-Fi fija del Mac; durante las pruebas se
observaron direcciones distintas y el teléfono no pudo abrir el API por esa red.

La actualización permite cambiar el servidor desde «Conexión con el servidor» →
«Cambiar servidor». Comprueba `/health/ready` sin enviar la sesión y exige un API
con Supabase Auth antes de guardar. Si falla la conexión o el almacenamiento, conserva
la dirección anterior. Guarda el ajuste localmente, lo recupera antes de consultar
el API y vuelve a cargar el espacio al cambiarlo sin cerrar Google.

Sólo admite URLs HTTPS o HTTP en IPv4 privadas de prueba. Rechaza contraseñas,
rutas, parámetros y fragmentos; localhost se admite únicamente en web. En perfiles
Android preview/development, la política de red permite HTTP para que un cambio de
IP local no requiera otra APK; la validación de aplicación restringe ese uso a las
redes privadas. Los perfiles production no agregan esa excepción.

El propietario autorizó un Cloudflare Quick Tunnel para la prueba. La APK de prueba
usa su URL HTTPS mediante EXPO_PUBLIC_API_URL. No se guarda una dirección efímera
como constante del código. El túnel requiere el Mac, el API y cloudflared activos;
la URL cambia al iniciar otro Quick Tunnel. En ese caso, actualizar «Cambiar servidor».
Proton VPN permanece activo. No se ha contratado alojamiento permanente.

Antes de entregar, verificar por HTTPS: `/health/ready` responde ready y auth supabase;
`/api/workspace` sin sesión y con un token falso responden 401. Una comprobación desde
el Mac no sustituye la prueba del teléfono. Mantener el despliegue permanente en
DigitalOcean como trabajo pendiente.

Pruebas: URL válida, bloqueo de HTTP público, sustitución fallida que conserva el
servidor anterior, recuperación del ajuste, error de almacenamiento, diagnóstico sin
sesión y rechazo de un API legado con Auth0. El bundle adicional es pequeño y no
introduce dependencias nuevas.
