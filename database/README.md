# Base de datos · PostgreSQL 16

| Archivo | Qué hace | Quién lo ejecuta |
|---|---|---|
| `00_crear_bd_y_rol.sql` | Crea el rol `kitchenlink_app` y la base `kitchenlink` en UTF8 | Solo si lo haces a mano |
| `01_esquema_v3.sql` | Esquema v3: 19 tablas, 22 vistas, 10 ENUM, 27 triggers, catálogos (roles, 17 permisos, configuración) | `npm run db:instalar` |
| `02_permisos_app.sql` | Permisos mínimos del rol de la aplicación, zona horaria y `search_path` | `npm run db:instalar` |
| `03_prueba_coherencia_v3.sql` | Prueba de coherencia (168 verificaciones). Deja la base con los datos de las pantallas | `npm run db:instalar` |
| `04_contrasenas_demo.sql` | Contraseñas reales de demostración para el personal de las pantallas | `npm run db:instalar` |

## Forma normal

```bash
npm run db:instalar                  # crea o actualiza la base con datos demo
npm run db:instalar -- --recrear     # la borra y la crea de nuevo (UTF8)
npm run db:instalar -- --sin-demo    # solo esquema y permisos, sin datos
npm run db:conectividad              # comprueba que el backend llega a la base
```

`db:instalar` usa el usuario `postgres` (`DB_ADMIN_PASSWORD` en `backend/.env`) solo para
crear la base, el rol y el esquema. La aplicación se conecta siempre como `kitchenlink_app`.

## A mano en pgAdmin

1. Conectado a la base `postgres`: ejecuta `00_crear_bd_y_rol.sql` **sentencia por sentencia**
   (CREATE DATABASE no se puede mezclar con otras). Usa la misma contraseña que `DB_PASSWORD`.
2. Conectado a la base `kitchenlink`: ejecuta completos, en orden, `01`, `02`, `03` y `04`.

> Cada vez que vuelvas a ejecutar `01` (borra y recrea el esquema) ejecuta también `02`:
> los permisos del rol de la aplicación se pierden con el esquema.

## Usuarios de demostración (después de `db:instalar`)

| Usuario | Rol | Contraseña | Qué pasa al entrar |
|---|---|---|---|
| `lsaenz` | Gerente | `Kitchen2026` | Entra con los 17 permisos |
| `alopez` | Hostess | `Kitchen2026` | Entra |
| `cruiz`, `lmora`, `aruiz` | Mesero | `Kitchen2026` | Entra |
| `dbenitez` | Jefe de cocina | `Kitchen2026` | Entra |
| `mdiaz` | Cajera | `Kitchen2026` | Entra |
| `smendez` | Mesero (Pendiente) | `Temporal2026` | Pide crear su contraseña (01b) |
| `jvega` | Encargado de barra (Dado de baja) | `Kitchen2026` | No lo deja entrar |

En una base real (sin `03` ni `04`) el primer gerente se crea desde el servidor:
`npm run usuario:gerente -- lsaenz "Luis Sáenz Jiménez"`.

## Permisos del rol `kitchenlink_app`

- Lee todas las tablas y vistas.
- Inserta y modifica solo donde las pantallas escriben.
- **No puede** modificar ni borrar la bitácora, los pagos ni las cancelaciones; tampoco crear, alterar,
  borrar ni vaciar tablas. Lo comprueba `npm run db:conectividad` (grupo «Permisos mínimos»).
