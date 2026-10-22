# Mesas: crear mesa y operaciones de mesas (pantallas 04 y 05a)

Casos de uso **Crear mesa** (el catálogo de mesas: número, capacidad y zona) y **Operaciones de mesas**
(bloquear y desbloquear con motivo; cambiar de mesa o de personas una comanda abierta).

Quién ve qué (por permisos, no por nombre de rol): quien tiene «Crear y bloquear mesas» (gerente, hostess)
crea, edita, da de baja y bloquea mesas en **04 · Mesas**; quien atiende mesas (mesero) ve **05a · Mis mesas**.

```
04 Mesas ── buscar mesa ── tarjetas: número, capacidad y zona (una bloqueada dice por qué y quién)
   ├─ Crear mesa ── número ("7" → Mesa 07), capacidad 1–30, zona ──► nace Libre
   ├─ Tarjeta ──► editar ── Dar de baja (solo libre y sin reservaciones por venir) · bloquear (motivo) / desbloquear
   ├─ Bloquear / desbloquear ── solo una mesa libre, con motivo
   └─ Mesas dadas de baja ──► Reactivar
05a Mis mesas ── Todas · Mis mesas · Libres
   ├─ mi comanda ── Cambiar mesa (a una libre donde quepan) · Personas
   └─ de otro mesero ── "La atiende otro mesero"
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/mesas` | ver mesas, administrarlas, comandas o reservaciones | Las mesas en servicio (`v_mapa_mesas`); quien las administra ve también las dadas de baja |
| `POST /api/mesas` · `PUT /api/mesas/:id` | `mesa.administrar` | `{ numero, capacidad, zona }` |
| `POST /api/mesas/:id/dar-de-baja` · `/reactivar` | `mesa.administrar` | Solo libre (o bloqueada) y sin reservaciones por venir |
| `POST /api/mesas/:id/bloquear` · `/desbloquear` | `mesa.administrar` | `{ motivo }` al bloquear |
| `PUT /api/comandas/:id/mesa` · `/personas` | `comanda.abrir` | Cambiar de mesa o de personas (su mesero o el gerente) |

## Decisiones (y por qué)

**El estado de la mesa no se escribe aquí.** Una mesa nueva nace Libre; después lo mueven los triggers de
comandas y reservaciones (`tg_mesa_reglas`), y la base rechaza un estado que no esté respaldado.

**El número de mesa es un entero del 1 al 999** (revisión del 21 oct): sin letras, signos ni decimales
("T1", "-3", "+5" o "2.5" no). La base también lo exige (`ck_mesa_numero`). **"7" es la Mesa 07:** los números
de un dígito se guardan con dos (como en el diseño) para que no existan la Mesa 7 y la Mesa 07 a la vez.

**La capacidad no deja fuera a una reservación ya hecha.** Si una mesa tiene una reservación para 6, no se
le puede bajar a 4 sin cambiar antes la reservación de mesa.

**Dar de baja, no borrar**: la mesa tiene comandas y reservaciones en su historial. Solo se da de baja
libre (o bloqueada) y sin reservaciones por venir. Una mesa dada de baja no sale en el salón y se puede
reactivar.

**Al mismo tiempo.** Si dos personas crean la misma mesa a la vez, la segunda espera a la primera (candado
de la transacción, `enFila` en `db.js`) y ve el aviso en el campo Número en lugar de duplicarla.

**Cambiar de mesa: a una libre donde quepan.** La base exige que la mesa nueva esté libre y lo registra en
la bitácora; el backend revisa además que quepan. Lo mismo al cambiar personas: hasta la capacidad de la
mesa (si son más, se cambian a una más grande). Solo su mesero o el gerente, porque la comanda es suya.

**Quién bloqueó.** "Bloqueada por Hostess" sale del rol de quien la bloqueó (`bloqueada_por_usuario_id`).

Todo cambio (alta, edición con el valor anterior y el nuevo, baja, reactivación, bloqueo y cambio de mesa o
de personas) queda en la bitácora.

## Pruebas automáticas (`npm test`)

`backend/test/mesas.test.js` — 16 pruebas: las mesas en servicio, quién consulta, quién ve las dadas de
baja, crear mesa (bitácora, "7" = 07, capacidad), el número solo entero (en la API y en la base), el mesero
no crea mesas, editar sin dejar fuera una
reservación, dar de baja y reactivar, y la misma mesa creada dos veces a la vez. Operaciones (a las 19:09):
bloquear pide motivo y queda quién lo hizo, solo se bloquea una mesa libre, desbloquear la deja libre desde
ese momento, cambiar mesa (solo a una libre donde quepan), cambiar personas hasta la capacidad y otro mesero
no cambia una comanda que no es suya.
