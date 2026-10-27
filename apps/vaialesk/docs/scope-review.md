> Actualización 1.4.0: el acceso Auth0 descrito históricamente en este documento fue sustituido por Supabase Auth. La configuración vigente está en [social-auth.md](social-auth.md).

# VAI 1.2 - revisión de alcance del MVP

Fecha: 24 de octubre de 2026. Base: secciones 3-10 y 16 de la propuesta entregada por el cliente.

## Dictamen

La versión anterior era una presentación funcional, no el MVP operativo completo cotizado.
Los viajes anteriores conservan su moneda COP; no se recotizan ni generan cargos DOP.
Esta revisión incorpora módulos operativos adicionales en el APK, panel web y API. Sigue siendo
una versión de prueba. No se declara aceptación contractual ni puesta en producción: pagos,
infraestructura, credenciales, documentación legal y pruebas de campo siguen pendientes.
El piloto solicitado es Santo Domingo, español y DOP. El cliente confirmó que todavía no ha
contratado AZUL ni CardNET. Los valores de tarifa/comisión/saldo son ejemplos por validar.

## Matriz verificable

| Área de la propuesta | Implementación de VAI 1.2 | Estado de aceptación |
| --- | --- | --- |
| Marca | VAI en inicio, pantallas, icono, nombre Android y panel web | Implementado; instalar APK nuevo |
| Registro/autenticación/recuperación | Auth0 Google/Microsoft, creación de perfil al primer acceso y recuperación por proveedor | Código disponible; repetir prueba real en APK |
| Perfil | Nombre, teléfono y contacto de emergencia editables | Implementado |
| Mapa/origen/destino | Selección, búsqueda explícita, GPS opcional y ruta por calles | Verificado en navegador; pendiente teléfono nuevo |
| Moneda/ciudad | DOP y lugares iniciales de Santo Domingo | Implementado |
| Solicitud/reserva | Solicitud inmediata, reserva con fecha UTC-4 y cliente; liberación programada en API | Pruebas automáticas y flujo manual |
| Conductores cercanos | Marcadores de conductores disponibles con posición reciente | Código conectado; requiere GPS de teléfonos reales |
| Seguimiento | Posición de primer plano y refresco de API cada 3 s; demo identifica simulación | Pendiente prueba con varios teléfonos y redes |
| Estados | Solicitado, asignado, en camino, llegó, PIN/iniciado, completado, cancelado | Probado; fase de aproximación en metadatos |
| Historial/comprobante | Importe, efectivo, comprobante digital compartible, fecha, calificación y reseña | Implementado; comprobante no fiscal |
| Compartir viaje | HMAC, caducidad de 2 horas y revocación por estado final | Probado por HTTP; requiere API HTTPS público |
| SOS | Evento auditable con viaje, actores, origen de posición, ubicación y contactos; control central, atención y aviso manual | Registro probado; entrega automática pendiente de proveedor configurado |
| Perfil/vehículo/categoría | Solicitud, nombre, vehículo, placa y categoría | Implementado |
| Documentos | Cédula/licencia/matrícula/seguro, fotografía JPEG privada, referencia, vencimiento y revisión administrativa | Reglas probadas; carga real en Supabase Storage pendiente de ensayo con archivo ficticio |
| Habilitación | Bloqueo por documento pendiente/rechazado/vencido o saldo inferior al mínimo | Probado en núcleo y API |
| Solicitudes de conductor | Aceptar/rechazar; PIN oculto al conductor; datos del pasajero tras asignación | Probado; falta campo con usuarios reales |
| Navegación | Ruta y maniobras dentro de VAI, aproximación/destino desde posición compartida; alternativa externa | Código exportado; pendiente prueba de calle |
| Inicio seguro | Llegada y PIN del pasajero; bloqueo de cinco minutos tras cinco errores en API | Probado por HTTP |
| Ganancias/billetera | Ingresos, comisiones, saldo y libro mayor en centavos enteros | Probado |
| Recargas/retiros/ajustes | Solicitudes, referencia, aprobación administrativa y registro sin doble cargo | Probado; transferencia/validación bancaria manual |
| Soporte/alertas documentales | Estado visible, reporte de vencimientos a 30 días y teléfono configurable | Implementado; operación debe definir el teléfono |
| Despacho automático | Cercanía, posición reciente, radio, categoría, documentos, saldo, disponibilidad y ocupación | Probado por HTTP; pendiente capacidad y campo |
| Despacho manual | Rol separado, asignación/reasignación antes del inicio, reservas telefónicas | Probado; requiere cuentas de personal |
| Tarifas | Base, distancia, tiempo, mínimo, recargo, zona priorizada y multiplicador por categoría | Implementado; requiere aprobación de valores |
| Cancelaciones | Motivo obligatorio y bitácora | Probado |
| Administración/roles | Panel web y móvil, conductores/vehículos, cuentas existentes, acceso de despachador | Código disponible; cliente SPA de Auth0 y dominio del panel pendientes |
| Reportes | Viajes, importe estimado, comisiones, conectados, vencimientos y movimientos; resumen compartible | Implementado |
| Efectivo/comisión | Cargo de comisión único al finalizar; saldo bajo bloquea nuevas solicitudes | Pruebas de concurrencia aprobadas |
| AZUL/CardNET | Tarjeta deshabilitada, efectivo disponible | NO integrado: falta contratación, selección y accesos de sandbox |
| Seguridad/auditoría | JWT/roles en servidor, PIN privado, documentos privados, auditoría HMAC configurable | Núcleo probado; revisión independiente de seguridad pendiente |
| Privacidad/retención | Explicación de permisos y canal de soporte; GPS se detiene al salir de primer plano | Texto legal, responsable y plazo de retención pendientes de aprobación |
| Persistencia | Perfiles/viajes/calificaciones Supabase; operación, ledger y documentos referenciados en volumen privado | Apto para pruebas de una instancia; NO certificado para varias instancias |
| Respaldos | Exportación cifrada AES-256-GCM, inspección de recuperación y ejecución diaria si se configura | Criptografía probada; no activado ni recuperación real ensayada |
| Push/mensajería | Registro de token voluntario, cola persistente, reintentos, tickets Expo y webhook SOS firmado | Credenciales FCM/APNs y proveedor externo pendientes; ticket no equivale a entrega |
| Pruebas/producción | Docker, configuración de referencia, health/readiness y documentación | No hay despliegue público ni ambientes remotos activos |
| iOS/Android/tiendas | Código compartido y APK Android | Falta iOS firmado, dispositivos, tiendas y aprobación de piloto |
| Transferencia/piloto | Guía de operación e instalación, permisos y lista de aceptación | Falta capacitación y aceptación del cliente |
| Licencia base | Implementación personalizada sobre dependencias open source | Auditoría de licencias y aprobación comercial pendientes |

## Qué hace falta para cumplir la cotización completa

1. Cuenta de alojamiento y dominio a nombre de VAI, volumen persistente privado, HTTPS,
   cliente SPA de Auth0, usuarios administrativos/despacho autorizados, staging separado.
2. Contratar una pasarela local (AZUL o CardNET), implementar el adaptador específico con su
   documentación/credenciales y ensayar cobro aprobado, rechazo y devolución en sandbox.
3. Configurar FCM/APNs, teléfono/proveedor de soporte y recepción de SOS; verificar entrega
   y recibos de notificación en teléfonos reales. No existe integración automática con 911.
4. Aprobar tarifas, comisión, saldo mínimo, zona, categorías, cancelaciones y documentos.
5. Aprobar política de privacidad/retención, contratos, licencia y responsabilidades regulatorias.
6. Activar respaldos cifrados externos, retención, monitoreo/alertas y ensayar restauración
   integral (base, volumen y fotografías). El backup actual no exporta los objetos de Storage;
   estos requieren la política de respaldo del proveedor.
7. Antes de varias instancias, migrar ledger/operación/locks a transacciones de base de datos,
   restricciones únicas de viaje activo y colas compartidas. Esta versión limita a un API.
8. Completar pruebas físicas Android/iOS, pruebas de carga de mapas/ubicación y piloto
   controlado; publicar en tiendas y obtener aceptación explícita. Sin ello no se puede
   certificar el criterio de calidad/operación de la propuesta.
9. Revisar cinco avisos altos pendientes de la cadena de herramientas Expo (node-forge/zod).
   Se aplicaron parches compatibles; no se forzó el downgrade incompatible sugerido por npm.
   El servidor reportó cero vulnerabilidades conocidas en npm audit al revisar esta versión.

## Evidencia disponible

- Pruebas de reglas y presentación: `npm test`.
- API real sobre repositorio de prueba, concurrencia, firma, cifrado y notificaciones: `npm --prefix server test`.
- Exportaciones Android y web; verificación visual del recorrido de prueba.
- No se hicieron cobros, envíos SOS reales ni carga de documentos personales al verificar.

No se usa un porcentaje de cumplimiento: las dependencias pendientes forman parte del
criterio de aceptación y no pueden sustituirse por botones de demostración.
