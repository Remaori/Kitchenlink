// 04 · Mesas (crear mesa y bloqueo) y 05a · Mis mesas (mesero)
//
// El estado de la mesa lo mueven los triggers de comandas y reservaciones; a
// mano solo se bloquea (con motivo) y se desbloquea (tg_mesa_reglas). Aquí se
// agrega: número sin repetirse ("7" y "07" son la misma mesa), capacidad que
// no deje fuera a una reservación ya hecha, y dar de baja en lugar de borrar.
import { consulta, conTransaccion, enFila } from '../db.js';
import { revisor } from '../validacion.js';
import { bitacora, campoInvalido, noExiste, regla } from './comun.js';

// v_mapa_mesas + lo que piden las tarjetas de 04 y 05a
const SQL_MAPA = `
  SELECT v.id, v.numero, v.capacidad, m.zona, v.estado::text AS estado, v.estado_etiqueta, v.estado_tono,
         v.libre_desde, v.motivo_bloqueo, m.bloqueada_en, rb.nombre AS bloqueada_por,
         v.comanda_id, v.folio, v.mesero_usuario_id, v.mesero, v.numero_personas, v.abierta_en, v.total, v.cuenta_pedida_en,
         v.productos_sin_enviar::int AS productos_sin_enviar, v.platillos_listos::int AS platillos_listos,
         v.grupo_por_atender, v.personas_por_atender, v.sentada_en,
         v.proxima_reservacion, v.proxima_reservacion_hora, v.se_libera_si_no_llega,
         rp.estado::text AS proxima_reservacion_estado, rp.apartado_desde AS proxima_reservacion_apartado,
         rp.numero_personas AS proxima_reservacion_personas,
         rs.nombre_cliente AS grupo_de_reservacion,
         (SELECT r.nombre_cliente FROM reservacion r WHERE r.mesa_id = v.id AND r.estado = 'no_se_presento'
            AND r.finalizada_en = v.libre_desde LIMIT 1) AS libre_porque_no_llego,
         pr.nombre_producto AS en_preparacion, pr.enviado_en AS en_preparacion_desde
  FROM v_mapa_mesas v
  JOIN mesa m ON m.id = v.id
  LEFT JOIN usuario ub ON ub.id = m.bloqueada_por_usuario_id
  LEFT JOIN rol rb ON rb.id = ub.rol_id
  LEFT JOIN LATERAL (SELECT r.estado, r.apartado_desde, r.numero_personas FROM reservacion r
                     WHERE r.mesa_id = v.id AND r.estado IN ('por_confirmar','confirmada') AND r.tolerancia_hasta >= fn_ahora()
                     ORDER BY r.fecha_hora LIMIT 1) rp ON TRUE
  LEFT JOIN comanda c ON c.id = v.comanda_id
  LEFT JOIN reservacion rs ON rs.id = c.reservacion_id
  LEFT JOIN LATERAL (SELECT d.nombre_producto, e.enviado_en FROM detalle_comanda d JOIN envio e ON e.id = d.envio_id
                     WHERE d.comanda_id = v.comanda_id AND d.estado = 'en_preparacion'
                     ORDER BY e.enviado_en, d.id LIMIT 1) pr ON TRUE`;

/** Las mesas del salón (v_mapa_mesas: solo las que están en servicio). */
export async function mapa({ conBajas = false } = {}) {
  const [{ rows: mesas }, bajas] = await Promise.all([
    consulta(`${SQL_MAPA} ORDER BY v.numero`),
    conBajas
      ? consulta('SELECT id, numero, capacidad, zona FROM mesa WHERE NOT activo ORDER BY numero').then((r) => r.rows)
      : Promise.resolve(undefined),
  ]);
  return { mesas, ...(bajas ? { dadas_de_baja: bajas } : {}) };
}

// ------------------------------------------------------- Crear y editar mesa

// El número de mesa es un entero del 1 al 999, sin letras ni signos ("T1", "-3", "+5" o
// "2.5" no). Se guarda con dos cifras como en el diseño: "7" y "007" son la Mesa 07.
const normalizarNumero = (t) => String(Number(t)).padStart(2, '0');

function revisar(cuerpo) {
  const v = revisor();
  const numero = v.texto('numero', cuerpo.numero == null ? null : String(cuerpo.numero), { etiqueta: 'El número', obligatorio: true, max: 10 });
  const valido = numero && /^\d{1,3}$/.test(numero) && Number(numero) >= 1;
  if (numero && !valido) v.error('numero', 'El número: solo números enteros del 1 al 999 (ej. 7 o 22).');
  const d = {
    numero: valido ? normalizarNumero(numero) : numero,
    capacidad: v.entero('capacidad', cuerpo.capacidad, { etiqueta: 'La capacidad', obligatorio: true, min: 1, max: 30 }),
    zona: v.texto('zona', cuerpo.zona, { etiqueta: 'La zona', max: 60 }),
  };
  v.terminar();
  return d;
}

// En fila: la misma mesa creada dos veces a la vez, la segunda ve a la primera
async function exigirNumeroLibre(c, numero, excepto = null) {
  await enFila(c, 'mesas:numero');
  const { rows: [otra] } = await c.query(
    'SELECT numero, activo FROM mesa WHERE upper(numero) = upper($1) AND id IS DISTINCT FROM $2::bigint', [numero, excepto]);
  if (otra) {
    throw campoInvalido('numero', otra.activo ? `Ya existe la Mesa ${otra.numero}.` : `La Mesa ${otra.numero} existe pero está dada de baja: reactívala.`, 'DUPLICADO', 409);
  }
}

const unaMesa = async (id) => {
  const { rows: [m] } = await consulta(
    `SELECT m.id, m.numero, m.capacidad, m.zona, m.activo, m.estado::text AS estado, fn_etiqueta('estado_mesa', m.estado::text) AS estado_etiqueta
     FROM mesa m WHERE m.id = $1`, [id]);
  if (!m) throw noExiste('esa mesa');
  return m;
};

/** "Crear mesa": empieza Libre */
export async function crear(cuerpo, actorId) {
  const d = revisar(cuerpo ?? {});
  const id = await conTransaccion(actorId, async (c) => {
    await exigirNumeroLibre(c, d.numero);
    const { rows: [m] } = await c.query('INSERT INTO mesa (numero, capacidad, zona) VALUES ($1, $2, $3) RETURNING id', [d.numero, d.capacidad, d.zona]);
    await bitacora(c, 'mesa', m.id, 'crear_mesa', d);
    return m.id;
  });
  return unaMesa(id);
}

/** Editar número, capacidad y zona */
export async function editar(id, cuerpo, actorId) {
  const d = revisar(cuerpo ?? {});
  await conTransaccion(actorId, async (c) => {
    const { rows: [m] } = await c.query('SELECT numero, capacidad, zona, activo FROM mesa WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw noExiste('esa mesa');
    if (!m.activo) throw regla(`La Mesa ${m.numero} está dada de baja: reactívala para editarla.`);
    await exigirNumeroLibre(c, d.numero, id);
    if (d.capacidad < m.capacidad) {
      const { rows: [r] } = await c.query(
        `SELECT nombre_cliente, numero_personas, fecha_hora FROM reservacion
         WHERE mesa_id = $1 AND estado IN ('por_confirmar','confirmada') AND tolerancia_hasta >= fn_ahora() AND numero_personas > $2
         ORDER BY fecha_hora LIMIT 1`, [id, d.capacidad]);
      if (r) {
        throw campoInvalido('capacidad', `Tiene la reservación de ${r.nombre_cliente} para ${r.numero_personas} personas: cámbiala de mesa primero.`, 'REGLA_DE_NEGOCIO', 409);
      }
    }
    const cambios = Object.fromEntries(['numero', 'capacidad', 'zona'].filter((k) => d[k] !== m[k]).map((k) => [k, { de: m[k], a: d[k] }]));
    if (!Object.keys(cambios).length) return;
    await c.query('UPDATE mesa SET numero = $1, capacidad = $2, zona = $3 WHERE id = $4', [d.numero, d.capacidad, d.zona, id]);
    await bitacora(c, 'mesa', id, 'editar_mesa', cambios);
  });
  return unaMesa(id);
}

/** Dar de baja (ya no sale en el salón). Solo libre y sin reservaciones por venir. */
export async function darDeBaja(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [m] } = await c.query('SELECT numero, estado::text AS estado, activo FROM mesa WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw noExiste('esa mesa');
    if (!m.activo) throw regla(`La Mesa ${m.numero} ya está dada de baja.`);
    if (m.estado !== 'libre' && m.estado !== 'bloqueada') {
      throw regla(`La Mesa ${m.numero} no está libre (está: ${await etiqueta(c, m.estado)}): solo se da de baja una mesa libre o bloqueada.`);
    }
    const { rows: [r] } = await c.query(
      `SELECT nombre_cliente, fecha_hora FROM reservacion WHERE mesa_id = $1 AND estado IN ('por_confirmar','confirmada') AND tolerancia_hasta >= fn_ahora()
       ORDER BY fecha_hora LIMIT 1`, [id]);
    if (r) throw regla(`La Mesa ${m.numero} tiene la reservación de ${r.nombre_cliente}: cámbiala de mesa o cancélala primero.`);
    await c.query('UPDATE mesa SET activo = FALSE WHERE id = $1', [id]);
    await bitacora(c, 'mesa', id, 'dar_de_baja_mesa');
  });
  return unaMesa(id);
}

export async function reactivar(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [m] } = await c.query('UPDATE mesa SET activo = TRUE WHERE id = $1 AND NOT activo RETURNING id', [id]);
    if (!m) {
      const { rows: [x] } = await c.query('SELECT numero FROM mesa WHERE id = $1', [id]);
      throw x ? regla(`La Mesa ${x.numero} ya está activa.`) : noExiste('esa mesa');
    }
    await bitacora(c, 'mesa', id, 'reactivar_mesa');
  });
  return unaMesa(id);
}

const etiqueta = async (c, estado) => (await c.query("SELECT fn_etiqueta('estado_mesa', $1) AS e", [estado])).rows[0].e;

// ----------------------------------------------- Operaciones: bloquear mesa

/** "Bloquear": solo una mesa libre, con motivo (lo hace cumplir la base y queda en la bitácora). */
export async function bloquear(id, cuerpo, actorId) {
  const v = revisor();
  const motivo = v.texto('motivo', cuerpo?.motivo, { etiqueta: 'El motivo', obligatorio: true, min: 3, max: 160 });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const { rows: [m] } = await c.query('SELECT numero, activo FROM mesa WHERE id = $1 FOR UPDATE', [id]);
    if (!m || !m.activo) throw noExiste('esa mesa');
    await c.query("UPDATE mesa SET estado = 'bloqueada', motivo_bloqueo = $1, bloqueada_por_usuario_id = $2 WHERE id = $3", [motivo, actorId, id]);
  });
  return unaMesa(id);
}

/** "Desbloquear": queda Libre (o Reservada si ya está en la ventana de una reservación). */
export async function desbloquear(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [m] } = await c.query('SELECT numero, estado::text AS estado FROM mesa WHERE id = $1 FOR UPDATE', [id]);
    if (!m) throw noExiste('esa mesa');
    if (m.estado !== 'bloqueada') throw regla(`La Mesa ${m.numero} no está bloqueada.`);
    await c.query("UPDATE mesa SET estado = 'libre', libre_desde = NULL WHERE id = $1", [id]);
  });
  return unaMesa(id);
}
