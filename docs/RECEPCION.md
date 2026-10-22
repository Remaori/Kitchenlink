# Recepción: reservaciones y lista de espera (pantallas 03a y 03b)

Caso de uso **Gestión de reservaciones y tiempos de espera**. Permiso: «Gestionar reservaciones y lista de
espera» (hostess y gerente).

```
03a Reservaciones ── agenda del día (Hoy, 22 sep / otra fecha) · Ahora: 19:09
   ├─ Nueva reservación ── fecha, hora, personas, mesa, nombre, teléfono, solicitudes
   │     "Mesa 11 quedará apartada de 20:30 a 23:00 · si no llegan antes de las 21:15 se libera"
   ├─ Por confirmar ── Confirmar ──► Confirmada (aparta la mesa 30 min antes)
   ├─ Confirmada / En tolerancia ── Marcar llegada ──► Sentada · la mesa queda Por atender
   ├─ Tocar el nombre ── editar o cancelar la reservación
   └─ No se presentó (sola, al pasar la tolerancia) ── "Llegó tarde" ──► entra a la lista de espera
03b Lista de espera ── en orden de llegada · "Esperando 15 min · Estimado: mesa en ~5 min"
   ├─ Agregar ── nombre, personas, teléfono (opcional), nota y espera estimada (opcionales)
   ├─ Asignar mesa ── primero las libres de su tamaño sin reservación próxima ──► Por atender
   └─ Retirar ── se fue sin mesa
```

## Rutas de la API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/reservaciones?fecha=AAAA-MM-DD` | Agenda del día, resumen y la configuración (tolerancia, duración, apartado) |
| `GET /api/reservaciones/mesas?fecha&hora&personas` | Mesas para el formulario: cuáles caben y con qué reservación se empalman |
| `POST /api/reservaciones` · `PUT /api/reservaciones/:id` | `{ fecha, hora, numero_personas, mesa_id, nombre_cliente, telefono, solicitudes_especiales }` |
| `POST /api/reservaciones/:id/confirmar` · `/llegada` · `/cancelar` | Cambios de estado |
| `POST /api/reservaciones/:id/lista-espera` | Llegó tarde: entra a la lista de espera (`reservacion_origen_id`) |
| `GET /api/lista-espera` | Quién espera, espera promedio de hoy y el salón para asignar |
| `POST /api/lista-espera` · `/:id/asignar` · `/:id/retirar` | Agregar, asignar `{ mesa_id }`, retirar |

## Decisiones (y por qué)

**Las reglas viven en la base** (pantalla 12): la reservación es para una hora futura, no se empalma con
otra en la misma mesa, la mesa se aparta 30 min antes y se libera sola si no llegan en 15 min, y una mesa
apartada no se le da a la lista de espera. La pantalla muestra el mensaje de la base tal cual (por ejemplo
"La mesa 04 está apartada para Roberto Díaz (19:00): las reservaciones tienen prioridad…").

**Una reservación nueva queda Por confirmar**, como dice la explicación de 03a ("pasa de Por confirmar a
Confirmada y luego a Sentada"). Mientras está por confirmar ya ocupa su horario (nadie más reserva esa mesa
a esa hora), pero la mesa no se ve Reservada hasta confirmarla.

**"En tolerancia" no se guarda: se calcula** con el reloj (`v_reservaciones`), igual que los minutos que
faltan. Las pantallas cuentan con la hora del servidor, no con la de cada tablet.

**El proceso de cada minuto** (`fn_revisar_reservaciones`, en `server.js`) marca "No se presentó" y aparta
las mesas que entran en su ventana. Las pantallas de recepción se actualizan solas cada 30 s.

**Llegó tarde = lista de espera.** "Llegó tarde" crea su lugar en la lista con la reservación de origen
(sale como "Venía con reservación").

**El formulario sugiere la mesa**: la más chica que quepa, sin empalmes y, si se puede, libre en este
momento. Las que no sirven aparecen deshabilitadas con el motivo.

**Espera estimada**: la escribe la hostess (opcional), porque ella ve el salón; la pantalla descuenta lo
que ya lleva esperando. La espera promedio de hoy sale de los grupos que ya se sentaron.

**Los datos se revisan como datos** (como el número de mesa):
- **Nombre del cliente:** solo letras, espacios, punto, apóstrofo y guion, con al menos 2 letras ("12345" o
  "Mesa 4" no son nombres).
- **Teléfono:** 10 dígitos, con espacios, guiones o paréntesis si se quiere, y +52 opcional. Se guarda siempre
  igual: "(55) 8765-4321" queda "55 8765 4321". "+++++++" ya no pasa.
- **Personas y espera estimada:** enteros. Un campo numérico del navegador deja escribir "1e1" o "2.5"; la API
  los rechaza en lugar de convertirlos.
- **Fecha:** que exista en el calendario (el 31 de febrero no) y hasta un año adelante. Antes, una fecha
  inexistente llegaba a la base y respondía "error del servidor".

**Dos hostess reservan la misma mesa al mismo tiempo:** la base bloquea la fila de la mesa mientras revisa
(`FOR UPDATE`): la segunda espera y recibe "La mesa 11 ya está apartada…".

## Pendiente

- **"Se ajustan en Configuración"**: el diseño no tiene pantalla de configuración. Los valores (tolerancia,
  duración, apartado, IVA, propina) están en la tabla `configuracion`.

## Pruebas automáticas (`npm test`)

`backend/test/recepcion.test.js` — 18 pruebas: agenda de las 19:09 (6 reservaciones · 27 personas, estados,
"Faltan 6 min"), otra fecha, mesas para el formulario, nueva reservación con su ventana, empalmes / hora
pasada / no cabe, validaciones, datos que parecen válidos y no lo son (nombre con números, teléfono sin
dígitos, 31 de febrero, "1e1" personas, una fecha a 9999), confirmar y cancelar, marcar llegada, permisos, lista de espera (orden,
tiempos, "sin teléfono", promedio), agregar, asignar con prioridad de la reservación y tamaño, retirar, y
el cliente que llega tarde (19:16) y pasa a la lista. Al mismo tiempo: dos hostess sientan a dos grupos en la
misma mesa (se sienta uno) y una reservación en una mesa que el gerente está dando de baja (se rechaza).
