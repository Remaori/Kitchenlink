# Comandas, cocina y barra (pantallas 05a, 05b y 06) e historial de comandas

| Se revisa | Tarea del cronograma | Qué agrega |
|---|---|---|
| mié 4 nov | **Gestionar comanda** (29 oct–3 nov) | 05a · Abrir comanda · 05b · Comanda · Comandas (abiertas) |
| mié 4 nov | **Consultar comandas pendientes y cambiar estado** (4–6 nov) | 06 · Panel de cocina y de barra · aviso de "listo" al mesero |
| mié 11 nov | **Consultar historial de comandas** (9–10 nov) | Comandas › Historial del día, con pagos, cancelaciones y movimientos |

Ciclo (pantalla 12): la hostess sienta al grupo → el mesero **abre** la comanda (queda como su mesero) →
**captura** con tiempo y nota (quedan "Sin enviar") → **envía** (un envío nuevo; la comanda sigue abierta)
→ cocina y barra **preparan y marcan listo** (el mesero recibe el aviso) → el mesero **entrega** → **pide la
cuenta** (Por cobrar) → caja cobra (ver [CAJA.md](CAJA.md)).

```
05a Abrir comanda ── mesa · personas (las que registró la hostess) · mesero (tú) · reservación vinculada (sola)
05b Comanda ── buscar · tiempo de lo que agregues (1er, 2º, 3er) · categorías · tocar un producto = + 1
   ├─ SIN ENVIAR ── Nota (cantidad, tiempo, nota) · Quitar
   ├─ Enviar N productos nuevos ──► Envío 2 · 19:05 · pedido adicional
   ├─ ENVIADO ── estado de cada producto · Entregar (si está listo) · Cancelar (motivo + gerente)
   ├─ Pedir la cuenta ──► Por cobrar (no se puede con productos sin enviar)
   ├─ Cambiar mesa · Personas · Transferir · Nota de mesa (alergias)
   └─ Cancelar comanda · requiere autorización del gerente
06 Panel (Cocina | Barra) ── Por preparar → En preparación → Listo para entregar → Entregado
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/comandas` · `?vista=historial&fecha=` | comandas (y caja/reportes para ver) | Abiertas o el historial del día; el mesero ve las suyas |
| `GET /api/comandas/:id` | ídem | Encabezado, productos por envío, pagos, cancelaciones y movimientos |
| `POST /api/comandas` | `comanda.abrir` | `{ mesa_id, numero_personas, mesero_usuario_id? }` (folio C-1046…) |
| `POST /api/comandas/:id/productos` · `PUT` y `DELETE …/productos/:linea` | `comanda.abrir` | Capturar, nota, quitar |
| `POST /api/comandas/:id/enviar` · `/entregar` · `/pedir-cuenta` | comandas · pedir cuenta | |
| `PUT /api/comandas/:id/nota` · `POST /:id/transferir` | `comanda.abrir` | Nota de mesa · `{ mesero_usuario_id }` |
| `POST /api/comandas/:id/productos/:linea/cancelar` · `/:id/cancelar` | `comanda.abrir` | `{ motivo, autoriza: { usuario, contrasena } }` |
| `GET /api/produccion/cocina` · `/barra` | `produccion.ver` | Tarjetas por columna, con sus productos |
| `POST /api/produccion/envios/:id/avanzar` | cambiar estado (el mesero solo Entregado) | `{ destino, estado }` |

## Decisiones (y por qué)

**La base hace cumplir el ciclo.** Una comanda abierta por mesa; quien la abre queda como su mesero y solo
él (o el gerente) la trabaja; el nombre y el precio se congelan al capturar (aunque la app mandara otro); con
productos sin enviar no se pide la cuenta; con la cuenta pedida no se agrega nada; cocina no se salta pasos.
La pantalla muestra el mensaje de la base tal cual.

**El folio lo saca el backend** (`C-` + el siguiente número) con un candado de la transacción
(`pg_advisory_xact_lock`): dos meseros abriendo a la vez no obtienen el mismo folio.

**Tocar un producto otra vez suma a la misma línea** si sigue sin enviar, en el mismo tiempo y sin nota.
Con nota es otra línea (son platillos distintos para cocina).

**Tiempo sugerido**: al elegir la categoría, el tiempo cambia solo (postres 3er, platos fuertes 2º, lo demás
1er); el mesero lo puede cambiar.

**Cancelar pide autorización del gerente** (motivo + su usuario y contraseña en la tablet del mesero). Si
quien cancela ya tiene «Cancelar productos o comandas», se autoriza a sí mismo. La base guarda quién lo pidió
y quién lo autorizó; los intentos fallidos cuentan en el mismo límite que el inicio de sesión. Lo enviado se
cancela; lo sin enviar se quita.

**Entregar** lo hace cocina o cualquier mesero (pantalla 12, paso 6).

**Panel de cocina y barra**: cada tarjeta es un envío para un destino (la categoría decide cocina o barra).
Los botones mueven todos los productos de la tarjeta un paso. La tarjeta explica qué pasó con el resto del
envío ("De este envío ya se entregó: Pasta Alfredo; 3× Limonada natural lo hizo barra."). El tiempo se pone
ámbar a los 8 min y rojo a los 15. Los envíos nuevos se marcan y suenan.

**Aviso al mesero**: al marcar "Listo", su pantalla 05a muestra "N platillos listos por entregar" al instante
(Socket.IO, ver [CRONOGRAMA.md](CRONOGRAMA.md)).

*Pregunta probable: "¿qué pasa si el mesero cambia de turno?"* Usa "Transferir": la comanda pasa a otro
mesero, que desde ese momento la trabaja, y queda en la bitácora. El gerente también la puede transferir.

## Pendiente de hablar en la revisión

- El menú del mesero en el diseño tiene **"Cuentas"**, sin pantalla dibujada. Sus cuentas están en
  **Comandas** (abiertas, por cobrar y el historial del día).
- El **gerente** también puede trabajar una comanda (desde 04 › tarjeta › "Ver comanda" o "Abrir comanda").

## Pruebas automáticas (`npm test`)

`backend/test/comandas.test.js` — 22 pruebas: la comanda de la Mesa 08 como en el diseño, lista por
mesero, abrir en la mesa que sentó la hostess (se vincula sola), mesas que no se pueden abrir, abrir a nombre
de otro, capturar y sumar, 86, mesa de otro mesero, nota y quitar, enviar, pedir la cuenta, entregar,
cambiar mesa, cambiar personas, transferir, cancelar un producto con autorización, cancelar la comanda e
historial del día. Y el gerente y el mesero al mismo tiempo: abrir comanda en la misma mesa (se abre una),
presionar Enviar a la vez (llega a cocina una vez) y abrir en una mesa que se está dando de baja.

`backend/test/produccion.test.js` — 6 pruebas: las tarjetas de cocina de las 19:09 en su columna, el
contenido de cada tarjeta, barra sin pendientes, permisos, avanzar una tarjeta hasta entregada (y el aviso
al mesero), no saltarse pasos.
