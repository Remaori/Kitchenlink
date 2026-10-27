# KitchenLink

[![Pruebas](https://github.com/Remaori/Kitchenlink/actions/workflows/pruebas.yml/badge.svg)](https://github.com/Remaori/Kitchenlink/actions/workflows/pruebas.yml)
[![Versión](https://img.shields.io/github/v/tag/Remaori/Kitchenlink?label=versión&color=7C5CFC)](CHANGELOG.md)
![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)

Sistema de gestión para restaurantes que funciona dentro de la red local del restaurante. Los dispositivos
(tablets, pantallas y computadoras) se conectan a un servidor propio, así que la operación no depende de
internet.

**React · Node.js + Express · PostgreSQL**

## Funcionalidades

**Seguridad y accesos**

- **Inicio de sesión** con usuario y contraseña. Un mismo mensaje para usuario inexistente y contraseña
  incorrecta (no revela qué cuentas existen) y bloqueo temporal tras varios intentos fallidos.
- **Cambio de contraseña obligatorio** en el primer inicio de sesión y cuando el gerente la restablece.
- **Usuarios:** alta con contraseña temporal, edición, restablecimiento de contraseña, baja y reactivación
  (la baja conserva el historial de la cuenta), búsqueda y filtros por rol y estado.
- **Roles y permisos:** 17 permisos agrupados por área (servicio, salón, recepción, cocina y barra, caja,
  gerencia y seguridad). Se crean roles y se marcan sus permisos; los cambios aplican desde la siguiente
  acción de cada usuario. El rol Gerente es del sistema: no se le quitan permisos ni se da de baja.
- El menú y las pantallas de cada persona se arman con los permisos de su rol.

**Menú, mesas y recepción**

- **Menú, categorías y productos:** cada categoría dice si se prepara en cocina o en barra; el precio se
  guarda exacto y un producto se quita del menú sin borrarse. Cocina marca con **86** lo que se agotó (con
  motivo); cada 86 queda en un historial con su motivo, desde y hasta cuándo, y quién. El mesero consulta el
  menú con lo que está disponible.
- **Mesas:** alta con número (entero, del 1 al 999), capacidad y zona; edición, baja y reactivación sin
  perder su historial. La capacidad no baja de una reservación ya hecha. Una mesa libre se bloquea con
  motivo (limpieza, reparación…) y la tarjeta dice por qué y quién la bloqueó.
- **Reservaciones:** agenda del día con la tolerancia de llegada y la duración; la nueva reservación sugiere
  la mesa que cabe y no se empalma, y queda Por confirmar. Confirmar, marcar llegada o cancelar; si el cliente
  no llega dentro de la tolerancia, pasa solo a "No se presentó" y la mesa se libera.
- **Lista de espera:** en orden de llegada, con lo que lleva esperando cada grupo y el estimado; al asignar
  mesa, la reservación tiene prioridad y la mesa debe ser de su tamaño.
- **Mis mesas (mesero):** sus mesas primero; cambia su comanda de mesa (a una libre donde quepan) o ajusta
  las personas.
- Los cambios del menú y de las mesas quedan en la bitácora con quién los hizo.

**Modelo de datos**

La base de datos (20 tablas, 22 vistas y 27 triggers) cubre la operación completa del restaurante: menú,
mesas, reservaciones y lista de espera, comandas, cocina y barra, cobro, cortes de caja y bitácora. Los
módulos de la aplicación que usan esas tablas se integran por etapas.

## Capturas

| Inicio de sesión | Usuarios |
|---|---|
| ![Inicio de sesión](docs/capturas/iniciar-sesion.png) | ![Lista de usuarios con su rol, estado y último acceso](docs/capturas/usuarios.png) |
| **Nuevo usuario** | **Roles y permisos** |
| ![Alta de usuario con contraseña temporal y vista previa de sus permisos](docs/capturas/nuevo-usuario.png) | ![Permisos del rol Mesero agrupados por área](docs/capturas/roles-y-permisos.png) |

## Arquitectura

```
Dispositivos del restaurante (navegador)
        │  HTTPS · red local
        ▼
      Nginx ──── app React compilada
        │
        └── /api ──► Express (127.0.0.1:3000) ──► PostgreSQL
```

- La API solo escucha en el propio servidor; los dispositivos llegan a ella a través de Nginx.
- Las reglas del negocio también viven en la base (triggers): si alguien se salta la aplicación, la base
  rechaza la operación.
- La aplicación se conecta a PostgreSQL con un rol de permisos mínimos: no puede borrar tablas ni modificar
  la bitácora, los pagos o las cancelaciones.
- Sin recursos externos: la fuente y los íconos van dentro de la aplicación.

**Seguridad**

- Contraseñas con bcrypt; nunca se guardan en claro.
- Sesión con JWT en una cookie `HttpOnly` y `SameSite=Strict`. Cada sesión tiene una fila en la base, así
  que cerrar sesión o dar de baja a un usuario corta su acceso al instante.
- Los permisos se revisan en la API y otra vez en la base.
- La bitácora registra altas, bajas, cambios de rol y restablecimientos de contraseña, con quién y cuándo.

Diagramas y detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Instalación

Requisitos: Node.js 24 LTS (mínimo 20.19), PostgreSQL 16 o superior y Git.

```bash
npm install
npm run env:crear      # crea backend/.env; después escribe DB_ADMIN_PASSWORD (contraseña de postgres)
npm run db:instalar    # crea la base kitchenlink con el esquema y datos de demostración
npm run dev            # API en :3000 y la aplicación en http://localhost:5173
```

La guía paso a paso (Windows y Ubuntu, acceso desde otros equipos de la red local y Nginx con HTTPS) está en
[docs/GUIA_ENTORNO.md](docs/GUIA_ENTORNO.md).

### Datos de demostración

`npm run db:instalar` carga un restaurante de ejemplo con su personal:

| Usuario | Contraseña | Rol |
|---|---|---|
| `lsaenz` | `Kitchen2026` | Gerente |
| `smendez` | `Temporal2026` | Mesero recién dado de alta: al entrar pide crear su contraseña |

Los demás usuarios están en [database/README.md](database/README.md). Para una instalación real:
`npm run db:instalar -- --sin-demo` y después `npm run usuario:gerente -- <usuario> "<Nombre>"`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y aplicación en este equipo |
| `npm run dev:red` | Igual, y la aplicación se abre desde otros equipos de la red local |
| `npm test` | Pruebas automáticas (usan la base `kitchenlink_pruebas`) |
| `npm run e2e:validacion` | Pruebas de validación en Microsoft Edge, con una captura por caso |
| `npm run e2e` | Pruebas de pantalla (inicio de sesión y alta de usuarios) |
| `npm run build` | Compila la aplicación para Nginx (`frontend/dist`) |
| `npm run db:instalar [-- --recrear \| --sin-demo]` | Crea o actualiza la base |
| `npm run db:conectividad [-- --api URL]` | Verifica la conexión API ↔ PostgreSQL y genera un reporte |
| `npm run db:respaldar [-- <carpeta>]` | Copia completa de la base con `pg_dump` (restaurar: [guía](docs/GUIA_ENTORNO.md), 8.4) |
| `npm run usuario:gerente -- <usuario> "<Nombre>"` | Primer gerente de una base vacía |
| `npm run usuario:restablecer -- <usuario>` | Contraseña temporal nueva desde el servidor |

## Pruebas

- `npm test`: 123 pruebas automáticas (node:test + supertest) sobre una base aparte. Cubren la conexión y los
  permisos mínimos, el inicio de sesión y las sesiones, los roles y los usuarios, el menú, las mesas, las
  reservaciones y la lista de espera, incluidas peticiones que llegan al mismo tiempo.
- `npm run db:conectividad`: 24 verificaciones de la conexión entre la API y PostgreSQL.
- `npm run e2e:validacion`: las pruebas de validación en pantalla. Microsoft Edge recorre solo 37 casos como
  una persona (escribe, hace clic y espera el texto exacto del diseño) y guarda una captura por caso. Detalles
  en [e2e/README.md](e2e/README.md).
- Resultados con capturas: [docs/PRUEBA_TEMPRANA_VALIDACION.md](docs/PRUEBA_TEMPRANA_VALIDACION.md) (inicio
  de sesión y roles) y [docs/PRUEBAS_DE_VALIDACION.md](docs/PRUEBAS_DE_VALIDACION.md) (menú, mesas,
  recepción y operaciones de mesas).

## Estructura

```
kitchenlink/
├── backend/            API REST · Node.js + Express
│   ├── src/
│   │   ├── seguridad/  inicio de sesión, sesiones, contraseñas, permisos, roles y usuarios
│   │   ├── rutas/      /api/salud, /api/usuarios, /api/roles, /api/menu, /api/mesas, /api/reservaciones,
│   │   │               /api/lista-espera, /api/comandas (cambiar mesa o personas)
│   │   ├── servicios/  reglas del menú, las mesas y la recepción
│   │   ├── app.js      aplicación Express
│   │   ├── db.js       conexión a PostgreSQL y transacciones con el usuario que opera
│   │   └── server.js   punto de entrada
│   ├── scripts/        instalar la base, verificar la conexión, comandos de usuarios
│   └── test/           pruebas automáticas
├── frontend/           aplicación React + Vite
├── e2e/                pruebas de pantalla y de validación (Playwright + Microsoft Edge)
├── database/           scripts SQL: base, esquema, permisos y datos de demostración
├── infra/nginx/        servidor web y proxy con HTTPS local
└── docs/               guía de entorno, documentación de módulos y diagrama entidad-relación
```

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md): despliegue, capas del backend y recorrido de una petición
- [Arquitectura ilustrada (PDF)](docs/arquitectura/KitchenLink_Arquitectura.pdf): despliegue, recorrido de un pedido,
  seguridad y respaldo en la nube
- [Guía de entorno](docs/GUIA_ENTORNO.md): instalación, red local, Nginx y HTTPS
- [Base de datos](database/README.md): scripts SQL, usuarios de demostración y permisos de la aplicación
- [Autenticación](docs/AUTENTICACION.md): inicio de sesión, sesiones y contraseñas
- [Roles y usuarios](docs/ROLES_Y_USUARIOS.md): administración de usuarios, roles y permisos
- [Menú y productos](docs/MENU.md): categorías, productos y 86
- [Mesas](docs/MESAS.md): crear, editar, bloquear y dar de baja mesas; Mis mesas
- [Recepción](docs/RECEPCION.md): reservaciones y lista de espera
- [Pruebas de validación](docs/PRUEBAS_DE_VALIDACION.md): menú, mesas, recepción y operaciones, con capturas
- [Diagrama entidad-relación](docs/erd/)
- [Cambios por versión](CHANGELOG.md) · [Cómo contribuir](CONTRIBUTING.md)

## Autores

Luis Antonio Sáenz Jiménez · Diego Jerónimo Benítez
