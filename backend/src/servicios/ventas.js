// 08 · Historial de ventas: tickets del día, cortes Z y cortes por mesero
//
// Nada de esto se guarda: los totales salen de las comandas y sus pagos
// (v_resumen_dia, v_tickets, v_cortes_caja, v_corte_meseros). Del corte solo
// se guarda lo que captura la cajera (fondo inicial y efectivo contado); un
// corte cerrado ya no cambia (tg_corte_reglas).
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { ErrorHttp } from '../errores.js';
import { ANCHO, centrado, columnas, imprimir, linea, pesos } from '../impresion.js';
import { SQL_CORTE, fechaTicket } from './caja.js';
import { noExiste, regla } from './comun.js';

/** La fecha de la dirección si existe en el calendario; si no (o no viene), null = hoy */
export const dia = (fecha) => (fecha && revisor().fecha('fecha', fecha)) || null;

async function fechaDe(fecha) {
  const { rows: [d] } = await consulta('SELECT COALESCE($1::date, fn_ahora()::date)::text AS fecha', [dia(fecha)]);
  return d.fecha;
}

/** Ventas, métodos de pago y cancelaciones de un día (ceros si no hubo servicio) */
export async function resumenDelDia(fecha) {
  const { rows: [r] } = await consulta(
    `SELECT ventas, tickets::int AS tickets, ticket_promedio, efectivo, operaciones_efectivo::int AS operaciones_efectivo,
            tarjeta, operaciones_tarjeta::int AS operaciones_tarjeta, transferencia, operaciones_transferencia::int AS operaciones_transferencia,
            monto_cancelado, cancelaciones::int AS cancelaciones, comensales::int AS comensales, rotacion_veces
     FROM v_resumen_dia WHERE dia::date = $1::date`, [fecha]);
  return r ?? {
    ventas: '0.00', tickets: 0, ticket_promedio: null, efectivo: '0.00', operaciones_efectivo: 0, tarjeta: '0.00', operaciones_tarjeta: 0,
    transferencia: '0.00', operaciones_transferencia: 0, monto_cancelado: '0.00', cancelaciones: 0, comensales: 0, rotacion_veces: null,
  };
}

/** 08 · Todo lo de la pantalla para un día */
export async function historial(fecha) {
  const f = await fechaDe(fecha);
  const [resumen, { rows: tickets }, { rows: cortes }, { rows: meseros }] = await Promise.all([
    resumenDelDia(f),
    consulta(`SELECT t.comanda_id, t.folio, t.mesa, t.mesero, t.metodo, t.hora, t.total, t.pagos::int AS pagos, t.pagos_texto
              FROM v_tickets t WHERE t.hora::date = $1::date ORDER BY t.hora DESC`, [f]),
    consulta(`${SQL_CORTE} WHERE abierto_en::date = $1::date OR estado = 'abierto' ORDER BY abierto_en DESC`, [f]),
    // Corte por mesero: lo que caja cobró ese día de las mesas de cada mesero
    consulta(
      `SELECT u.id AS mesero_id, u.nombre_completo AS mesero,
              count(DISTINCT c.id) FILTER (WHERE c.estado = 'cerrada')::int AS cuentas,
              COALESCE(sum(p.monto), 0) AS total_cobrado,
              (SELECT COALESCE(sum(x.numero_personas), 0)::int FROM comanda x
                WHERE x.mesero_usuario_id = u.id AND x.estado = 'cerrada' AND x.cerrada_en::date = $1::date) AS comensales,
              count(p.id) FILTER (WHERE p.metodo = 'efectivo')::int AS pagos_efectivo,
              COALESCE(sum(p.monto) FILTER (WHERE p.metodo = 'efectivo'), 0) AS efectivo,
              COALESCE(sum(p.monto) FILTER (WHERE p.metodo <> 'efectivo'), 0) AS otros_metodos
       FROM pago p JOIN comanda c ON c.id = p.comanda_id JOIN usuario u ON u.id = c.mesero_usuario_id
       WHERE p.registrado_en::date = $1::date
       GROUP BY u.id, u.nombre_completo ORDER BY total_cobrado DESC`, [f]),
  ]);
  return { fecha: f, resumen, tickets, cortes, meseros };
}

/** Un corte con su desglose por mesero */
export async function corte(id) {
  const { rows: [k] } = await consulta(`${SQL_CORTE} WHERE id = $1`, [id]);
  if (!k) throw noExiste('ese corte');
  const [{ rows: meseros }, { rows: [obs] }] = await Promise.all([
    consulta('SELECT mesero, cuentas::int AS cuentas, total_cobrado FROM v_corte_meseros WHERE corte_caja_id = $1 ORDER BY total_cobrado DESC', [id]),
    consulta('SELECT observaciones FROM corte_caja WHERE id = $1', [id]),
  ]);
  return { ...k, observaciones: obs.observaciones, meseros };
}

/**
 * "Generar corte Z": la cajera cuenta el efectivo del cajón y el corte se
 * cierra. La diferencia (contado − fondo − efectivo cobrado) la calcula la vista.
 */
export async function cerrarCorte(id, cuerpo, usuarioId) {
  const v = revisor();
  const contado = v.dinero('efectivo_declarado', cuerpo?.efectivo_declarado, { etiqueta: 'El efectivo contado', obligatorio: true });
  const observaciones = v.texto('observaciones', cuerpo?.observaciones, { etiqueta: 'Las observaciones', max: 300 });
  v.terminar();
  await conTransaccion(usuarioId, async (c) => {
    const { rows: [k] } = await c.query('SELECT folio, estado::text AS estado FROM corte_caja WHERE id = $1 FOR UPDATE', [id]);
    if (!k) throw noExiste('ese corte');
    if (k.estado === 'cerrado') throw regla(`El corte ${k.folio} ya está cerrado: es inmutable.`);
    await c.query('SELECT fn_cerrar_corte($1, $2, $3, $4)', [id, usuarioId, contado, observaciones]);
  });
  return corte(id);
}

/** Corte Z para la impresora térmica */
export function renglonesDelCorte(k) {
  const r = [
    centrado('CORTE Z'), centrado(k.folio), linea(),
    columnas('Cajera', k.cajera), columnas('Turno', k.turno ?? '—'),
    columnas('Apertura', fechaTicket(k.abierto_en)), columnas('Cierre', k.cerrado_en ? fechaTicket(k.cerrado_en) : 'Abierto'),
    linea(),
    columnas('Fondo inicial', pesos(k.monto_apertura)),
    columnas('Efectivo', pesos(k.efectivo)), columnas('Tarjeta', pesos(k.tarjeta)), columnas('Transferencia', pesos(k.transferencia)),
    columnas(`Total cobrado (${k.operaciones} pagos)`, pesos(k.total_cobrado)),
    linea(),
    columnas('Efectivo esperado', pesos(k.efectivo_esperado)),
    columnas('Efectivo contado', k.efectivo_declarado != null ? pesos(k.efectivo_declarado) : '—'),
    columnas('Diferencia', k.diferencia != null ? pesos(k.diferencia) : '—'),
  ];
  if (k.meseros?.length) {
    r.push(linea(), 'Por mesero');
    for (const m of k.meseros) r.push(columnas(`  ${m.mesero} (${m.cuentas})`, pesos(m.total_cobrado)));
  }
  if (k.observaciones) r.push(linea(), k.observaciones);
  return r.map((x) => x.slice(0, ANCHO));
}

export async function imprimirCorte(id) {
  const k = await corte(id);
  const renglones = renglonesDelCorte(k);
  const impreso = await imprimir(renglones).catch((e) => { throw new ErrorHttp(503, 'IMPRESORA', e.message, { renglones }); });
  return { folio: k.folio, impreso, renglones };
}

// "Exportar": CSV que abre Excel (con BOM para que respete los acentos)
// (y un texto que empieza con = + - @ no se vuelve fórmula: se antepone ')
const csv = (filas) => '﻿' + filas.map((f) => f.map((v) => {
  let t = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(t) && Number.isNaN(Number(t))) t = `'${t}`;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}).join(',')).join('\r\n');

export async function exportar(fecha) {
  const h = await historial(fecha);
  return {
    nombre: `ventas-${h.fecha}.csv`,
    contenido: csv([
      ['Folio', 'Mesa', 'Mesero', 'Método', 'Hora', 'Total', 'Pagos'],
      ...h.tickets.map((t) => [t.folio, t.mesa, t.mesero, t.metodo, fechaTicket(t.hora), t.total, t.pagos]),
    ]),
  };
}

export { csv };
