# Supervisión y reportes (pantalla 10)

Tarea del cronograma: **Codificación de Supervisión y reportes** (24–25 nov · se revisa el mié 25 nov, hito
beta). Permiso: «Consultar reportes».

```
10 Supervisión y reportes ── Periodo (Hoy, 22 sep / otra fecha) · Exportar reporte (CSV)
   ├─ Ventas del día · Comensales · Ticket promedio · Rotación de mesas · Cancelaciones (con "vs. ayer")
   ├─ Ventas por hora (Hoy: 12 a 23 h) · por día (Semana · Mes) ── pasar el cursor: detalle · "Ver como tabla"
   ├─ Ventas por producto ── top 5 del día
   ├─ Reporte de cancelaciones ── producto, mesa, motivo, quién pidió y quién autorizó, monto, hora
   └─ Tiempo de rotación de mesas ── promedio por mesa: Óptimo · Alto · Crítico
```

## Rutas de la API

| Método y ruta | Qué hace |
|---|---|
| `GET /api/reportes?fecha=AAAA-MM-DD&periodo=dia\|semana\|mes` | Indicadores de hoy y ayer, barras, top 5, cancelaciones y rotación |
| `GET /api/reportes/exportar?fecha=` | El mismo reporte en CSV |

## Decisiones (y por qué)

**Todo sale de vistas** (`v_resumen_dia`, `v_ventas_por_hora`, `v_ventas_por_producto`, `v_cancelaciones`,
`v_rotacion_mesas`): los reportes no se guardan, se calculan de las comandas, pagos y cancelaciones.

**Rotación con niveles de Configuración**: hasta 60 min es Óptimo, hasta 90 Alto, más es Crítico
(`reporte.rotacion_optima_min` y `reporte.rotacion_critica_min`).

**La gráfica**: una sola serie (sin leyenda; el título dice qué es), barras de máximo 24 px con la punta
redondeada, la más alta con su valor, detalle al pasar el cursor y una vista en tabla. Sin librerías
externas (la app funciona sin internet).

**"vs. ayer"** compara con el día anterior; si ayer no hubo servicio dice "Sin datos de ayer".

## Pruebas automáticas (`npm test`)

En `backend/test/caja.test.js` (grupo "10 · Supervisión y reportes") — 4 pruebas: indicadores del día y de
ayer, ventas por hora de 12 a 23 h, top de productos y rotación con su nivel, periodo semana y mes, permisos
y exportar.
