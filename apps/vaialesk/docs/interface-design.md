# VAI 1.4.2 · Interfaz

Android: compilación 9. Portada compartida entre Android y web, con distribución en dos columnas desde 840 px y composición compacta en teléfonos. Se conservan las sesiones, permisos, mapas, preferencias, favoritos y lógica de viajes existentes.

## Modelo de uso

- Presentación: tarjetas de Usuario, Conductor, Administración y Despacho con una descripción corta. El acceso con cuenta tiene su propio botón.
- Dentro de la presentación, el botón con el rol actual abre un selector con los cuatro roles. El nombre Administrador se muestra completo. El selector admite desplazamiento y una columna con texto ampliado.
- Viaje: mapa, origen/destino, estimación en DOP, categoría y confirmar. Los atajos siguen disponibles después de la ruta. Las preferencias y referencias se agrupan en «Personalizar recogida»; se conservan al cerrar esa sección.
- Ayuda de presentación desplegable y navegación inferior persistente: Viaje/Resumen, Reservas/Billetera/Operación, Historial y Cuenta/Personas.
- Administración: resumen con indicadores, mapa y listas; pestañas de operación con selección visible.
- Acceso: los proveedores mantienen su disponibilidad real. La recuperación de cuenta y la configuración del API están en «¿Necesitas ayuda para entrar?». Los errores de carga del espacio siguen mostrando el diagnóstico del servidor directamente.

## Lenguaje visual y peso

Verde oscuro para marca y acciones principales, superficies blancas, gris frío para fondo y texto secundario, márgenes consistentes y tipografía del sistema. Se dibuja la ilustración de ruta con vistas nativas: no se añaden fuentes, imágenes remotas, paquetes ni animaciones continuas. Se conserva el modo de ahorro de datos y la carga del mapa a petición cuando está activo. Los permisos de ubicación no cambian.

Referencias de interacción (sin copiar marcas ni activos): destinos frecuentes de Uber y navegación de viaje de Lyft.
- https://www.uber.com/us/en/ride/how-it-works/saved-places/
- https://www.lyft.com/hub/posts/the-best-navigation-for-rideshare

## Verificación

53 pruebas existentes del cliente. Exportación web y APK local. Revisión de la interfaz web a 390 px: mapa, navegación, selector y rol Administrador completo; referencia visual, no prueba física Android. Prueba manual web: abrir/cerrar preferencias, introducir referencia, solicitar un viaje ficticio y conservar esos datos al pasar de Usuario a Conductor y Administración. Revisión de las pestañas de operación y del acceso a ayuda/configuración del servidor.
