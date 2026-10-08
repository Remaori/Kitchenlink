# Módulo de seguridad · Administrar roles y Administrar usuarios

Pantallas **02c · Roles y permisos**, **02a · Usuarios** y **02b · Nuevo usuario** (que también sirve para
editar). Las dos primeras pestañas de "Usuarios y roles"; cada una aparece solo si el rol tiene su permiso:
«Administrar usuarios» (02a, 02b) y «Administrar roles y permisos» (02c).

## 02c · Roles y permisos

```
Lista de roles ──► elegir un rol ──► nombre, descripción y 17 casillas en 7 módulos ──► Guardar cambios
      │                                    (el contador "3 de 17" y "2 / 3" se actualizan al marcar)
      ├─ Nuevo rol ──► nombre + casillas ──► Crear rol
      ├─ Dar de baja rol ── solo si nadie Activo o Pendiente lo tiene ──► ya no se asigna (se puede reactivar)
      └─ Gerente (candado "Sistema"): no se renombra, no se le quitan permisos, no se da de baja
```

Si hay casillas sin guardar y se elige otro rol (o "Nuevo rol"), la pantalla pregunta antes de descartarlas.

## 02a / 02b · Usuarios

```
02a Lista ── buscar, filtrar por rol y estado ── "9 usuarios · 7 activos · 1 pendiente · 1 dado de baja"
   ├─ Nuevo usuario (02b) ── nombre, teléfono, correo, usuario, rol, contraseña temporal ──► Pendiente
   │                         ("smendez" se sugiere solo; "Generar otra" y "Copiar")
   ├─ Editar ── datos de contacto y rol ── Restablecer contraseña ── Dar de baja
   ├─ Restablecer contraseña ── temporal nueva (se ve una sola vez) + sus sesiones se cierran ──► 01b al entrar
   └─ Dado de baja ── Reactivar (vuelve a Activo; a Pendiente si nunca entró) · Ver historial
```

"Ver historial" muestra la bitácora de la cuenta (alta, cambios de estado y de rol, restablecimientos,
intentos fallidos, con quién lo hizo) y lo que se conserva: comandas atendidas, cobros e inicios de sesión.

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/roles` | roles **o** usuarios | `{ roles, catalogo }`: roles con sus casillas y los 17 permisos por módulo |
| `POST /api/roles` | `rol.administrar` | `{ nombre, descripcion, permisos: [claves] }` → rol nuevo |
| `PUT /api/roles/:id` | `rol.administrar` | Mismo cuerpo: renombra y sincroniza las casillas |
| `POST /api/roles/:id/dar-de-baja` · `/reactivar` | `rol.administrar` | |
| `GET /api/usuarios` | `usuario.administrar` | Lista de 02a (orden de la pantalla: el Pendiente al final) |
| `GET /api/usuarios/contrasena-temporal` | `usuario.administrar` | "Generar otra" (`Cache-Control: no-store`) |
| `GET /api/usuarios/:id` · `/:id/historial` | `usuario.administrar` | Detalle para editar · bitácora de la cuenta |
| `POST /api/usuarios` | `usuario.administrar` | `{ nombre_completo, telefono, correo, nombre_usuario, rol_id, contrasena_temporal }` |
| `PUT /api/usuarios/:id` | `usuario.administrar` | `{ nombre_completo, telefono, correo, rol_id }` (el usuario no cambia) |
| `POST /api/usuarios/:id/restablecer-contrasena` | `usuario.administrar` | → `{ usuario, temporal }` |
| `POST /api/usuarios/:id/dar-de-baja` · `/reactivar` | `usuario.administrar` | |

Errores de los formularios: `400 DATOS_INVALIDOS` o `409 DUPLICADO` con `campos: { nombre_usuario: "…" }`,
y la pantalla pone cada mensaje debajo de su campo. Las reglas del negocio responden `409 REGLA_DE_NEGOCIO`
con el texto que se muestra tal cual.

## Decisiones (y por qué)

**Los cambios de permisos aplican desde la siguiente acción, no hasta el siguiente inicio de sesión.**
El diseño de 02c dice "Los cambios aplican en el siguiente inicio de sesión de cada usuario". El backend ya
lee los permisos del rol en cada petición (la misma consulta que revisa que la sesión siga abierta), y los
triggers de la base revisan el permiso en el momento de cada operación. Así, quitarle un permiso a un rol
surte efecto de inmediato, que es lo seguro. El menú de la persona se actualiza al cambiar de pantalla.
La pantalla dice "Los cambios aplican desde la siguiente acción de cada usuario, sin que tenga que volver a
entrar". **Ajustar el texto en Figma.**

*Pregunta probable: "¿y si el gerente se equivoca y le quita un permiso a alguien que está trabajando?"*
Su siguiente acción con ese permiso se rechaza con un mensaje claro ("Mesero no tiene el permiso…"); el
gerente marca la casilla de nuevo y la persona sigue sin volver a entrar.

**Las reglas viven en la base; el backend agrega las que protegen al gerente.** La base ya impide quitarle
permisos al Gerente, darlo de baja, dar de baja un rol con usuarios, crear un usuario que no empiece
Pendiente y asignar un rol dado de baja (triggers de `01_esquema_v3.sql`). El backend agrega:

- Nadie se da de baja a sí mismo, ni cambia su propio rol, ni restablece su propia contraseña (pantalla 12:
  "otro usuario con rol Gerente se la restablece").
- No se puede dejar el sistema sin un Gerente activo (por baja o por cambio de rol), aunque lo intente otro
  rol que tenga «Administrar usuarios».
- El nombre del rol del sistema no cambia.

**Nombre de usuario siempre en minúsculas y sin repetirse** (pendiente que dejó la tarea de inicio de
sesión). El inicio de sesión no distingue mayúsculas, así que `CRuiz` se guarda como `cruiz` y no puede
existir junto a otro `cruiz`. Lo mismo con los nombres de rol (`MESERO` = `Mesero`) y los correos.
El nombre de usuario no se edita después: es con lo que la persona entra.

**Contraseña temporal generada por el servidor.** 6 letras y 4 números al azar (sin `I`, `l`, `O`, `o`, `0`
ni `1`, para que no se confundan al dictarla). Se muestra una sola vez, nunca se guarda en claro (bcrypt) y la
respuesta lleva `Cache-Control: no-store`. "Copiar" funciona también cuando la app se abre por
`http://IP` en la red local, donde el navegador no da acceso al portapapeles moderno.

**Reactivar.** Un usuario dado de baja vuelve a Activo con su contraseña de siempre; si nunca entró, vuelve a
Pendiente con su temporal. Si su rol también está dado de baja, primero hay que reactivar el rol.

**Todo queda en la bitácora con quién lo hizo.** Altas, cambios de estado y de rol y restablecimientos los
registran los triggers. Los cambios de roles (crear, casillas agregadas y quitadas, baja, reactivación) y los
de datos de contacto los registra el backend con `fn_bitacora`, dentro de la misma transacción.

**Dos peticiones a la vez no se mezclan.** Cada cambio bloquea la fila (`SELECT … FOR UPDATE`) mientras
dura la transacción: si dos gerentes guardan el mismo rol al mismo tiempo, el segundo espera a que termine
el primero y queda la versión completa del segundo, nunca una mezcla a medias.

## Pruebas automáticas (`npm test`)

`backend/test/roles.test.js` — 14 pruebas de 02c: lista y casillas, permisos de acceso, nuevo rol, nombre
repetido, datos inválidos, guardar casillas (con bitácora), cambio sin volver a entrar, protección del
Gerente, dar de baja y reactivar.

`backend/test/usuarios.test.js` — 18 pruebas de 02a y 02b: lista, permisos de acceso, temporal sin caché,
alta → primer inicio → Activo con los permisos del rol, duplicados sin importar mayúsculas, validaciones,
editar (bitácora y permisos al instante), protecciones del gerente, último Gerente activo, restablecer
(sesiones cerradas, 01b), dar de baja (corta la sesión), reactivar (Activo o Pendiente, rol dado de baja) e
historial.

La validación en pantalla de Iniciar sesión y Administrar roles está en
[PRUEBA_TEMPRANA_VALIDACION.md](PRUEBA_TEMPRANA_VALIDACION.md).
