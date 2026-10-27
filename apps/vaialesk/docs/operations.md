> Actualización 1.4.0: el acceso Auth0 descrito históricamente en este documento fue sustituido por Supabase Auth. La configuración vigente está en [social-auth.md](social-auth.md).

# Operar VAI en pruebas

## Presentación en un teléfono

Instalar el APK 1.2 como actualización. El nombre y el icono muestran VAI; la identidad técnica
Android/Auth0 anterior se conserva para actualizar sin romper el acceso existente.

1. Inicio → Probar como usuario. Elegir origen/destino de Santo Domingo y pedir viaje.
2. Administrador → aprobar a Andrés. Operación → Documentos → aprobar las cuatro muestras.
3. Conductor → Conectarme → Aceptar viaje → Voy en camino → Confirmar llegada al origen.
4. Usuario → consultar PIN. Conductor → introducir PIN → Verificar PIN e iniciar viaje.
5. Navegar dentro de VAI muestra ruta y maniobras; las posiciones de la presentación son
   simuladas y se identifican. Se puede usar Simular avance en el mapa.
6. Finalizar viaje. Billetera muestra efectivo cobrado, comisión descontada y ganancias.
7. Usuario → calificar y escribir reseña; Historial → compartir comprobante digital no fiscal.
8. Para probar reservas: Reservas, fecha futura en hora dominicana (AAAA-MM-DD HH:MM), guardar;
   Despacho → Operación → reserva → Despachar ahora. En API, el programador activa las vencidas.
9. Billetera → solicitar recarga; Administrador → Operación → Billetera → verificar y aprobar.
10. SOS de prueba se consulta en Administrador/Despacho → Operación → Incidencias. No llama
    al 911 ni envía automáticamente mensajes a los contactos sin proveedor configurado.

El saldo inicial RD$1.000, conductor y documentos de muestra son ficticios. La presentación
1.2 usa un almacenamiento nuevo para no mezclar los viajes antiguos en COP con los de DOP.
La presentación anterior no se borra. Reiniciar presentación elimina solo los datos nuevos locales.
Mapas/rutas/búsqueda requieren Internet. Presentación no necesita API, cuenta o mismo Wi-Fi.

## Permisos

| Rol verificado | Puede | No puede |
| --- | --- | --- |
| Usuario | Perfil, contactos, solicitud, reserva, cancelar propios, PIN, reseña, compartir/SOS propios | Aprobar conductores, leer documentos ajenos o cambiar saldos |
| Conductor aprobado | Documentos propios, conexión si habilitado, aceptar/rechazar, GPS, navegar, ejecutar con PIN, billetera propia | Ver PIN antes de introducirlo, aceptar dos viajes, aprobar sus recargas |
| Despachador | Reservas de clientes, asignar/reasignar antes de inicio, mapa, incidencias y trazabilidad de despacho | Cambiar tarifas, dinero, documentos o administradores |
| Administrador | Revisión, reglas, reportes, billetera y habilitar despacho de cuentas existentes | Autodeclararse admin desde el teléfono |

El alta de administrador requiere un subject Auth0 exacto en ADMIN_AUTH0_SUBS o rol de base
asignado por un operador autorizado. El servidor comprueba permisos; ocultar un botón no
es el control de acceso. Los roles de presentación no otorgan acceso al servidor.

## Servidor conectado

- Instalar dependencias de server con `npm ci --prefix server`.
- Configurar el archivo privado de variables según server/.env.example. Nunca incluir .env,
  claves, operaciones.json, fotografías ni backups en Git o en el APK.
- `npm --prefix server start`; comprobar /health y /health/ready.
- En producción exigir PUBLIC_API_URL HTTPS, CORS_ORIGINS y AUDIT_SIGNING_KEY (32+ caracteres).
- Montar OPERATIONS_FILE en un volumen privado persistente. Solo una instancia por volumen.
- Perfiles/viajes/calificaciones usan Supabase; fotos usan bucket privado vai-driver-documents.
  La cuenta de servicio debe poder crear el bucket privado o un operador debe precrearlo.
- Documentos: JPEG máximo 2 MB, identificadores aleatorios, acceso solo dueño/admin y URL
  firmada de 60 s. Vencimiento pendiente/rechazado bloquea nuevas conexiones/aceptaciones.
- Para panel web crear una aplicación SPA separada en Auth0, autorizar el audience, callback,
  logout y web origins exactos del panel y configurar EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID.
  No colocar un client secret en el navegador ni reutilizar el cliente nativo como SPA.
- Exportar panel con `npx expo export --platform web`; alojar los archivos estáticos con HTTPS.
- El programador revisa reservas/asignación cada 5 s; sincronización del cliente cada 3 s.
- El ledger usa centavos enteros y comisiones idempotentes por viaje; toda corrección es otra
  entrada con motivo. Un administrador comprueba los pagos manuales antes de recargar.
- La tarifa/comisión de un viaje quedan fijadas; cambios de reglas aplican a nuevos viajes.

## Notificaciones y SOS

En EAS configurar FCM v1 para Android y APNs para iOS. El usuario activa avisos desde Perfil.
La cola persiste, reintenta con espera creciente y registra ticket de aceptación de Expo;
la entrega al teléfono debe comprobarse con los recibos/servicio en pruebas de integración.
El panel abierto actualiza incidencias sin depender de push. Para contactos configurar un
receptor HTTPS mediante SOS_WEBHOOK_URL y SOS_WEBHOOK_SECRET. Verificar X-VAI-Signature
(HMAC SHA256 del cuerpo) e Idempotency-Key antes de procesar; el receptor debe ser idempotente.
No configurar un webhook sin autorización para enviar allí esos contactos y ubicaciones.

## Respaldos y recuperación

Configurar BACKUP_DIR en almacenamiento privado y BACKUP_ENCRYPTION_KEY (64 caracteres
hexadecimales aleatorios), guardada aparte del respaldo. Con ambas variables el proceso
hace un respaldo diario; también `npm --prefix server run backup`. La exportación incluye
perfiles/viajes/calificaciones y estado operativo; las fotografías requieren respaldo aparte.
`node server/scripts/inspect-backup.js archivo.backup` comprueba descifrado y estructura sin
imprimir registros personales. Conservar la clave del auditor separadamente del volumen.

Para restaurar: detener escrituras, verificar/descifrar el respaldo en un entorno privado,
restaurar tablas respetando claves foráneas y operaciones.json completo, restaurar Storage,
volver a configurar las claves originales, iniciar una sola instancia y verificar saldos,
conteos, auditoría, fotos y un ciclo de prueba. No cargar un respaldo sobre producción sin
revisión del operador y plan de reversión. Falta ensayar esta restauración integral.

## Despliegue y operación

Dockerfile en la raíz de la app y server/render.yaml son referencias sin activar servicios
ni asumir suscripciones. Separar Supabase/Auth0/EAS/variables entre pruebas y producción.
Healthcheck de proceso: /health; comprobación de base: /health/ready. Configurar monitoreo
externo de ambos, alertas por errores del log, cola fallida y antigüedad del último respaldo.
Los secretos quedan en el gestor del proveedor, nunca en EXPO_PUBLIC_*.

La versión actual no sirve como prueba de aprobación legal, de tienda, de capacidad o de
pagos con tarjeta. Ver scope-review.md para los pasos de aceptación pendientes.
