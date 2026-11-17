# Reloj de demostración y tiempo real

Dos piezas que usan todos los módulos de operación.

## 1. Reloj de demostración

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

**Ojo:** si los datos de demostración se abren con `npm run dev` (hora real), ese proceso
marca todas las reservaciones del 22 de septiembre como "No se presentó", y no se deshace al volver a
`npm run demo`. Para regresar a los datos originales: `npm run db:instalar -- --recrear`.

## 2. Tiempo real (Socket.IO)

Pantalla 11: "Socket.IO envía los cambios de estado de comandas a cocina, barra y meseros al instante".
Cuando algo cambia, el servidor avisa **qué** cambió (`comandas`, `produccion`, `mesas`, `caja`, `menu`,
`reservaciones`, `espera`) y cada pantalla abierta vuelve a pedir sus datos a la API. Si se pierde la
conexión, las pantallas se refrescan solas cada 20 a 60 s. El panel de cocina hace un "ding" cuando llega un
envío nuevo. Nginx ya tenía el `location /socket.io/`; Vite lo pasa al backend en desarrollo.

## Decisiones (y por qué)

**El reloj de demostración usa `fn_ahora()`**, que el esquema v3 ya tenía para las pruebas. No se cambió
ninguna tabla ni trigger.

**El aviso en tiempo real no lleva datos.** Solo dice qué tema cambió; la pantalla vuelve a pedir los
datos a la API, que revisa la sesión y los permisos. Así un aviso nunca entrega algo que la persona no
podría consultar. Solo se conectan dispositivos con sesión (la misma cookie).

*Pregunta probable: "¿por qué la hora de la app es el 22 de septiembre?"* Porque así los datos de
demostración se ven como las pantallas del diseño (`npm run demo`). En el restaurante se usa la hora real.

**El reloj se elige con el comando y no se adivina.** La API podría deducir la hora de los datos (el último
movimiento en la base), pero entonces una comanda olvidada en el restaurante movería el reloj de todos. Con
`npm run demo` frente a `npm run dev` siempre queda claro cuál se usa, y la consola lo dice al arrancar.

## Pruebas automáticas (`npm test`)

Las del reloj: `X-Ahora` en cada respuesta, la base vive a la hora de las pantallas, y el reloj que corre
sin que la sesión deje de vencer con la hora real.

`backend/test/tiempoReal.test.js` — 8 pruebas con dispositivos conectados de verdad (`socket.io-client`):
sin sesión, con una cookie alterada, con la contraseña temporal o después de cerrar sesión no se conecta;
cuando el mesero abre, envía o pide la cuenta, cocina y caja reciben el aviso, sin datos (solo el tema y la
hora); una operación rechazada no avisa; el proceso de cada minuto avisa cuando vence una reservación; y
cada tema que escucha una pantalla existe y alguien lo avisa.

Las pruebas de pantalla (`npm run e2e`, ver [e2e/README.md](../e2e/README.md)) revisan el tiempo real en el
navegador: la tarjeta le aparece a cocina y la cuenta a caja sin recargar.
