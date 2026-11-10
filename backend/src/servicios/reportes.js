// 10 · Supervisión y reportes (gerente)
//
// Todo sale de vistas: v_resumen_dia, v_ventas_por_hora, v_ventas_por_producto,
// v_cancelaciones y v_rotacion_mesas. La rotación es Óptima, Alta o Crítica
// según los minutos de Configuración (reporte.rotacion_*_min).
import { consulta } from '../db.js';
import { csv, dia, resumenDelDia } from './ventas.js';

/** "Periodo: Hoy" + gráfica por Hoy (por hora), Semana o Mes (por día) */
export async function reporte({ fecha, periodo = 'dia' }) {
  const { rows: [d] } = await consulta(
    "SELECT COALESCE($1::date, fn_ahora()::date)::text AS fecha, (COALESCE($1::date, fn_ahora()::date) - 1)::text AS ayer", [dia(fecha)]);
  const [hoy, ayer, grafica, { rows: productos }, { rows: cancelaciones }, { rows: rotacion }] = await Promise.all([
    resumenDelDia(d.fecha),
    resumenDelDia(d.ayer),
    ventasEnElPeriodo(d.fecha, periodo),
    consulta(
      `SELECT nombre_producto, categoria, sum(unidades_vendidas)::int AS vendidos, sum(importe) AS importe
       FROM v_ventas_por_producto WHERE dia::date = $1::date
       GROUP BY nombre_producto, categoria ORDER BY sum(importe) DESC, nombre_producto LIMIT 5`, [d.fecha]),
    consulta(`SELECT id, hora, tipo::text AS tipo, tipo_etiqueta, comanda, mesa, producto, cantidad, motivo, monto, solicito, autorizo
              FROM v_cancelaciones WHERE hora::date = $1::date ORDER BY hora`, [d.fecha]),
    consulta(`SELECT mesa, servicios::int AS servicios, minutos_promedio::int AS minutos_promedio, nivel
              FROM v_rotacion_mesas WHERE dia::date = $1::date ORDER BY minutos_promedio DESC, mesa`, [d.fecha]),
  ]);
  return { fecha: d.fecha, periodo: grafica.periodo, hoy, ayer, ventas: grafica.barras, productos, cancelaciones, rotacion };
}

async function ventasEnElPeriodo(fecha, periodo) {
  if (periodo === 'semana' || periodo === 'mes') {
    const desde = periodo === 'semana' ? "$1::date - 6" : "date_trunc('month', $1::date)::date";
    const { rows } = await consulta(
      `SELECT g.dia::date::text AS etiqueta, COALESCE(sum(v.ventas), 0) AS ventas, COALESCE(sum(v.tickets), 0)::int AS tickets
       FROM generate_series(${desde}, $1::date, interval '1 day') g(dia)
       LEFT JOIN v_ventas_por_hora v ON v.dia::date = g.dia::date
       GROUP BY g.dia ORDER BY g.dia`, [fecha]);
    return { periodo, barras: rows };
  }
  // Hoy: de las 12 a las 23 h (el servicio), más cualquier hora con ventas fuera de ese rango
  const { rows } = await consulta(
    `SELECT h.hora AS etiqueta, COALESCE(v.ventas, 0) AS ventas, COALESCE(v.tickets, 0)::int AS tickets
     FROM (SELECT generate_series(12, 23) AS hora
           UNION SELECT hora FROM v_ventas_por_hora WHERE dia::date = $1::date) h
     LEFT JOIN v_ventas_por_hora v ON v.dia::date = $1::date AND v.hora = h.hora
     ORDER BY h.hora`, [fecha]);
  return { periodo: 'dia', barras: rows };
}

export async function exportar(consultaReporte) {
  const r = await reporte(consultaReporte);
  return {
    nombre: `reporte-${r.fecha}.csv`,
    contenido: csv([
      ['Reporte del día', r.fecha],
      ['Ventas', r.hoy.ventas], ['Tickets', r.hoy.tickets], ['Ticket promedio', r.hoy.ticket_promedio ?? ''],
      ['Comensales', r.hoy.comensales], ['Rotación de mesas (veces)', r.hoy.rotacion_veces ?? ''],
      ['Cancelaciones', r.hoy.monto_cancelado, `${r.hoy.cancelaciones} registradas`],
      [],
      ['Ventas por producto (top 5)', 'Categoría', 'Vendidos', 'Importe'],
      ...r.productos.map((p) => [p.nombre_producto, p.categoria, p.vendidos, p.importe]),
      [],
      ['Cancelaciones', 'Mesa', 'Producto', 'Motivo', 'Monto', 'Pidió', 'Autorizó'],
      ...r.cancelaciones.map((c) => [c.tipo_etiqueta, c.mesa, c.producto ?? `Comanda ${c.comanda}`, c.motivo, c.monto, c.solicito, c.autorizo]),
      [],
      ['Rotación de mesas', 'Servicios', 'Minutos promedio', 'Nivel'],
      ...r.rotacion.map((x) => [`Mesa ${x.mesa}`, x.servicios, x.minutos_promedio, x.nivel]),
    ]),
  };
}
