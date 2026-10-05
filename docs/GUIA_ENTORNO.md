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

No hace falta para el miércoles. Es la forma que describe la pantalla 11: una laptop hace de
**servidor** (Nginx + API + PostgreSQL) y la otra de **cliente**, que solo necesita un navegador.

```
Laptop cliente                      Laptop servidor
https://TU_IP  ── misma red ──▶  Nginx :443 ─┬─ app compilada (frontend/dist)
                                             └─ /api → Express 127.0.0.1:3000 → PostgreSQL
http://TU_IP   ── misma red ──▶  Nginx :80  → redirige a https://
```

A diferencia de `npm run dev`, aquí no corre Vite: Nginx entrega los archivos ya compilados y reenvía
`/api` a Express, que sigue escuchando solo en `127.0.0.1`. `TU_IP` es la IPv4 del Wi-Fi de la
laptop servidor (`ipconfig`; ignora la de "vEthernet (WSL)").

### 8.1 Preparación (una sola vez, en la laptop servidor)

1. **Nginx:** nginx.org → "Stable version" (zip para Windows). Descomprímelo en una ruta sin espacios
   ni acentos de modo que quede `C:\nginx\nginx.exe` (en esta guía, `C:\nginx`). No muevas la carpeta
   después: el permiso del firewall queda ligado a esa ruta.
2. **mkcert:** github.com/FiloSottile/mkcert → Releases → `mkcert-v1.4.4-windows-amd64.exe`. Renómbralo
   `mkcert.exe` y guárdalo en `C:\herramientas`. Luego, una sola vez:
   ```powershell
   C:\herramientas\mkcert.exe -install     # crea la autoridad local; acepta el aviso de Windows
   ```
3. **Certificado.** Córrelo **desde la carpeta del repo**: si lo corres en otra carpeta, los archivos
   se crean ahí y Nginx no los encuentra.
   ```powershell
   mkdir infra\nginx\certs                 # solo la primera vez
   C:\herramientas\mkcert.exe -cert-file infra\nginx\certs\kitchenlink.pem -key-file infra\nginx\certs\kitchenlink-key.pem localhost 127.0.0.1 TU_IP
   ```
   Cambia `TU_IP` por la IP real (no la de ejemplo). `infra/nginx/certs/` está en `.gitignore`: no se sube.
4. **Configura Nginx.** Guarda una copia de `C:\nginx\conf\nginx.conf` (p. ej. `nginx.conf.original`) y,
   dentro del bloque `http { }`:
   - **Borra el `server { listen 80; server_name localhost; … }` de ejemplo.** Si se queda, sale
     "Welcome to nginx!" en vez de la app.
   - Pega en su lugar los dos bloques `server` de `infra/nginx/kitchenlink.conf`.
   - Ajusta las tres rutas marcadas con `AJUSTA` a la carpeta de tu repo, con diagonales normales `/`:
     ```nginx
     ssl_certificate     C:/Proyectos/kitchenlink/infra/nginx/certs/kitchenlink.pem;
     ssl_certificate_key C:/Proyectos/kitchenlink/infra/nginx/certs/kitchenlink-key.pem;
     root                C:/Proyectos/kitchenlink/frontend/dist;
     ```
   - Deja el `include mime.types;` que ya viene al inicio de `http`: sin él, el navegador no ejecuta los `.js`.

   Comprueba la configuración (en PowerShell hay que anteponer `.\`):
   ```powershell
   cd C:\nginx
   .\nginx -t        # "syntax is ok" y "test is successful"
   ```
5. **Laptop cliente (opcional, una sola vez):** para que no salga "La conexión no es privada", copia
   `rootCA.pem` de la carpeta que indica `C:\herramientas\mkcert.exe -CAROOT` (por USB, Drive o WhatsApp:
   no es secreto). En la laptop cliente:
   ```powershell
   certutil -user -addstore Root rootCA.pem
   ```
   Acepta el aviso y reinicia el navegador. Sigue sirviendo aunque cambie la IP.
   **Nunca copies `rootCA-key.pem`** (está en la misma carpeta): con esa llave se pueden fabricar
   certificados falsos de cualquier sitio que la otra laptop aceptaría.
6. **Ensayen antes** todo el 8.2, en la misma red que van a usar el día de la presentación.

### 8.2 El día de la presentación

**Red:** las dos laptops en la misma red. No hace falta internet (la app no usa nada externo).
Usen el **hotspot de un celular**: las redes de escuelas y de invitados suelen impedir que los equipos
se vean entre sí. La laptop servidor, conectada a la corriente y sin que se suspenda.

En la laptop servidor:

1. `ipconfig` → anota la IPv4 del Wi-Fi. **Si es distinta a la del certificado**, repite solo el comando
   de mkcert del paso 8.1.3 con la IP nueva (no hace falta `-install` ni tocar la laptop cliente).
2. Si cambió algo del frontend desde la última vez: `npm run build`.
3. **API en modo producción**: terminal 1, en la carpeta del repo, y déjala abierta:
   ```powershell
   $env:NODE_ENV='production'; $env:COOKIE_SECURE='true'; npm start -w backend
   ```
   Debe decir `entorno: production` y `Base de datos: kitchenlink como kitchenlink_app ✓`.
   - `COOKIE_SECURE=true`: la cookie de sesión solo viaja por HTTPS.
   - `NODE_ENV=production`: los errores no muestran detalles internos.
   - Esas variables solo valen en esa ventana y tienen prioridad sobre `backend/.env`, así que
     **no hay que editar el `.env`**. Para volver a programar con `npm run dev`, usa otra terminal.
   - En "Símbolo del sistema": `set NODE_ENV=production`, `set COOKIE_SECURE=true` (cada uno en su
     línea) y luego `npm start -w backend`.
4. **Nginx**, en la terminal 2:
   ```powershell
   cd C:\nginx
   .\nginx -t
   start .\nginx.exe
   ```
   Si Windows pregunta por el Firewall, permite el acceso para el tipo de red que estén usando
   (una red nueva, como el hotspot, suele quedar como **Pública**).
5. Comprueba en la laptop servidor: `https://TU_IP/api/salud` → `"estado":"ok"` y `"entorno":"production"`.
   Usa la IP, no `https://localhost` (ver la tabla de abajo).

En la laptop cliente: abre `https://TU_IP` (si alguien escribe `http://`, Nginx lo manda a `https://`) y
entra, por ejemplo, con `dbenitez` / `Kitchen2026` (Jefe de cocina) mientras el servidor usa `lsaenz`
(Gerente): dos dispositivos con roles distintos.

**Plan B:** si la red falla, en la laptop servidor `https://127.0.0.1` funciona siempre (el certificado
incluye esa dirección).

### 8.3 Al terminar

```powershell
cd C:\nginx
.\nginx -s stop        # si falla: taskkill /IM nginx.exe /F
```

y `Ctrl+C` en la terminal de la API. Nginx **no** se detiene al cerrar la terminal: sigue en segundo
plano hasta `.\nginx -s stop` o hasta reiniciar la laptop, y mientras corre cualquier equipo de la
misma red puede abrir la pantalla de inicio de sesión. Tampoco arranca solo al encender la laptop.
Después de editar `nginx.conf` con Nginx corriendo: `.\nginx -s reload`.

### Problemas con Nginx

| Síntoma | Causa y solución |
|---|---|
| `nginx -t`: `cannot load certificate` | Ruta mal escrita o con `\`, o el certificado se creó fuera del repo (mkcert corrido en otra carpeta) |
| "Welcome to nginx!" | Quedó el `server` de ejemplo en `nginx.conf` |
| `500 Internal Server Error` | Falta `npm run build` o la ruta `root` está mal |
| `502 Bad Gateway` / "El servidor de KitchenLink no responde" | La API no está corriendo (8.2.3) |
| "La conexión no es privada" en la laptop servidor | La IP actual no está en el certificado: regéneralo (8.1.3) y `.\nginx -s reload` |
| "La conexión no es privada" en la laptop cliente | Falta instalar `rootCA.pem` (8.1.5), o acepten la advertencia |
| La laptop cliente no carga nada | No están en la misma red, la red aísla a los equipos (escuela, invitados) o el firewall lo bloquea: usen el hotspot |
| `bind() … failed` en `C:\nginx\logs\error.log` | Nginx ya estaba corriendo u otro programa usa el puerto 80/443: `.\nginx -s stop` y vuelve a arrancarlo |
| Después, `http://localhost:5173` se cambia solo a `https` | El navegador recordó HSTS (lo envía la API). En `chrome://net-internals/#hsts` → *Delete domain security policies* → `localhost` |

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
