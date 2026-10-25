# VAI 1.3: experiencia útil sin añadir SDK

Revisión de producto: 24 de octubre de 2026. Comparación de funciones públicas de Uber, Bolt, Cabify y Lyft; no es una clasificación exhaustiva del mercado. La disponibilidad de cada función cambia según país.

## Selección y coste

| Referencia | Decisión para VAI | Coste y límites |
|---|---|---|
| [Uber Saved Places](https://www.uber.com/us/en/ride/how-it-works/saved-places/) | Casa y Trabajo guardados, accesos y hasta tres viajes recientes para repetir | Dos lugares validados por identidad y teléfono mediante AsyncStorage existente. No hay sincronización entre teléfonos. Repetir rellena la ruta; recalcula tarifa y requiere confirmar. |
| [Uber Comfort](https://www.uber.com/us/en/ride/uber-comfort/), [Cabify preferencias](https://cabifydriver.zendesk.com/hc/es/articles/19508389741842-Preferencias-de-los-pasajeros) | Tranquilidad, ambiente fresco y equipaje, opcionales | Tres códigos cortos por viaje inmediato. Según disponibilidad, sin garantía ni sobreprecio. No añade categorías ni cambia el despacho. |
| [Uber Pickup Messages](https://www.uber.com/gb/en/ride/how-it-works/pickup-messages/) | Referencia escrita de recogida, máximo 160 caracteres | La referencia y las preferencias solo llegan al propietario, al conductor asignado y al personal autorizado. Sin chat, audio ni servicios adicionales. |
| [Bolt Safety](https://bolt.eu/en/rides/safety/) | Conservar PIN, compartir viaje, contacto y SOS ya presentes | El ahorro de datos mantiene esos controles. No se promete la supervisión 24/7, respuesta automática o detección de paradas de Bolt. |
| [Lyft Price Lock](https://www.lyft.com/rider/commute/pricelock), [Wait & Save](https://www.lyft.com/rider/wait-and-save) | Aplazar suscripciones y descuentos por espera | Requieren cobro, reglas comerciales y oferta real de conductores. Evita simular ahorros inexistentes en el piloto. |

También se aplazan coche compartido con múltiples pasajeros, audio continuo, biometría y mapas sin conexión: elevan infraestructura, privacidad, procesamiento o almacenamiento. No se añadió ninguna dependencia npm ni SDK nativo.

## Ahorro de datos

Cuenta → Activar ahorro de datos. El ajuste se guarda por identidad; la demostración usa un espacio separado. El mapa no se monta hasta leer el ajuste y, con ahorro activo, solo se descarga al pulsar Mostrar mapa o elegir un punto. Abrir navegación también es una petición explícita de mapa. Las rutas y tarifas siguen necesitando consultas; no es un modo sin conexión. Abrir un mapa puede descargar Leaflet y teselas de terceros.

Consultas de estado conectado, programadas después de terminar la anterior:

| Situación en primer plano | Normal | Ahorro |
|---|---:|---:|
| Viaje propio activo | 3 s | 8 s |
| Conductor conectado o personal operativo | 5 s | 10 s |
| Usuario sin viaje / conductor desconectado | 30 s | 60 s |
| Segundo plano | Sin nuevas consultas periódicas | Sin nuevas consultas periódicas |

Al volver al primer plano se solicita una actualización. Las acciones del usuario se envían inmediatamente y recuperan el estado resultante; la tabla describe solo el refresco periódico. La posición del conductor conserva su frecuencia previa; el ahorro no reduce la precisión del GPS. Una solicitud que ya estaba en curso puede terminar después de pasar a segundo plano. Los fallos aplican espera exponencial hasta 120 segundos, evitando insistir con una red caída.

Con respuesta instantánea, sin acciones y una hora completa en primer plano: antes, unas 1.200 consultas periódicas/h; ahora en reposo, unas 120 normales (-90%) o 60 con ahorro (-95%). Son límites teóricos, no mediciones de consumo de datos o batería. Las respuestas lentas reducen aún más la frecuencia. El ahorro aumenta hasta 8 segundos el intervalo de consulta de cambios externos durante un viaje; no ofrece tiempo real por WebSocket.

Mapas: caché en memoria de hasta 64 entradas con expulsión por antigüedad de uso; búsquedas 24 h, rutas por calles 5 min. Solicitudes idénticas concurrentes comparten respuesta. Búsquedas explícitas serializadas a más de 1 s entre inicios; no hay autocompletado ni descarga masiva de teselas. Los errores no se guardan como resultados válidos. El servicio público de mapas sigue necesitando un proveedor con capacidad y condiciones adecuadas antes de producción.

## Medición reproducible

Mismo equipo, node_modules y exportación Android Hermes en modo producción mediante `EXPO_OFFLINE=1 npx expo export --platform android`. Línea base 1.2 de main y fuentes finales 1.3:

| Medida | 1.2 | 1.3 | Diferencia |
|---|---:|---:|---:|
| Bytecode Hermes | 1.960.520 B | 1.979.140 B | +18.620 B (+0,95%) |
| Bytecode comprimido gzip | 842.571 B | 851.176 B | +8.605 B (+1,02%) |
| Dependencias nuevas | — | 0 | 0 |

Esto mide el código exportado, no el tamaño total instalado ni RAM, FPS, batería o tráfico de un teléfono. El APK incluye el runtime y bibliotecas existentes. Esas métricas requieren probar el APK en un Android físico; no se han inventado resultados.

## Validación y prueba

56 pruebas automatizadas: 34 de app/reglas y 22 de API. Incluyen permisos de referencia antes/después de aceptar, entradas inválidas, límite/expiración/deduplicación de caché, suspensión del refresco y ausencia de solicitudes superpuestas; se mantienen los flujos de PIN, comisión y datos históricos.

Se exportaron Android, iOS y web; la exportación iOS no es una firma ni prueba en iPhone. Revisión visual web compartida a 390 × 844: activar ahorro, viajar sin mapa con PIN/SOS accesibles, guardar favorito, repetir con tarifa vigente, pedir viaje con preferencias y alternar conductor.

En el APK: probar Usuario → elegir destino → guardar Casa; cambiar destino y recuperar Casa; seleccionar preferencia y referencia → pedir; pasar a Conductor y aceptar → comprobar referencia; confirmar llegada, consultar PIN en Usuario y finalizar. Cuenta permite borrar favoritos o desactivar ahorro.

Estas mejoras no resuelven los pendientes de alojamiento público, pasarela dominicana, notificaciones de producción y publicación en tiendas descritos en scope-review.md. Las preferencias se aplican a solicitudes inmediatas; las reservas conservan su flujo anterior.
