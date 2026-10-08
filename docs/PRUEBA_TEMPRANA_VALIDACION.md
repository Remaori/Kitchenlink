# Prueba temprana de validación · Iniciar sesión y Administrar roles

| | |
|---|---|
| Tarea del cronograma | Prueba temprana de validación: Iniciar sesión y Administrar roles (13 oct 2026) |
| Ejecutada | 8 de octubre de 2026 |
| Casos de uso | **Iniciar sesión** (pantallas 01 y 01b) y **Administrar roles** (pantalla 02c) |
| Resultado | **20 casos · 20 pasan · 0 fallan** |

## Objetivo

Confirmar, antes de la revisión del miércoles 14 de octubre, que los dos casos de uso hacen lo que dicen las
pantallas 01, 01b y 02c y las reglas de la pantalla 12 (Flujos de operación), usando la aplicación completa:
navegador → app compilada (servidor de Vite) → API → PostgreSQL.

Administrar usuarios (02a, 02b) queda fuera de esta prueba: tiene sus 18 pruebas automáticas y su prueba por
caso de uso está programada para el 26 de noviembre.

## Cómo se hizo

1. **En la pantalla.** Microsoft Edge recorrió los casos como lo haría una persona (escribir, hacer clic,
   leer los mensajes) y guardó una captura por caso en [evidencias/prueba-temprana-seguridad](evidencias/prueba-temprana-seguridad/).
   Cada caso se puede repetir a mano siguiendo la columna "Pasos".
2. **En la API y la base.** `npm test` (62 pruebas): revisa lo que no se ve en la pantalla, como el hash de la
   contraseña, la cookie, la bitácora o que la base rechace una regla aunque alguien se salte la pantalla.

Entorno: Windows 11 · Node.js 24.21.0 · PostgreSQL 18.6 · Microsoft Edge 154 · ventana de 1440 × 900.
Base `kitchenlink_e2e`, recién instalada con los datos de demostración (`03_prueba_coherencia_v3.sql`:
168 verificaciones, todo correcto). Usuarios y contraseñas en [database/README.md](../database/README.md).

## Casos · Iniciar sesión (01 y 01b)

| ID | Caso | Pasos | Resultado esperado | Verificado en | Resultado |
|---|---|---|---|---|---|
| PV-01 | Entrada correcta | `lsaenz` / `Kitchen2026` → Iniciar sesión | Entra a Inicio: "Hola, Luis", 17 permisos, "Usuarios y roles" en el menú | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-01.jpg) |
| PV-02 | Contraseña incorrecta | `lsaenz` / `Equivocada1` | "Usuario o contraseña incorrectos." y se borra la contraseña escrita | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-02.jpg) |
| PV-03 | Usuario que no existe | `no_existe` / cualquier contraseña | El mismo mensaje y el mismo tiempo que PV-02: no se puede saber qué usuarios existen | Prueba automática | PASA |
| PV-04 | Cuenta dada de baja | `jvega` / `Kitchen2026` | No entra: "Tu cuenta está dada de baja. Si es un error, habla con el gerente." | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-04.jpg) |
| PV-05 | Demasiados intentos | 5 contraseñas incorrectas del mismo usuario desde el mismo equipo (la prueba automática usa 3 para ir rápido) | "Demasiados intentos fallidos. Espera N min…", aunque después acierte; desde otro equipo sí entra | Prueba automática | PASA |
| PV-06 | Primer inicio (Pendiente) | `smendez` / `Temporal2026` → escribir `Sofia2026` dos veces → Guardar y entrar | 01b "Crea tu contraseña"; las 3 reglas se ponen en verde; entra y queda Activo | Pantalla · prueba automática | PASA · [01b](evidencias/prueba-temprana-seguridad/PV-06a.jpg) · [entró](evidencias/prueba-temprana-seguridad/PV-06.jpg) |
| PV-07 | Contraseña restablecida | El gerente restablece la de Carlos (02a); `cruiz` entra con la temporal; intenta abrir `/usuarios` | 01b "Crea tu nueva contraseña · El gerente restableció tu contraseña"; cualquier otra pantalla lo regresa a 01b | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-07.jpg) |
| PV-08 | Reglas de 01b en el servidor | Enviar a la API contraseñas cortas, sin número, que no coinciden, de más de 72 caracteres o iguales a la temporal | Todas rechazadas aunque alguien se salte la pantalla | Prueba automática | PASA |
| PV-09 | Fin de la sesión | Cerrar sesión; sesión de más de 12 h; cookie alterada o firmada con otra clave | En los tres casos la API responde "Tu sesión terminó" y la app vuelve a 01 | Prueba automática | PASA |
| PV-10 | Lo que se guarda | Revisar la base y la cookie después de entrar | Solo el hash bcrypt de la contraseña y el SHA-256 del secreto de la sesión; cookie `HttpOnly` y `SameSite=Strict` | Prueba automática | PASA |

## Casos · Administrar roles (02c)

| ID | Caso | Pasos | Resultado esperado | Verificado en | Resultado |
|---|---|---|---|---|---|
| PV-11 | Roles y casillas | Usuarios y roles → Roles y permisos → Mesero | 6 roles con sus usuarios; Mesero: "3 de 17 permisos activos", "4 usuarios con este rol", 7 módulos con su contador | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-11.jpg) |
| PV-12 | Nuevo rol | Nuevo rol → "Supervisor de piso" + 2 casillas → Crear rol | Aparece en la lista con "0 usuarios" y "2 de 17"; queda en la bitácora con quién lo creó | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-12.jpg) |
| PV-13 | Nombre repetido | Nuevo rol → "MESERO" → Crear rol | "Ya existe el rol «Mesero»." debajo del campo | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-13.jpg) |
| PV-14 | Guardar casillas | Hostess: desmarcar "Crear y bloquear mesas", marcar "Consultar reportes" → Guardar cambios | El contador sigue en 3 de 17; "Se guardaron los cambios del rol Hostess."; la bitácora dice qué se agregó y qué se quitó | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-14.jpg) |
| PV-15 | Cambios sin guardar | Desmarcar una casilla y elegir otro rol | "¿Descartar los cambios?"; al descartar, la casilla queda como estaba guardada | Pantalla | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-15.jpg) |
| PV-16 | Aplica sin volver a entrar | Ana López (Hostess) con sesión abierta; el gerente marca «Administrar roles y permisos» en Hostess | Ana ve "Usuarios y roles" y entra a 02c sin volver a iniciar sesión; al quitar la casilla, su siguiente petición se rechaza | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-16.jpg) |
| PV-17 | Rol del sistema | Elegir Gerente | Candado "Sistema"; 17 casillas y el nombre bloqueados; "Dar de baja rol" deshabilitado. Quitarle permisos lo rechazan la API y la base; renombrarlo, la API | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-17.jpg) |
| PV-18 | Rol con usuarios | Elegir Mesero | "Dar de baja rol" deshabilitado con el aviso "No se puede dar de baja este rol mientras tenga usuarios asignados."; la base también lo rechaza | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-18.jpg) |
| PV-19 | Dar de baja y reactivar | Encargado de barra (su único usuario ya está dado de baja) → Dar de baja rol → confirmar; abrir Nuevo usuario; volver y Reactivar rol | Queda "Dado de baja" al final de la lista; no aparece en el selector de rol de 02b; se reactiva | Pantalla · prueba automática | PASA · [baja](evidencias/prueba-temprana-seguridad/PV-19a.jpg) · [reactivado](evidencias/prueba-temprana-seguridad/PV-19.jpg) |
| PV-20 | Rol sin el permiso | `lmora` (Mesero) → abrir `/roles` | Sin "Usuarios y roles" en el menú; la pantalla dice "Sin acceso"; la API responde 403 | Pantalla · prueba automática | PASA · [captura](evidencias/prueba-temprana-seguridad/PV-20.jpg) |

## Observaciones para la revisión del 14 de octubre

1. **Texto de 02c.** El diseño dice "Los cambios aplican en el siguiente inicio de sesión de cada usuario".
   En la aplicación aplican desde la siguiente acción (PV-16), que es más seguro: quitar un permiso surte
   efecto en ese momento. La pantalla ya dice "Los cambios aplican desde la siguiente acción de cada
   usuario, sin que tenga que volver a entrar". Propuesta: ajustar el texto en Figma. El porqué está en
   [ROLES_Y_USUARIOS.md](ROLES_Y_USUARIOS.md).
2. **Cronograma.** "Codificación de Gestionar modificadores" (20 de octubre) ya no corresponde: el esquema v3
   quitó los modificadores por una observación de la revisión anterior. Propuesta: quitarla o usar ese día
   para otra tarea.
3. **"Panel" del gerente.** El menú lateral del diseño tiene "Panel", pero no hay pantalla para él. Por ahora
   la app muestra un Inicio provisional (permisos de quien entra y estado del sistema).

## Cómo repetirla

```bash
npm run db:instalar -- --recrear   # datos de demostración desde cero (algunos casos los modifican)
npm test                           # 62 pruebas automáticas
npm run dev                        # http://localhost:5173 y seguir la columna "Pasos" en orden
```
