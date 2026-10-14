# Mesas: crear mesa (pantalla 04)

Caso de uso **Crear mesa**: el catálogo de mesas del salón, con su número, su capacidad y su zona.

Quién ve qué (por permisos, no por nombre de rol): quien tiene «Crear y bloquear mesas» (gerente, hostess)
crea, edita y da de baja mesas; quien solo consulta el salón o atiende mesas las ve.

```
04 Mesas ── buscar mesa ── tarjetas: número, capacidad y zona
   ├─ Crear mesa ── número ("7" → Mesa 07), capacidad 1–30, zona ──► nace Libre
   ├─ Tarjeta ──► editar ── Dar de baja (solo libre y sin reservaciones por venir)
   └─ Mesas dadas de baja ──► Reactivar
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/mesas` | ver mesas, administrarlas, comandas o reservaciones | Las mesas en servicio (`v_mapa_mesas`); quien las administra ve también las dadas de baja |
| `POST /api/mesas` · `PUT /api/mesas/:id` | `mesa.administrar` | `{ numero, capacidad, zona }` |
| `POST /api/mesas/:id/dar-de-baja` · `/reactivar` | `mesa.administrar` | Solo libre (o bloqueada) y sin reservaciones por venir |

## Decisiones (y por qué)

**El estado de la mesa no se escribe aquí.** Una mesa nueva nace Libre; después lo mueven los triggers de
comandas y reservaciones (`tg_mesa_reglas`), y la base rechaza un estado que no esté respaldado.

**"7" es la Mesa 07.** Los números de un dígito se guardan con dos (como en el diseño) para que no existan
la Mesa 7 y la Mesa 07 a la vez.

**La capacidad no deja fuera a una reservación ya hecha.** Si una mesa tiene una reservación para 6, no se
le puede bajar a 4 sin cambiar antes la reservación de mesa.

**Dar de baja, no borrar**: la mesa tiene comandas y reservaciones en su historial. Solo se da de baja
libre (o bloqueada) y sin reservaciones por venir. Una mesa dada de baja no sale en el salón y se puede
reactivar.

**Al mismo tiempo.** Si dos personas crean la misma mesa a la vez, la segunda espera a la primera (candado
de la transacción, `enFila` en `db.js`) y ve el aviso en el campo Número en lugar de duplicarla.

Todo cambio (alta, edición con el valor anterior y el nuevo, baja y reactivación) queda en la bitácora.

## Pruebas automáticas (`npm test`)

`backend/test/mesas.test.js` — 9 pruebas: las mesas en servicio, quién consulta, quién ve las dadas de
baja, crear mesa (bitácora, "7" = 07, capacidad), el mesero no crea mesas, editar sin dejar fuera una
reservación, dar de baja y reactivar, y la misma mesa creada dos veces a la vez.
