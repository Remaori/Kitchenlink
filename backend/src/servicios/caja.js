// 07 · Cobro (cajera)
//
// El pre-ticket y el ticket NO se guardan: se generan de la comanda y sus
// pagos (v_ticket, v_ticket_lineas, v_ticket_pagos). "Dividir cuenta" = varios
// pagos. La base cierra la comanda sola cuando los pagos cubren el total y la
// mesa queda libre; el pago entra al corte abierto de quien cobra; los pagos
// no se modifican ni se borran (tg_pago_*, tg_comanda_reglas).
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { ErrorHttp } from '../errores.js';
import { config } from '../config.js';
import { ANCHO, centrado, columnas, imprimir, linea, pesos } from '../impresion.js';
import { noExiste, regla, siguienteFolio } from './comun.js';

const SQL_CORTE = `
  SELECT id, folio, cajera, turno, abierto_en, cerrado_en, estado::text AS estado, estado_etiqueta,
         monto_apertura, efectivo, tarjeta, transferencia, total_cobrado, operaciones::int AS operaciones,
         efectivo_esperado, efectivo_declarado, diferencia
  FROM v_cortes_caja`;

/** El corte abierto de quien cobra (o null: "Abre caja para cobrar") */
export async function corteAbierto(usuarioId) {
  const { rows: [k] } = await consulta(`${SQL_CORTE} WHERE estado = 'abierto' AND id IN (SELECT id FROM corte_caja WHERE cajero_usuario_id = $1)`, [usuarioId]);
  return k ?? null;
}

/** 07 · Lo que ve caja: su corte, las mesas que pidieron la cuenta y las que siguen abiertas */
export async function resumen(usuarioId) {
  const [corte, { rows: porCobrar }, { rows: abiertas }] = await Promise.all([
    corteAbierto(usuarioId),
    consulta(`SELECT c.comanda_id, c.folio, c.mesa, c.numero_personas, c.mesero, c.cuenta_pedida_en, c.subtotal, c.iva, c.total, c.pagado, c.falta
              FROM v_cuentas_por_cobrar c`),
    consulta(`SELECT r.id AS comanda_id, r.folio, r.mesa, r.numero_personas, r.mesero, r.abierta_en, r.total, r.productos_sin_enviar::int AS sin_enviar
              FROM v_comanda_resumen r WHERE r.estado = 'abierta' ORDER BY r.mesa`),
  ]);
  return { corte, por_cobrar: porCobrar, abiertas };
}

// ------------------------------------------------------------------ Ticket

/** El ticket (o pre-ticket) generado: encabezado, renglones y pagos */
export async function ticket(comandaId) {
  const { rows: [t] } = await consulta(
    `SELECT t.*, c.estado::text AS estado_comanda, fn_config_txt('restaurante.direccion') AS direccion
     FROM v_ticket t JOIN comanda c ON c.id = t.comanda_id WHERE t.comanda_id = $1`, [comandaId]);
  if (!t) {
    const { rows: [c] } = await consulta('SELECT folio, estado::text AS estado FROM comanda WHERE id = $1', [comandaId]);
    if (!c) throw noExiste('esa comanda');
    throw regla(`La comanda ${c.folio} todavía no pide la cuenta: el pre-ticket sale cuando el mesero la pide.`);
  }
  const [{ rows: lineas }, { rows: pagos }] = await Promise.all([
    consulta(
      `SELECT l.linea, l.cantidad, l.nombre_producto, l.precio_unitario, l.importe, v.detalle_texto, v.estado::text AS estado,
              (v.estado IN ('por_preparar','en_preparacion','listo')) AS en_cocina
       FROM v_ticket_lineas l JOIN v_comanda_detalle v ON v.id = l.linea WHERE l.comanda_id = $1 ORDER BY l.linea`, [comandaId]),
    consulta(`SELECT id, metodo::text AS metodo, metodo_etiqueta, monto, monto_recibido, cambio, referencia, registrado_en, cobro, corte
              FROM v_ticket_pagos WHERE comanda_id = $1 ORDER BY id`, [comandaId]),
  ]);
  return { ...t, lineas, pagos };
}

export const fechaTicket = (f) => new Date(f).toLocaleString('es-MX', {
  timeZone: config.zonaHoraria, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).replace(',', '');

/** Los renglones del ticket para la impresora térmica (y para imprimir en el navegador) */
export function renglonesDelTicket(t) {
  const r = [
    centrado((t.restaurante ?? 'KitchenLink').toUpperCase()),
    centrado(`Restaurante · ${t.sucursal ?? ''}`),
    ...(t.direccion ? [centrado(t.direccion)] : []),
    centrado(`RFC: ${t.rfc ?? ''}`),
    linea(),
    ...(t.tipo === 'Pre-ticket' ? [centrado('PRE-TICKET · NO ES COMPROBANTE DE PAGO'), linea()] : []),
    columnas('Folio', t.folio),
    columnas('Mesa', `${t.mesa} · ${t.numero_personas} personas`),
    columnas('Mesero', t.mesero),
    columnas('Fecha', fechaTicket(t.fecha)),
    linea(),
  ];
  for (const l of t.lineas) r.push(columnas(`${l.cantidad}  ${l.nombre_producto}`, pesos(l.importe)));
  r.push(linea(), columnas('Subtotal', pesos(t.subtotal)),
    columnas(`IVA (${Math.round(Number(t.tasa_impuesto ?? 0.16) * 100)} %)`, pesos(t.iva)),
    columnas('TOTAL', pesos(t.total)));
  if (t.tipo === 'Pre-ticket') {
    r.push(columnas(`Propina sugerida (no se suma)`, pesos(t.propina_sugerida)));
  }
  if (t.pagos.length) {
    r.push(linea());
    for (const p of t.pagos) {
      r.push(columnas(p.metodo_etiqueta, pesos(p.monto)));
      if (p.monto_recibido) r.push(columnas(`  recibido ${pesos(p.monto_recibido)} · cambio`, pesos(p.cambio)));
      if (p.referencia) r.push(`  Ref. ${p.referencia}`);
    }
    if (Number(t.falta) > 0) r.push(columnas('Falta por cobrar', pesos(t.falta)));
  }
  r.push(linea(), centrado(t.tipo === 'Pre-ticket' ? 'Gracias. Pase a caja a pagar.' : '¡Gracias por su visita!'));
  return r.map((x) => x.slice(0, ANCHO));
}

/** "Imprimir pre-ticket" / "Reimprimir ticket": a la impresora si hay; si no, el navegador */
export async function imprimirTicket(comandaId) {
  const t = await ticket(comandaId);
  const renglones = renglonesDelTicket(t);
  const impreso = await imprimir(renglones).catch((e) => { throw new ErrorHttp(503, 'IMPRESORA', e.message, { renglones }); });
  return { tipo: t.tipo, folio: t.folio, impreso, renglones };
}

// ------------------------------------------------------------- Abrir caja

/** "Abrir caja": fondo inicial y turno. Un corte abierto por cajera. */
export async function abrirCaja(cuerpo, usuarioId) {
  const v = revisor();
  const monto = v.dinero('monto_apertura', cuerpo?.monto_apertura ?? 0, { etiqueta: 'El fondo inicial' });
  const turno = v.texto('turno', cuerpo?.turno, { etiqueta: 'El turno', max: 30 });
  v.terminar();
  await conTransaccion(usuarioId, async (c) => {
    // El folio pone en fila las aperturas: con doble clic, la segunda ya ve la caja abierta
    const folio = await siguienteFolio(c, { tabla: 'corte_caja', clavePrefijo: 'folio.corte.prefijo', prefijoDefecto: 'Z-', digitos: 4 });
    const { rowCount } = await c.query("SELECT 1 FROM corte_caja WHERE cajero_usuario_id = $1 AND estado = 'abierto'", [usuarioId]);
    if (rowCount) throw regla('Ya tienes la caja abierta: el corte Z la cierra.');
    await c.query('INSERT INTO corte_caja (folio, cajero_usuario_id, turno, monto_apertura) VALUES ($1, $2, $3, $4)', [folio, usuarioId, turno, monto ?? '0.00']);
  });
  return corteAbierto(usuarioId);
}

// ----------------------------------------------------------------- Cobrar

/**
 * "Registrar pago". Efectivo: con monto recibido (el cambio se calcula, no se
 * guarda). Tarjeta o transferencia: con referencia opcional de la terminal.
 * Cuando los pagos cubren el total, la base cierra la comanda y libera la mesa.
 */
export async function registrarPago(comandaId, cuerpo, usuarioId) {
  const v = revisor();
  const metodo = v.opcion('metodo', cuerpo?.metodo, ['efectivo', 'tarjeta', 'transferencia'], { etiqueta: 'El método de pago' });
  const monto = v.dinero('monto', cuerpo?.monto, { etiqueta: 'El monto de este pago', obligatorio: true, mayorQueCero: true });
  const recibido = metodo === 'efectivo'
    ? v.dinero('monto_recibido', cuerpo?.monto_recibido, { etiqueta: 'El monto recibido', obligatorio: true })
    : null;
  const referencia = metodo !== 'efectivo' ? v.texto('referencia', cuerpo?.referencia, { etiqueta: 'La referencia', max: 60 }) : null;
  if (recibido && monto && Number(recibido) < Number(monto)) v.error('monto_recibido', 'El monto recibido no alcanza para este pago.');
  v.terminar();
  await conTransaccion(usuarioId, async (c) => {
    const { rows: [k] } = await c.query('SELECT 1 FROM comanda WHERE id = $1', [comandaId]);
    if (!k) throw noExiste('esa comanda');
    // El corte de quien cobra, compartido: nadie lo cierra a la mitad del cobro. Si lo
    // están cerrando, se espera y el pago ya no entra a un corte cerrado ("Abre caja").
    await c.query("SELECT 1 FROM corte_caja WHERE cajero_usuario_id = $1 AND estado = 'abierto' FOR SHARE", [usuarioId]);
    await c.query(
      `INSERT INTO pago (comanda_id, corte_caja_id, metodo, monto, monto_recibido, referencia, registrado_por_usuario_id)
       VALUES ($1, NULL, $2, $3, $4, $5, $6)`, [comandaId, metodo, monto, recibido, referencia, usuarioId]);
  });
  const t = await ticket(comandaId);
  return { ticket: t, cerrada: t.estado_comanda === 'cerrada' };
}

/** "Cancelar pre-ticket": la comanda vuelve a Abierta para que el mesero agregue (queda en bitácora) */
export async function cancelarPreTicket(comandaId, usuarioId) {
  await conTransaccion(usuarioId, async (c) => {
    const { rows: [k] } = await c.query('SELECT folio, estado::text AS estado FROM comanda WHERE id = $1 FOR UPDATE', [comandaId]);
    if (!k) throw noExiste('esa comanda');
    if (k.estado !== 'por_cobrar') throw regla(`La comanda ${k.folio} no tiene un pre-ticket que cancelar.`);
    await c.query("UPDATE comanda SET estado = 'abierta' WHERE id = $1", [comandaId]);
  });
  const { rows: [r] } = await consulta(`SELECT id, folio, mesa, estado::text AS estado, estado_etiqueta FROM v_comanda_resumen WHERE id = $1`, [comandaId]);
  return r;
}

/** "Arqueo de caja": lo que debe haber en el cajón ahora (no cierra el corte) */
export async function arqueo(usuarioId) {
  const corte = await corteAbierto(usuarioId);
  if (!corte) throw regla('No tienes la caja abierta.');
  return corte;
}

export { SQL_CORTE };
