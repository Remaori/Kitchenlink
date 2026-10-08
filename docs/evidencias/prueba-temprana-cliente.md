# Prueba temprana de validación · desde la laptop cliente

Segunda ejecución de [PRUEBA_TEMPRANA_VALIDACION.md](../PRUEBA_TEMPRANA_VALIDACION.md), ahora como en el
restaurante: una laptop es el **servidor** (API + base de datos) y la otra es el **cliente**, que solo usa el
navegador y llega al servidor por la red local.

> Esta hoja la llena quien ejecuta la prueba en la laptop cliente. En **Obtenido** escribe lo que viste,
> con tus palabras; en **Resultado**, `PASA` o `FALLA`. Si algo no sale como dice **Esperado**, es `FALLA`:
> descríbelo tal cual, eso es lo que sirve.

| | |
|---|---|
| Fecha | |
| Ejecutó (laptop cliente) | |
| Laptop cliente · sistema y navegador | |
| Laptop servidor · IP y modo (`npm run dev:red` o Nginx con HTTPS) | |
| Hora de inicio · hora de fin | |

## Antes de empezar

**Laptop servidor:**

```powershell
npm run db:instalar -- --recrear     # datos de demostración desde cero
npm run dev:red                      # o Nginx (docs/GUIA_ENTORNO.md, sección 8)
ipconfig                             # IPv4 del Wi-Fi
```

**Laptop cliente:** abre `http://IP_DEL_SERVIDOR:5173` (con Nginx: `https://IP_DEL_SERVIDOR`) y comprueba
que `…/api/salud` diga `"estado":"ok"`.

**Capturas:** `Win + Shift + S`, recorta, pega en Paint y guarda como
`docs/evidencias/prueba-temprana-cliente/PV-01.png` (una por caso, con su ID).

Haz los casos **en orden**: algunos cambian datos que usan los siguientes.

---

## Iniciar sesión (01 y 01b)

### PV-01 · Entrada correcta
- **Pasos (cliente):** entra con `lsaenz` / `Kitchen2026`.
- **Esperado:** Inicio dice "Hola, Luis", "17 permisos…" y el menú tiene "Usuarios y roles".
- **Obtenido:**
- **Resultado:**

### PV-02 · Contraseña incorrecta
- **Pasos (cliente):** cierra sesión; entra con `lsaenz` / `Equivocada1`.
- **Esperado:** "Usuario o contraseña incorrectos." y el campo de contraseña se vacía.
- **Obtenido:**
- **Resultado:**

### PV-03 · Usuario que no existe
- **Pasos (cliente):** `no_existe` / `Equivocada1`.
- **Esperado:** exactamente el mismo mensaje que PV-02 (no revela si el usuario existe).
- **Obtenido:**
- **Resultado:**

### PV-04 · Cuenta dada de baja
- **Pasos (cliente):** `jvega` / `Kitchen2026`.
- **Esperado:** no entra: "Tu cuenta está dada de baja. Si es un error, habla con el gerente."
- **Obtenido:**
- **Resultado:**

### PV-05 · Demasiados intentos (por equipo)
- **Pasos:** en el **cliente**, escribe 5 veces una contraseña incorrecta para `aruiz`; al sexto intento usa la
  correcta (`Kitchen2026`). Luego, en el **servidor**, entra con `aruiz` / `Kitchen2026`.
- **Esperado:** en el cliente, "Demasiados intentos fallidos. Espera N min…" aunque la última sea correcta.
  En el servidor sí entra: el bloqueo es solo para ese usuario en ese equipo.
- **Obtenido:**
- **Resultado:**

### PV-06 · Primer inicio de un usuario Pendiente
- **Pasos (cliente):** `smendez` / `Temporal2026`; en la pantalla nueva escribe `Sofia2026` dos veces y
  presiona "Guardar y entrar".
- **Esperado:** pantalla "Crea tu contraseña"; las tres reglas se ponen en verde; entra a "Hola, Sofía".
- **Obtenido:**
- **Resultado:**

### PV-07 · Contraseña restablecida por el gerente
- **Pasos:** en el **servidor**, como `lsaenz`: Usuarios y roles → fila de Carlos Ruiz → "Restablecer
  contraseña" → confirma y dicta la temporal. En el **cliente**: cierra sesión, entra con `cruiz` y la
  temporal; después escribe `/usuarios` al final de la dirección y presiona Enter.
- **Esperado:** "Crea tu nueva contraseña · El gerente restableció tu contraseña"; `/usuarios` lo regresa a
  la misma pantalla.
- **Obtenido:**
- **Resultado:**

### PV-08 · 01b no acepta la misma temporal
- **Pasos (cliente, sigue en la pantalla de PV-07):** escribe la contraseña temporal en los dos campos y
  presiona "Guardar y entrar". Después escribe `Carlos2026` en los dos y guarda.
- **Esperado:** con la temporal: "La nueva contraseña debe ser distinta de la temporal."; con `Carlos2026`
  entra a "Hola, Carlos".
- **Obtenido:**
- **Resultado:**

### PV-09 · Cerrar sesión
- **Pasos (cliente):** presiona "Cerrar sesión" y luego el botón Atrás del navegador.
- **Esperado:** se queda en Iniciar sesión; no regresa a la aplicación.
- **Obtenido:**
- **Resultado:**

### PV-10 · Lo que guarda el servidor
- **Pasos:** en el **servidor**, en pgAdmin (base `kitchenlink`):
  `SELECT direccion_ip, dispositivo FROM kitchenlink.sesion ORDER BY id DESC LIMIT 3;` y
  `SELECT contrasena_hash FROM kitchenlink.usuario WHERE nombre_usuario = 'cruiz';`.
  En el **cliente**: `F12` → Aplicación → Cookies → `kl_sesion`.
- **Esperado:** las sesiones muestran la IP de la laptop cliente y su navegador; el hash empieza con `$2`
  (bcrypt, nunca la contraseña); la cookie tiene marcado HttpOnly.
- **Obtenido:**
- **Resultado:**

---

## Administrar roles (02c) · en el cliente como `lsaenz`

### PV-11 · Roles y casillas
- **Pasos:** entra con `lsaenz` / `Kitchen2026` → Usuarios y roles → Roles y permisos → Mesero.
- **Esperado:** 6 roles con sus usuarios; Mesero: "3 de 17 permisos activos" y "4 usuarios con este rol";
  7 módulos con su contador.
- **Obtenido:**
- **Resultado:**

### PV-12 · Nuevo rol
- **Pasos:** "Nuevo rol" → nombre `Supervisor de piso`, marca "Ver el estado de las mesas" y
  "Consultar reportes" → "Crear rol".
- **Esperado:** aparece en la lista con "0 usuarios" y "2 de 17 permisos activos".
- **Obtenido:**
- **Resultado:**

### PV-13 · Nombre repetido
- **Pasos:** "Nuevo rol" → nombre `MESERO` → "Crear rol". Después "Cancelar" y "Descartar".
- **Esperado:** "Ya existe el rol «Mesero»." debajo del campo.
- **Obtenido:**
- **Resultado:**

### PV-14 · Guardar casillas
- **Pasos:** Hostess → desmarca "Crear y bloquear mesas", marca "Consultar reportes" → "Guardar cambios".
- **Esperado:** "3 de 17 permisos activos" y el aviso "Se guardaron los cambios del rol Hostess."
- **Obtenido:**
- **Resultado:**

### PV-15 · Cambios sin guardar
- **Pasos:** en Hostess desmarca "Ver el estado de las mesas" y, sin guardar, haz clic en Cajera →
  "Descartar". Vuelve a Hostess.
- **Esperado:** pregunta "¿Descartar los cambios?"; al volver, la casilla sigue marcada.
- **Obtenido:**
- **Resultado:**

### PV-16 · El cambio llega sin volver a entrar (dos equipos)
- **Pasos:** en el **servidor**, entra con `alopez` / `Kitchen2026` (Hostess). En el **cliente**, marca
  "Administrar roles y permisos" en Hostess y guarda. En el **servidor**, recarga la página (`F5`) y entra a
  "Usuarios y roles". Después, en el **cliente**, desmarca esa casilla y guarda; en el **servidor**, haz clic
  en "Inicio".
- **Esperado:** tras recargar, Ana ve "Usuarios y roles" y entra a Roles y permisos sin volver a iniciar
  sesión; al quitar la casilla y hacer clic en "Inicio", la opción desaparece de su menú.
- **Obtenido:**
- **Resultado:**

### PV-17 · El rol Gerente está protegido
- **Pasos:** elige Gerente.
- **Esperado:** candado "Sistema"; las 17 casillas y el nombre no se pueden cambiar; "Dar de baja rol"
  deshabilitado.
- **Obtenido:**
- **Resultado:**

### PV-18 · Un rol con usuarios no se da de baja
- **Pasos:** elige Mesero.
- **Esperado:** "Dar de baja rol" deshabilitado y el aviso "No se puede dar de baja este rol mientras tenga
  usuarios asignados."
- **Obtenido:**
- **Resultado:**

### PV-19 · Dar de baja y reactivar un rol
- **Pasos:** Encargado de barra → "Dar de baja rol" → confirma. Ve a Usuarios → "Nuevo usuario" y abre el
  selector de Rol. Regresa a Roles y permisos → Encargado de barra → "Reactivar rol".
- **Esperado:** queda "Dado de baja" al final de la lista; no aparece en el selector de rol; se reactiva.
- **Obtenido:**
- **Resultado:**

### PV-20 · Un rol sin el permiso no entra
- **Pasos:** cierra sesión; entra con `lmora` / `Kitchen2026`; escribe `/roles` al final de la dirección.
- **Esperado:** el menú no tiene "Usuarios y roles"; la pantalla dice "Sin acceso".
- **Obtenido:**
- **Resultado:**

---

## Pruebas automáticas en la laptop cliente (opcional)

Si tu laptop tiene el entorno de `docs/GUIA_ENTORNO.md` (PostgreSQL y `backend/.env`):
`npm install` y `npm test`. Anota el total que aparece al final (`ℹ tests`, `ℹ pass`, `ℹ fail`):

- **Obtenido:**

## Resumen

- Casos: 20 · pasan: · fallan:
- **Observaciones** (lo que te pareció confuso, lento o distinto al diseño, aunque haya pasado):

## Cómo entregarla

```powershell
git switch -c docs/prueba-temprana-cliente
git add docs/evidencias/
git commit -m "docs: prueba temprana desde la laptop cliente"
git push -u origin docs/prueba-temprana-cliente
```

Luego, en GitHub: botón **Compare & pull request** → **Create pull request**.
