# Módulo de seguridad · Iniciar sesión (autenticación)

Pantallas **01 · Iniciar sesión** y **01b · Cambio de contraseña obligatorio**. Sigue la pantalla 11:
"Inicio de sesión con JWT, contraseñas con bcrypt y permisos por rol".

## Flujo

```
01 Iniciar sesión ── usuario + contraseña ──► POST /api/auth/iniciar-sesion
      │                                         ├─ incorrectos ──────────► 401 "Usuario o contraseña incorrectos."
      │                                         ├─ dado de baja ─────────► 403 (solo si la contraseña era correcta)
      │                                         ├─ muchos intentos ──────► 429 "Espera N min…"
      │                                         └─ correctos ────────────► cookie de sesión
      ▼
 ¿contraseña temporal? (Pendiente o restablecida por el gerente)
      ├─ sí ─► 01b · solo puede crear su contraseña ─► POST /api/auth/cambiar-contrasena
      │                                                 (Pendiente → Activo, bitácora, sesión nueva)
      └─ no ─► la aplicación (menú según los permisos de su rol)
```

## Rutas de la API

| Método y ruta | Requiere | Qué hace |
|---|---|---|
| `POST /api/auth/iniciar-sesion` | — | `{ usuario, contrasena }` → usuario, permisos y cookie `kl_sesion` |
| `GET /api/auth/sesion` | sesión (aunque sea temporal) | Usuario y permisos de la cookie |
| `POST /api/auth/cambiar-contrasena` | sesión (aunque sea temporal) | `{ nueva, confirmacion }` (y `actual` si no es temporal) |
| `POST /api/auth/cerrar-sesion` | — | Cierra la sesión en la base y borra la cookie |
| `GET /api/usuarios` | sesión + permiso `usuario.administrar` | Lista de 02a (ejemplo de ruta protegida por permiso) |
| `GET /api/salud` | — | Estado de la API y de la conexión a la base |

Errores siempre en JSON: `{ "codigo": "CREDENCIALES", "mensaje": "Usuario o contraseña incorrectos." }`.

## Decisiones (y por qué)

**Contraseñas con bcrypt (costo 12).** Nunca se guarda la contraseña, solo su hash con sal
(`usuario.contrasena_hash`). Se usa `bcryptjs` (mismo algoritmo y formato que `bcrypt`, escrito en
JavaScript) para no depender de compiladores en Windows. bcrypt solo usa los primeros 72 bytes, por eso
la regla "máximo 72 caracteres".

**JWT en cookie httpOnly + fila en `sesion`.** El JWT va firmado (HS256) dentro de una cookie
`HttpOnly; SameSite=Strict` (y `Secure` con HTTPS): el JavaScript de la página no puede leerla y no viaja
en peticiones desde otros sitios. El JWT lleva el id de la sesión y un secreto al azar; la tabla `sesion`
guarda solo el SHA-256 de ese secreto. En cada petición se revisa la fila, así que **cerrar sesión o dar
de baja al usuario corta el acceso en ese momento**, aunque el JWT todavía no haya vencido. La misma tabla
da el "En línea" y el "Último acceso" de 02a.

*Pregunta probable: "¿para qué JWT si igual consultan la tabla?"* La firma descarta tokens falsos sin ir
a la base, y la tabla permite revocar sesiones al instante, algo que un JWT solo no puede.

**Mismo mensaje para usuario inexistente y contraseña incorrecta**, y el mismo tiempo de respuesta
(si el usuario no existe se compara contra un hash de relleno). Así no se puede averiguar qué usuarios
existen. "Cuenta dada de baja" solo se dice si la contraseña era correcta.

**Límite de intentos.** 5 fallos por usuario y equipo, o 20 por equipo, en 15 minutos → espera.
Los fallos de usuarios que existen quedan en la `bitacora` (`inicio_sesion_fallido`, con IP y equipo).

**Contraseña temporal.** Usuario nuevo (Pendiente) o restablecido: entra con la temporal, pero hasta
crear la suya el servidor solo le permite 01b (cualquier otra ruta responde `CAMBIO_CONTRASENA_REQUERIDO`)
y no tiene permisos. Al guardarla, el trigger de la base lo pasa a Activo y lo registra en la bitácora;
el backend cierra todas sus sesiones y abre una nueva. La nueva no puede ser igual a la temporal.

**Permisos por rol, en dos capas.** El backend revisa el permiso (`exigirPermiso('usuario.administrar')`)
y la base vuelve a revisarlo en los triggers (`fn_exigir_permiso`). El menú de la app se arma con los
permisos, no con el nombre del rol, porque en 02c los roles se editan.

**Quién hizo cada cosa.** Cada transacción le dice a la base el usuario que opera
(`set_config('kitchenlink.usuario_id', …, true)`); los triggers lo usan en la bitácora. Es local a la
transacción: la conexión regresa al pool sin rastro (hay una prueba para eso).

**Rol de base de datos con permisos mínimos.** La API se conecta como `kitchenlink_app`, no como
`postgres`: no puede crear ni borrar tablas, ni modificar la bitácora, los pagos o las cancelaciones.

**Sin internet.** La fuente Inter y los íconos van dentro de la app; no se carga nada de un CDN.

## Comandos del servidor

Pantalla 12: "si el gerente olvida la suya y no hay otro gerente, se restablece desde el servidor".

```bash
npm run usuario:restablecer -- lsaenz                    # imprime una contraseña temporal
npm run usuario:gerente -- lsaenz "Luis Sáenz Jiménez"   # primer gerente de una base vacía
```

## Pruebas automáticas (`npm test`)

`backend/test/autenticacion.test.js` — 22 pruebas:

- Entrada correcta: cookie `HttpOnly` y `SameSite=Strict`, permisos del rol, sesión registrada con
  el hash (no el token), IP, equipo y último acceso.
- El usuario no distingue mayúsculas ni espacios.
- Mismo mensaje para usuario inexistente y para contraseña incorrecta; el fallo queda en la bitácora.
- Usuario dado de baja; bloqueo por intentos (por usuario y por equipo).
- Token alterado o firmado con otra clave; sesión cerrada, vencida o de un usuario dado de baja.
- Permisos: el gerente ve los usuarios y el mesero no.
- 01b: reglas validadas en el servidor; Pendiente → Activo con bitácora; la sesión vieja deja de servir.
- Restablecer desde el servidor; primer gerente; cambio voluntario que pide la contraseña actual.

`backend/test/conectividad.test.js` — 8 pruebas de conexión, permisos mínimos, pool y `/api/salud`.

## Siguientes tareas del módulo

02a/02b (alta, edición, baja y restablecimiento por el gerente) y 02c (roles y permisos) ya están hechas:
ver [ROLES_Y_USUARIOS.md](ROLES_Y_USUARIOS.md). Ahí quedó resuelto el pendiente de guardar `nombre_usuario`
siempre en minúsculas. Socket.IO va con las comandas.
