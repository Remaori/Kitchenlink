# Guía de entorno y repositorio · KitchenLink

Cubre las tareas del cronograma **Preparación del entorno y repositorios**, **Creación de la base de datos**
y **Pruebas de conectividad con base de datos**. Está escrita para Windows 10/11; al final hay notas para
el servidor Ubuntu que describe la arquitectura.

Tiempo estimado: 1 hora la primera vez, por persona.

---

## 1. Instalar las herramientas (cada quien en su laptop)

| Herramienta | Versión | Dónde | Notas |
|---|---|---|---|
| Node.js | **24 LTS** (mínimo 20.19) | nodejs.org → "LTS" → Windows Installer (.msi) | Deja **sin marcar** "Automatically install the necessary tools": no hace falta |
| PostgreSQL | **16.x** | enterprisedb.com → PostgreSQL downloads → 16.x Windows x86-64 | Marca *PostgreSQL Server*, *pgAdmin 4* y *Command Line Tools*. Puerto **5432**. Anota la contraseña de `postgres` |
| Git | la más reciente | git-scm.com → Download for Windows | Opciones por defecto (incluye Git Credential Manager) |
| VS Code | la más reciente | code.visualstudio.com | Al abrir el proyecto sugiere las extensiones recomendadas |

> **Sobre Node.js 20:** la pantalla 11 dice "Node.js 20", pero Node 20 dejó de recibir
> parches de seguridad el 30 de abril de 2026. Recomendamos instalar la 24 LTS y cambiar
> ese texto en Figma a "Node.js 24 LTS". El código funciona con 20.19 o superior, por si
> deciden no cambiarlo.

Comprueba en una terminal nueva (PowerShell o "Símbolo del sistema"):

```powershell
node -v        # v24.x
npm -v
git --version
```

**Si PowerShell dice** `npm.ps1 no se puede cargar porque la ejecución de scripts está deshabilitada`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

(o usa "Símbolo del sistema" en lugar de PowerShell).

Configura Git una sola vez:

```powershell
git config --global user.name "Luis Antonio Sáenz Jiménez"
git config --global user.email "tu-correo@ejemplo.com"     # el mismo de tu cuenta de GitHub
git config --global init.defaultBranch main
```

---

## 2. Crear el repositorio en GitHub (lo hace una persona: Luis)

1. En github.com → **New repository**.
   - Nombre: `kitchenlink`
   - **Private** (o Public si el profesor lo pide)
   - **No** marques "Add a README", ".gitignore" ni licencia: el proyecto ya los trae.
2. **Settings → Collaborators → Add people**: agrega a Diego (y al profesor si lo pide).
3. **Settings → Branches → Add branch ruleset / protection rule** para `main`:
   "Require a pull request before merging" con 1 aprobación.
   *En repositorios privados de cuentas gratuitas GitHub a veces no permite esta regla; con el
   GitHub Student Developer Pack (gratis para estudiantes) sí. Si no se puede, acuerden no
   subir directo a `main`.*

### Subir el código por primera vez

Descomprime `kitchenlink.zip` en una ruta corta y sin espacios, por ejemplo `C:\Proyectos\kitchenlink`.

```powershell
cd C:\Proyectos\kitchenlink
git init -b main
git status        # backend/.env NO debe aparecer (todavía no existe y está en .gitignore)
```

Súbelo en commits por partes (se ve mejor en el historial que un solo commit gigante):

```powershell
git add .gitignore .gitattributes .editorconfig .nvmrc .vscode package.json package-lock.json scripts README.md docs
git commit -m "chore: estructura del repositorio y guía de entorno"

git add database
git commit -m "feat(bd): esquema v3, permisos mínimos y datos de demostración"

git add backend
git commit -m "feat(api): Express, conectividad con PostgreSQL e inicio de sesión (JWT + bcrypt)"

git add frontend infra
git commit -m "feat(web): pantallas 01 y 01b; configuración de Nginx con HTTPS"

git remote add origin https://github.com/TU_USUARIO/kitchenlink.git
git push -u origin main
```

La primera vez que hagas `push` se abre el navegador para iniciar sesión en GitHub.

### Diego: clonar

Acepta la invitación (llega por correo o en github.com/notifications) y:

```powershell
cd C:\Proyectos
git clone https://github.com/TU_USUARIO/kitchenlink.git
cd kitchenlink
```

---

## 3. Instalar dependencias y configurar (cada quien)

```powershell
npm install            # instala backend y frontend (workspaces)
npm run env:crear      # crea backend/.env con JWT_SECRET y DB_PASSWORD al azar
```

Abre `backend/.env` y escribe en `DB_ADMIN_PASSWORD` la contraseña de `postgres` que pusiste al
instalar PostgreSQL. Nada más. **El `.env` nunca se sube**: cada laptop tiene el suyo.

---

## 4. Crear la base de datos (cada quien)

```powershell
npm run db:instalar
```

Debe terminar con:

```
✓ 03_prueba_coherencia_v3.sql · 168 pruebas → TODO CORRECTO
```

y la tabla de usuarios de demostración (contraseña `Kitchen2026`; `smendez` tiene la temporal `Temporal2026`).

**Si ya tenías una base `kitchenlink`** de las pruebas anteriores, el script la reutiliza y te avisa si
está en WIN1252. En ese caso recréala en UTF8 (cierra antes las pestañas de pgAdmin abiertas sobre ella):

```powershell
npm run db:instalar -- --recrear
```

Para verla en pgAdmin: Servers → PostgreSQL 16 → Databases → kitchenlink → Schemas → kitchenlink.

---

## 5. Pruebas de conectividad (cada quien)

```powershell
npm run db:conectividad     # 24 verificaciones; guarda el reporte en backend/reportes/
npm test                    # 30 pruebas automáticas (conectividad + inicio de sesión)
```

`npm test` crea y usa una base aparte, `kitchenlink_pruebas`; no toca tus datos.

Qué comprueba `db:conectividad`: conexión y autenticación del rol `kitchenlink_app`, que rechace una
contraseña incorrecta, versión 16, UTF8, zona horaria, esquema v3 completo (19 tablas, 22 vistas,
10 ENUM, 27 triggers), **permisos mínimos** (no puede crear/borrar tablas, ni tocar bitácora, pagos o
cancelaciones), que los triggers se apliquen a la aplicación, que el usuario de una petición no se
"filtre" a otra en el pool, 30 consultas simultáneas y, si el servidor está iniciado, `GET /api/salud`.

---

## 6. Levantar la aplicación

```powershell
npm run dev
```

- API: http://localhost:3000/api/salud
- App: http://localhost:5173 → entra con `lsaenz` / `Kitchen2026`

Con el servidor iniciado, en otra terminal `npm run db:conectividad` ya incluye la prueba de la API.

### Desde la otra laptop (red local)

Así se prueba lo que pide la arquitectura: los dispositivos llegan al servidor por la red local.

En la laptop **servidor**:

```powershell
npm run dev:red
ipconfig           # anota la "Dirección IPv4", p. ej. 192.168.1.50
```

- Si Windows pregunta por el Firewall para Node.js, permite **Redes privadas**.
- Si están en el hotspot del celular, en Windows ve a Configuración → Red → (la red) → **Red privada**.

En la laptop **cliente** (no necesita tener nada instalado):

- Navegador: `http://192.168.1.50:5173/api/salud` → debe decir `"estado":"ok"` y la base `"conectada"`.
- Navegador: `http://192.168.1.50:5173` → inicia sesión.
- En pgAdmin del servidor, `SELECT direccion_ip, dispositivo FROM kitchenlink.sesion ORDER BY id DESC LIMIT 1;`
  muestra la IP de la laptop cliente.

PostgreSQL **no** se abre a la red: solo Express (en el mismo equipo) se conecta a la base.

---

## 7. Cómo trabajar en equipo

- `main` siempre funciona. Cada tarea en su rama: `feat/usuarios`, `fix/login-mensaje`, `docs/casos-de-uso`.
- Antes de empezar: `git switch main` → `git pull` → `git switch -c feat/lo-que-sea`.
- Commits chicos con prefijo: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Al terminar: `git push -u origin feat/lo-que-sea` → Pull Request en GitHub → el otro lo revisa → *Merge*.
- Antes de pedir revisión: `npm test` en verde.
- Para la revisión del miércoles, una etiqueta:
  `git tag -a v0.1.0 -m "Revisión: entorno, BD, conectividad e inicio de sesión"` y `git push --tags`.

Sugerencia: que Diego suba su reporte de conectividad (`backend/reportes/conectividad-….md`, copiado a
`docs/evidencias/`) desde su laptop en un Pull Request. Así queda evidencia de las pruebas en las dos
máquinas y de que los dos trabajan en el repositorio.

---

## 8. Presentación con Nginx y HTTPS (cuando se acerque la entrega final)

No hace falta para el miércoles. Es la forma que describe la pantalla 11.

1. Descarga Nginx para Windows (nginx.org → "Stable version", zip) y descomprímelo en `C:\nginx`.
2. Certificado local con mkcert (github.com/FiloSottile/mkcert → Releases → `mkcert-…-windows-amd64.exe`):
   ```powershell
   mkcert -install
   mkcert -cert-file infra\nginx\certs\kitchenlink.pem -key-file infra\nginx\certs\kitchenlink-key.pem localhost 127.0.0.1 192.168.1.50
   ```
   (usa la IP real del servidor). En la laptop cliente instala el archivo `rootCA.pem`
   (`mkcert -CAROOT` dice dónde está) o acepta la advertencia del navegador.
3. `npm run build` (genera `frontend/dist`).
4. Copia los dos bloques `server` de `infra/nginx/kitchenlink.conf` dentro de `http { }` en
   `C:\nginx\conf\nginx.conf` y ajusta las tres rutas marcadas con `AJUSTA`.
5. En `backend/.env`: `COOKIE_SECURE=true` y `NODE_ENV=production`. Inicia la API con `npm start -w backend`.
6. `cd C:\nginx` → `start nginx`. Abre `https://192.168.1.50` desde la otra laptop.
   (Recargar configuración: `nginx -s reload`; detener: `nginx -s stop`.)

### Servidor Ubuntu (como dice la arquitectura)

`sudo apt install nginx postgresql-16` (PostgreSQL 16 viene en Ubuntu 24.04), Node 24 desde nodesource o
nvm, la configuración en `/etc/nginx/sites-available/kitchenlink` con rutas `/opt/kitchenlink/…`, y la API
como servicio de systemd. Se documenta cuando lleguen a esa tarea.

---

## Problemas comunes

| Mensaje | Causa y solución |
|---|---|
| `password authentication failed for user "postgres"` | `DB_ADMIN_PASSWORD` no es la contraseña de `postgres` |
| `ECONNREFUSED` / "PostgreSQL no responde" | El servicio no está iniciado: Servicios de Windows → `postgresql-x64-16` → Iniciar |
| `database "kitchenlink" is being accessed by other users` | Cierra las pestañas de pgAdmin sobre esa base y repite |
| `Falta configurar en backend/.env: JWT_SECRET` | Ejecuta `npm run env:crear` (o borra el `.env` y repítelo) |
| `Port 5173 is in use` / `EADDRINUSE :3000` | Ya hay otra copia corriendo: ciérrala (Ctrl+C) |
| Desde la otra laptop no carga | Firewall de Windows o red marcada como Pública (ver sección 6) |
