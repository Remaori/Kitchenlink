# KitchenLink

Sistema de gestión de restaurante · Aplicación web con despliegue local en el restaurante.
**React + Node.js/Express + PostgreSQL 16** (ver pantalla 11 · Arquitectura de software).

Equipo: Luis Antonio Sáenz Jiménez · Diego Jerónimo Benítez

## Estado

| Tarea del cronograma | Estado | Dónde |
|---|---|---|
| Preparación del entorno y repositorios | Listo | [docs/GUIA_ENTORNO.md](docs/GUIA_ENTORNO.md) |
| Creación de la base de datos | Listo · esquema v3 | [database/](database/README.md) · `npm run db:instalar` |
| Pruebas de conectividad con base de datos | Listo · 24 verificaciones + 8 pruebas | `npm run db:conectividad` · `npm test` |
| Codificación de Iniciar sesión (autenticación) | Listo · 01 y 01b + 22 pruebas | [docs/AUTENTICACION.md](docs/AUTENTICACION.md) |

## Estructura

```
kitchenlink/
├── backend/            API REST · Node.js + Express
│   ├── src/
│   │   ├── seguridad/  inicio de sesión, sesiones, contraseñas, permisos
│   │   ├── rutas/      /api/salud, /api/usuarios
│   │   ├── app.js      aplicación Express
│   │   ├── db.js       pool de PostgreSQL y transacciones con usuario
│   │   └── server.js   punto de entrada
│   ├── scripts/        instalar la base, conectividad, comandos de usuarios
│   └── test/           pruebas automáticas (node:test + supertest)
├── frontend/           SPA · React + Vite (pantallas 01 y 01b)
├── database/           scripts SQL 00–04 (esquema v3)
├── infra/nginx/        servidor web y proxy inverso con HTTPS local
└── docs/               guía de entorno, autenticación y ERD v3
```

## Inicio rápido

Requisitos: Node.js 24 LTS (mínimo 20.19), PostgreSQL 16, Git.

```bash
npm install
npm run env:crear              # crea backend/.env; luego escribe DB_ADMIN_PASSWORD (contraseña de postgres)
npm run db:instalar            # base kitchenlink con el esquema v3 y datos de demostración
npm run db:conectividad        # pruebas de conectividad (genera reporte)
npm test                       # 30 pruebas automáticas
npm run dev                    # API en :3000 y app en http://localhost:5173
```

Entra con `lsaenz` / `Kitchen2026` (gerente) o `smendez` / `Temporal2026` (usuario nuevo: pide crear su contraseña).
Todos los usuarios de demostración están en [database/README.md](database/README.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y app en este equipo |
| `npm run dev:red` | Igual, y la app se abre desde otros equipos de la red local |
| `npm test` | Pruebas automáticas (usa la base `kitchenlink_pruebas`) |
| `npm run build` | Compila la app para Nginx (`frontend/dist`) |
| `npm run db:instalar [-- --recrear \| --sin-demo]` | Crea o actualiza la base |
| `npm run db:conectividad [-- --api URL]` | Verifica Backend ↔ PostgreSQL (y la API) |
| `npm run usuario:gerente -- <usuario> "<Nombre>"` | Primer gerente de una base vacía |
| `npm run usuario:restablecer -- <usuario>` | Contraseña temporal nueva desde el servidor |
