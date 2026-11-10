# Cronograma en la aplicación · interruptor por fecha, reloj de demostración y tiempo real

Tres piezas que usan todos los módulos de operación (03a a 10).

## 1. Interruptor por fecha

Cada tarea de construcción del cronograma (ProjectLibre) es un módulo de la aplicación. **Un módulo aparece
el miércoles en que se revisa**: el primer miércoles a partir de que empieza su tarea (si empieza en
miércoles, ese mismo día). Antes de esa fecha:

- en el menú lateral, quien tiene el permiso lo ve como **"pronto"** (igual que antes con lo no construido);
- su pantalla no existe (la ruta regresa al inicio);
- su API responde **404 `NO_ENCONTRADO`**, como si no existiera.

| Se revisa | Tarea del cronograma | Pantallas |
|---|---|---|
| mié 14 oct | Iniciar sesión, Administrar roles y Administrar usuarios (siempre visible) | 01, 01b, 02a, 02b, 02c |
| mié 21 oct | Gestionar menú, categorías y productos (16–19 oct) | 09 |
| mié 21 oct | Crear mesa (21 oct) | 04 (catálogo de mesas) |
| mié 28 oct | Gestión de reservaciones y tiempos de espera (22–26 oct) | 03a, 03b |
| mié 28 oct | Operaciones de mesas: cambio de mesa o de personas, bloqueo (27–28 oct) | 04 (bloquear), 05a |
| mié 4 nov | Gestionar comanda (29 oct–3 nov) | 05a (abrir), 05b, Comandas |
| mié 4 nov | Consultar comandas pendientes y cambiar estado (4–6 nov) | 06 |
| mié 11 nov | Consultar historial de comandas (9–10 nov) | Comandas › Historial del día |
| mié 11 nov | Monitoreo de mesas (11–12 nov) | 04 (contadores, estados, detalle) |
| mié 18 nov | Gestión de pagos y cobro (13–18 nov) | 07, Cuentas abiertas |
| mié 25 nov | Historial de ventas: cortes de mesero y cortes Z (19–23 nov) | 08 |
| mié 25 nov | Supervisión y reportes (24–25 nov) | 10 |

"Gestionar modificadores" (20 oct) no está: el esquema v3 quitó los modificadores.

Algunas pantallas crecen por etapas. Por ejemplo, 04 Mesas el 21 oct es el catálogo (número, capacidad,
zona, "Crear mesa"); el 28 oct suma "Bloquear / desbloquear"; el 11 nov suma los contadores, los estados en
tiempo real y el detalle de cada tarjeta.

### Cómo se usa

```bash
npm run cronograma                 # qué se ve hoy
npm run cronograma -- 2026-10-28   # qué se verá en esa revisión
```

La fecha de corte es **hoy**: la fecha real en la zona horaria del restaurante, no la del reloj de
demostración. El miércoles a las 00:00 el módulo ya responde, sin reiniciar nada; una pantalla que ya estaba
abierta lo muestra en el menú al recargarla.

Para ensayar una revisión antes, o para ver todo, se elige al arrancar (solo vale para esa vez):

```bash
npm run demo:todo                          # todos los módulos (= FECHA_REVISION=2026-12-09)
npm run demo -- --fecha 2026-10-28         # lo que se verá en la revisión del 28 de octubre
npm run dev -- --todo                      # igual, con la hora real
```

También se puede fijar en `backend/.env` con `FECHA_REVISION=2026-10-28`, pero hay que acordarse de
dejarlo vacío antes de la revisión. Al arrancar, la API dice en la consola qué módulos tiene
(`Cronograma al 2026-10-28: seguridad, menu, mesas, …`).

Las pruebas automáticas corren con todo visible y el interruptor tiene sus propias pruebas.

Dónde vive: `backend/src/cronograma.js` (las tareas y sus fechas) y `exigirModulo(...)` en las rutas.
La sesión (`GET /api/auth/sesion`) incluye `modulos` y `revision`; el menú lateral (`Marco.jsx`) y las
rutas (`<Pantalla modulo="…">` en `App.jsx`) los usan.

## 2. Reloj de demostración

Los datos de demostración (`03_prueba_coherencia_v3.sql`) son del **martes 22 de septiembre a las 19:09**,
la hora que dibujan las pantallas. Con la hora real, esas comandas tendrían semanas abiertas y las
reservaciones ya habrían pasado. Con el reloj de demostración la aplicación arranca a esa hora y el tiempo
avanza desde ahí:

```
npm run demo        # = npm run dev, con el reloj de demostración (no hay que tocar el .env)
```

La hora está en `scripts/dev.mjs`, junto a la explicación de los datos. Para usarlo con otro comando (por
ejemplo `npm start` con Nginx), la misma hora va en la variable `RELOJ_INICIO=2026-09-22T19:09:00-06:00`;
`RELOJ_CORRE=false` deja el reloj detenido (sirve para comparar con el PDF del diseño).

Sin él (`npm run dev`, o `npm start` en el restaurante) es la hora real. La base ya estaba preparada para esto:
`fn_ahora()` lee `kitchenlink.ahora`; `db.js` la fija en cada consulta con la hora de `reloj.js`. Cada
respuesta de la API trae el encabezado `X-Ahora` y las pantallas cuentan los minutos con esa hora (no con
el reloj de cada tablet). La sesión (cookie y JWT) siempre vence con la hora real. El proceso de cada minuto
(`fn_revisar_reservaciones`) también usa este reloj: a las 19:16, Roberto Díaz pasa solo a "No se presentó".
Ese proceso solo corre desde la revisión de Reservaciones (28 oct): antes, el módulo no existe.

**Ojo:** si los datos de demostración se abren con `npm run dev` (hora real) desde el 28 oct, ese proceso
marca todas las reservaciones del 22 de septiembre como "No se presentó", y no se deshace al volver a
`npm run demo`. Para regresar a los datos originales: `npm run db:instalar -- --recrear`.

## 3. Tiempo real (Socket.IO)

Pantalla 11: "Socket.IO envía los cambios de estado de comandas a cocina, barra y meseros al instante".
Cuando algo cambia, el servidor avisa **qué** cambió (`comandas`, `produccion`, `mesas`, `caja`, `menu`,
`reservaciones`, `espera`) y cada pantalla abierta vuelve a pedir sus datos a la API. Si se pierde la
conexión, las pantallas se refrescan solas cada 20 a 60 s. El panel de cocina hace un "ding" cuando llega un
envío nuevo. Nginx ya tenía el `location /socket.io/`; Vite lo pasa al backend en desarrollo.

## Decisiones (y por qué)

**Por fecha y no con ramas de Git.** Todo el código está en el repositorio desde el principio, pero cada
módulo se muestra el día que el cronograma dice que se revisa. Un solo lugar (`cronograma.js`) decide qué
se ve, con las mismas fechas de ProjectLibre; no hay que mantener ramas ni copiar cambios entre ellas.

**El interruptor está en el servidor.** Si solo se escondiera en el menú, la API seguiría respondiendo. Con
`exigirModulo` la ruta no existe antes de su fecha (404), igual que cuando no estaba construida.

**Lo que empieza en miércoles se revisa ese miércoles.** Es la regla que ya usamos para el 14 oct
(Administrar usuarios, 14–15 oct, entró en esa revisión).

**El reloj de demostración usa `fn_ahora()`**, que el esquema v3 ya tenía para las pruebas. No se cambió
ninguna tabla ni trigger.

**El aviso en tiempo real no lleva datos.** Solo dice qué tema cambió; la pantalla vuelve a pedir los
datos a la API, que revisa la sesión y los permisos. Así un aviso nunca entrega algo que la persona no
podría consultar. Solo se conectan dispositivos con sesión (la misma cookie).

*Pregunta probable: "¿por qué ya está el código de módulos que se revisan después?"* Se construyó antes;
la aplicación los muestra en la fecha del cronograma para revisarlos en su orden, uno por miércoles.
`npm run cronograma` dice qué se ve en cada fecha.

*Pregunta probable: "¿por qué la hora de la app es el 22 de septiembre?"* Porque así los datos de
demostración se ven como las pantallas del diseño (`npm run demo`). En el restaurante se usa la hora real.

**El reloj se elige con el comando y no se adivina.** La API podría deducir la hora de los datos (el último
movimiento en la base), pero entonces una comanda olvidada en el restaurante movería el reloj de todos. Con
`npm run demo` frente a `npm run dev` siempre queda claro cuál se usa, y la consola lo dice al arrancar.

## Pruebas automáticas (`npm test`)

`backend/test/cronograma.test.js` — 6 pruebas: el primer miércoles de cada tarea, qué se ve en cada
revisión, la API responde 404 antes de su fecha y la sesión no anuncia el módulo, `X-Ahora` en cada
respuesta, la base vive a la hora de las pantallas, y el reloj que corre sin que la sesión deje de vencer
con la hora real.

`backend/test/tiempoReal.test.js` — 8 pruebas con dispositivos conectados de verdad (`socket.io-client`):
sin sesión, con una cookie alterada, con la contraseña temporal o después de cerrar sesión no se conecta;
cuando el mesero abre, envía o pide la cuenta, cocina y caja reciben el aviso, sin datos (solo el tema y la
hora); una operación rechazada no avisa; el proceso de cada minuto avisa cuando vence una reservación; y
cada tema que escucha una pantalla existe y alguien lo avisa.

Las pruebas de pantalla (`npm run e2e`, ver [e2e/README.md](../e2e/README.md)) revisan el tiempo real en el
navegador: la tarjeta le aparece a cocina y la cuenta a caja sin recargar.
