# Cambios

Los cambios importantes de cada versión de KitchenLink. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen
[Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Corregido

- **Peticiones al mismo tiempo en usuarios y roles:**
  - dos gerentes que se daban de baja entre sí a la vez podían dejar el sistema sin Gerente activo, o
    trabarse y mostrar un error del servidor;
  - un rol podía quedar dado de baja con un usuario recién asignado;
  - el mismo usuario o rol creado dos veces a la vez quedaba repetido o mostraba un aviso genérico;
  - si el gerente restablecía una contraseña justo cuando la persona entraba con la anterior o la
    cambiaba, el restablecimiento podía perderse.
- **Límite de intentos:** muchos intentos de inicio de sesión al mismo tiempo pasaban todos antes de que el
  límite los contara.
- Un bloqueo mutuo en la base ahora se explica ("Vuelve a intentarlo") en lugar de un error del servidor.

## [0.2.0] · 2026-10-14

### Agregado

- **Administración de usuarios:**
  - lista con búsqueda y filtros por rol y estado;
  - alta con contraseña temporal y edición;
  - restablecimiento de contraseña;
  - baja y reactivación, e historial de la cuenta.
- **Roles y permisos:** 17 permisos agrupados en 7 áreas. Los roles se crean, editan, dan de baja y
  reactivan. El rol Gerente es del sistema y está protegido.
- **Menú lateral por permisos:** cada persona ve los módulos según los permisos de su rol, y los cambios
  aplican desde su siguiente acción.
- **Protecciones del gerente:** nadie se da de baja a sí mismo, ni cambia su propio rol, ni restablece su
  propia contraseña, y el sistema nunca se queda sin un Gerente activo.
- **Validación de los casos de uso de seguridad:** 20 casos, con capturas de evidencia
  ([docs/PRUEBA_TEMPRANA_VALIDACION.md](docs/PRUEBA_TEMPRANA_VALIDACION.md)).
- **Integración continua:** en cada push y Pull Request corren las pruebas contra PostgreSQL 16 y se
  compila la aplicación.
- **Pruebas automáticas:** pasan de 30 a 63.
- **Documentación para el equipo:** arquitectura con diagramas, guía para contribuir y plantilla de Pull
  Request.

### Cambiado

- El inicio de sesión muestra la versión real del sistema.
- El README describe el software e incluye capturas.
- Se acepta PostgreSQL 16 o superior.
- Guía de entorno: Nginx en cualquier carpeta, certificado con varias IP y permisos del firewall por tipo
  de red.

### Corregido

- En Edge, el cambio de contraseña mostraba dos botones para ver la contraseña.
- "Crear usuario" se podía presionar antes de recibir la contraseña temporal.
- En el historial de una cuenta, el cambio de estado aparecía debajo de su causa.
- En las ventanas de confirmación, la tecla Tab podía sacar el foco hacia la página de atrás.

## 0.1.0 · 2026-10-05

### Agregado

- Estructura del repositorio y guía de entorno para Windows y Ubuntu.
- **Base de datos:**
  - esquema v3: 19 tablas, 22 vistas y 27 triggers;
  - rol de la aplicación con permisos mínimos;
  - datos de demostración y prueba de coherencia con 168 verificaciones.
- API en Express con conexión a PostgreSQL y verificación de conectividad (24 verificaciones).
- **Inicio de sesión:**
  - JWT en una cookie `HttpOnly` y contraseñas con bcrypt;
  - cambio de contraseña obligatorio;
  - límite de intentos fallidos.
- Pantallas de inicio de sesión y cambio de contraseña.
- Configuración de Nginx con HTTPS local.
- 30 pruebas automáticas.

[Sin publicar]: https://github.com/Remaori/Kitchenlink/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Remaori/Kitchenlink/releases/tag/v0.2.0
