# Mesas: crear mesa, operaciones y monitoreo (pantallas 04 y 05a)

Tres tareas del cronograma usan las mismas pantallas:

| Se revisa | Tarea | Qué agrega |
|---|---|---|
| mié 21 oct | **Crear mesa** (21 oct) | 04 · Catálogo de mesas: número, capacidad, zona · "Crear mesa" · editar · dar de baja |
| mié 28 oct | **Operaciones de mesas** (27–28 oct) | 04 · "Bloquear / desbloquear" con motivo · 05a · Mis mesas: cambiar de mesa o de personas |
| mié 11 nov | **Monitoreo de mesas** (11–12 nov) | 04 · contadores, filtros, estados en tiempo real y lo que dice cada tarjeta |

Quién ve qué (por permisos, no por nombre de rol): quien administra mesas o solo consulta el salón
(gerente, hostess, cajera) ve **04 · Mesas**; quien atiende mesas (mesero) ve **05a · Mis mesas**.

```
04 Mesas ── Total · Libres · Ocupadas · Reservadas · Bloqueadas
   ├─ Crear mesa ── número ("7" → Mesa 07), capacidad 1–30, zona ──► nace Libre
   ├─ Tarjeta ──► detalle: editar · bloquear (motivo) / desbloquear · ver o abrir comanda
   └─ Bloquear / desbloquear ── solo una mesa libre, con motivo
05a Mis mesas ── Todas · Mis mesas · Libres
   ├─ mi comanda ── Continuar comanda · Cambiar mesa (a una libre donde quepan) · Personas
   ├─ Por atender / Libre ── Abrir comanda (panel derecho)
   └─ de otro mesero ── "La atiende otro mesero"
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/mesas` | ver mesas, administrarlas, comandas o reservaciones | El salón (`v_mapa_mesas` + lo que piden las tarjetas) y sus contadores |
| `GET /api/mesas/:id` | ídem | Una mesa y "Comandas de hoy en esta mesa" |
| `POST /api/mesas` · `PUT /api/mesas/:id` | `mesa.administrar` | `{ numero, capacidad, zona }` |
| `POST /api/mesas/:id/dar-de-baja` · `/reactivar` | `mesa.administrar` | Solo libre (o bloqueada) y sin reservaciones por venir |
| `POST /api/mesas/:id/bloquear` · `/desbloquear` | `mesa.administrar` (28 oct) | `{ motivo }` al bloquear |
| `PUT /api/comandas/:id/mesa` · `/personas` | `comanda.abrir` (28 oct) | Cambiar de mesa o de personas (su mesero o el gerente) |

## Decisiones (y por qué)

**El estado de la mesa no se escribe a mano** (salvo bloquear). Lo mueven los triggers de comandas y
reservaciones (`tg_mesa_reglas`), y la base rechaza un estado que no esté respaldado. La pantalla solo lo
muestra. "Ocupadas" = Por atender + Comanda abierta + Por cobrar.

**El número de mesa es un entero del 1 al 999** (revisión del 21 oct): sin letras, signos ni decimales
("T1", "-3", "+5" o "2.5" no). La base también lo exige (`ck_mesa_numero`). **"7" es la Mesa 07:** los números
de un dígito se guardan con dos (como en el diseño) para que no existan la Mesa 7 y la Mesa 07 a la vez.

**Antes del monitoreo, la tarjeta ya dice si la mesa está bloqueada.** Con las operaciones (28 oct) y sin el
monitoreo (11 nov), las tarjetas muestran número, capacidad y zona; una mesa bloqueada muestra "Bloqueada", el
motivo y quién la bloqueó, para que se vea en cuanto se bloquea.

**La capacidad no deja fuera a una reservación ya hecha.** Si la Mesa 03 tiene la reservación de Ana
Martínez para 6, no se le puede bajar a 4 sin cambiar antes la reservación de mesa.

**Dar de baja, no borrar**: la mesa tiene comandas y reservaciones en su historial. Solo se da de baja
libre (o bloqueada) y sin reservaciones por venir.

**Cambiar de mesa: a una libre donde quepan.** La base exige que la mesa nueva esté libre y lo registra en
la bitácora; el backend revisa además que quepan. Lo mismo al cambiar personas: hasta la capacidad de la
mesa (si son más, se cambian a una más grande).

**Quién bloqueó.** "Bloqueada por Hostess" sale del rol de quien la bloqueó (`bloqueada_por_usuario_id`).

*Pregunta probable: "¿la hostess puede cambiar a un grupo de mesa?"* No: lo hace el mesero de esa comanda
o el gerente ("Cambiar mesa"), porque la comanda es suya. La hostess sí bloquea y desbloquea mesas.

## Pruebas automáticas (`npm test`)

`backend/test/mesas.test.js` — 14 pruebas: contadores y lo que dice cada tarjeta a las 19:09, quién
consulta, comandas de hoy en una mesa, crear mesa (bitácora, "7" = 07, capacidad), el número solo entero
(en la API y en la base), editar sin dejar fuera
una reservación, dar de baja y reactivar, bloquear con motivo, solo una mesa libre, desbloquear, y la misma mesa creada dos veces a la vez.

Cambiar mesa y personas están en `comandas.test.js` (operaciones de mesas).
