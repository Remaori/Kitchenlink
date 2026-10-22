// 03a · Reservaciones y 03b · Lista de espera (hostess)
//
// Las reglas de la pantalla 12 las hace cumplir la base: la reservación es
// para una hora futura, no se empalma con otra en la misma mesa, aparta la
// mesa 30 min antes, se libera sola si no llegan en la tolerancia (15 min) y
// tiene prioridad sobre la lista de espera (tg_reservacion_*, tg_espera_*).
// Aquí se arman las consultas de las pantallas y se validan los formularios.
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { config } from '../config.js';
import { ahora } from '../reloj.js';
import { mapa } from './mesas.js';
import { exigirMesaActiva, noExiste, regla } from './comun.js';

const SQL_CONFIG = `
  SELECT fn_config_num('reservacion.tolerancia_min', 15)::int AS tolerancia_min,
         fn_config_num('reservacion.duracion_min', 120)::int AS duracion_min,
         fn_config_num('reservacion.apartado_previo_min', 30)::int AS apartado_previo_min`;

const SQL_RESERVACIONES = `
  SELECT v.id, v.fecha_hora, v.nombre_cliente, v.numero_personas, r.mesa_id, v.mesa, v.telefono, v.solicitudes_especiales,
         v.estado::text AS estado, v.estado_pantalla, v.estado_etiqueta, v.estado_tono,
         v.apartado_desde, v.apartado_hasta, v.tolerancia_hasta, v.sentada_en, v.finalizada_en,
         v.mesa_apartada, v.minutos_para_liberar, r.confirmada_en,
         EXISTS (SELECT 1 FROM lista_espera l WHERE l.reservacion_origen_id = r.id) AS paso_a_lista
  FROM v_reservaciones v JOIN reservacion r ON r.id = v.id`;

// ------------------------------------------------------------ Reservaciones

/** 03a · Agenda del día (por defecto, hoy según el reloj de la aplicación) */
export async function agenda(fecha) {
  if (fecha && !revisor().fecha('fecha', fecha)) fecha = null; // una fecha que no existe: la de hoy
  const [{ rows: [d] }, { rows: [configuracion] }] = await Promise.all([
    consulta('SELECT COALESCE($1::date, fn_ahora()::date)::text AS fecha', [fecha]),
    consulta(SQL_CONFIG),
  ]);
  const [{ rows: reservaciones }, { rows: [espera] }] = await Promise.all([
    consulta(`${SQL_RESERVACIONES} WHERE v.fecha_hora::date = $1::date ORDER BY v.fecha_hora, v.id`, [d.fecha]),
    consulta("SELECT count(*)::int AS n FROM lista_espera WHERE estado = 'en_espera'"),
  ]);
  const vigentes = reservaciones.filter((r) => r.estado !== 'cancelada');
  return {
    fecha: d.fecha,
    configuracion,
    resumen: { reservaciones: vigentes.length, personas: vigentes.reduce((s, r) => s + r.numero_personas, 0), en_espera: espera.n },
    reservaciones,
  };
}

const unaReservacion = async (id) => {
  const { rows: [r] } = await consulta(`${SQL_RESERVACIONES} WHERE v.id = $1`, [id]);
  if (!r) throw noExiste('esa reservación');
  return r;
};

// AAAA-MM-DD en la zona del restaurante, `dias` después de hoy (reloj de la aplicación)
const diaDespues = (dias) => new Intl.DateTimeFormat('en-CA', { timeZone: config.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(ahora().getTime() + dias * 86_400_000));

function revisarReservacion(cuerpo) {
  const v = revisor();
  const d = {
    nombre_cliente: v.nombre('nombre_cliente', cuerpo.nombre_cliente, { etiqueta: 'El nombre', obligatorio: true }),
    telefono: v.telefono('telefono', cuerpo.telefono),
    numero_personas: v.entero('numero_personas', cuerpo.numero_personas, { etiqueta: 'Las personas', obligatorio: true, min: 1, max: 30 }),
    mesa_id: v.id('mesa_id', cuerpo.mesa_id, { etiqueta: 'La mesa' }),
    solicitudes_especiales: v.texto('solicitudes_especiales', cuerpo.solicitudes_especiales, { etiqueta: 'Las solicitudes especiales', max: 300 }),
  };
  // Una fecha que existe y no más de un año adelante (el 31/12/9999 no es una reservación);
  // que no haya pasado lo revisa la base
  if (v.fecha('fecha', cuerpo.fecha) && cuerpo.fecha > diaDespues(365)) {
    v.error('fecha', 'La fecha: las reservaciones se toman hasta con un año de anticipación.');
  }
  if (typeof cuerpo.hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(cuerpo.hora)) v.error('hora', 'Escribe la hora (ej. 21:00).');
  v.terminar();
  // Hora del restaurante: la conexión trabaja en su zona horaria (db.js)
  d.fecha_hora = `${cuerpo.fecha} ${cuerpo.hora}`;
  return d;
}

/** 03a · Formulario: qué mesas sirven para esa hora y cuántas personas */
export async function mesasParaReservar({ fecha, hora, personas, excepto }) {
  const v = revisor();
  v.fecha('fecha', fecha);
  if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) v.error('hora', 'Escribe la hora (ej. 21:00).');
  const n = v.entero('personas', personas, { etiqueta: 'Las personas', min: 1, max: 30 }) ?? 1;
  v.terminar();
  const { rows } = await consulta(`
    WITH p AS (SELECT ($1 || ' ' || $2)::timestamptz AS t)
    SELECT m.id, m.numero, m.capacidad, m.zona, (m.capacidad >= $3) AS cabe,
           ch.nombre_cliente AS choca_con, ch.apartado_desde AS choca_desde, ch.apartado_hasta AS choca_hasta
    FROM mesa m CROSS JOIN p
    LEFT JOIN LATERAL (
      SELECT r.nombre_cliente, r.apartado_desde, r.apartado_hasta FROM reservacion r
      WHERE r.mesa_id = m.id AND r.estado IN ('por_confirmar','confirmada','sentada') AND r.id IS DISTINCT FROM $4::bigint
        AND tstzrange(r.apartado_desde, r.apartado_hasta)
            && tstzrange(p.t - make_interval(mins => fn_config_num('reservacion.apartado_previo_min', 30)::int),
                         p.t + make_interval(mins => fn_config_num('reservacion.duracion_min', 120)::int))
      ORDER BY r.apartado_desde LIMIT 1) ch ON TRUE
    WHERE m.activo
    ORDER BY (m.capacidad >= $3 AND ch.nombre_cliente IS NULL) DESC, (m.estado = 'libre') DESC, m.capacidad, m.numero`,
  [fecha, hora, n, excepto ?? null]);
  return rows;
}

/** 03a · "Registrar reservación": queda Por confirmar hasta que la hostess confirme */
export async function crear(cuerpo, actorId) {
  const d = revisarReservacion(cuerpo ?? {});
  const id = await conTransaccion(actorId, async (c) => {
    await exigirMesaActiva(c, d.mesa_id);
    const { rows: [r] } = await c.query(
      `INSERT INTO reservacion (nombre_cliente, telefono, numero_personas, fecha_hora, mesa_id, solicitudes_especiales, registrada_por_usuario_id)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7) RETURNING id`,
      [d.nombre_cliente, d.telefono, d.numero_personas, d.fecha_hora, d.mesa_id, d.solicitudes_especiales, actorId]);
    return r.id;
  });
  return unaReservacion(id);
}

/** Cambiar fecha, hora, mesa o datos (mientras no llega) */
export async function editar(id, cuerpo, actorId) {
  const d = revisarReservacion(cuerpo ?? {});
  await conTransaccion(actorId, async (c) => {
    const { rows: [r] } = await c.query('SELECT nombre_cliente, estado::text AS estado FROM reservacion WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw noExiste('esa reservación');
    if (!['por_confirmar', 'confirmada'].includes(r.estado)) throw regla(`La reservación de ${r.nombre_cliente} ya no se puede cambiar.`);
    await exigirMesaActiva(c, d.mesa_id);
    await c.query(
      `UPDATE reservacion SET nombre_cliente = $1, telefono = $2, numero_personas = $3, fecha_hora = $4::timestamptz,
              mesa_id = $5, solicitudes_especiales = $6 WHERE id = $7`,
      [d.nombre_cliente, d.telefono, d.numero_personas, d.fecha_hora, d.mesa_id, d.solicitudes_especiales, id]);
  });
  return unaReservacion(id);
}

async function cambiarEstado(id, actorId, estado) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [r] } = await c.query('SELECT nombre_cliente, estado::text AS estado FROM reservacion WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw noExiste('esa reservación');
    if (r.estado === estado) throw regla(`La reservación de ${r.nombre_cliente} ya está así.`);
    await c.query('UPDATE reservacion SET estado = $1 WHERE id = $2', [estado, id]);
  });
  return unaReservacion(id);
}

/** "Confirmar": desde ese momento aparta la mesa (30 min antes de la hora) */
export const confirmar = (id, actorId) => cambiarEstado(id, actorId, 'confirmada');
/** "Marcar llegada": la reservación queda Sentada y la mesa Por atender */
export const marcarLlegada = (id, actorId) => cambiarEstado(id, actorId, 'sentada');
export const cancelar = (id, actorId) => cambiarEstado(id, actorId, 'cancelada');

/**
 * 12 · "Un cliente con reservación que llega tarde pierde su lugar: si todavía
 * quiere mesa, entra a la lista de espera como cualquier otro."
 */
export async function pasarALista(id, cuerpo, actorId) {
  const v = revisor();
  const estimada = v.entero('espera_estimada_min', cuerpo?.espera_estimada_min, { etiqueta: 'La espera estimada', min: 0, max: 240 });
  v.terminar();
  const espera = await conTransaccion(actorId, async (c) => {
    // Si ya pasó su tolerancia y el proceso de cada minuto no la ha marcado, se marca ahora
    await c.query('SELECT fn_revisar_reservaciones()');
    const { rows: [r] } = await c.query('SELECT * FROM reservacion WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw noExiste('esa reservación');
    if (r.estado !== 'no_se_presento') {
      throw regla(r.estado === 'sentada' ? `${r.nombre_cliente} ya está sentado.`
        : `${r.nombre_cliente} todavía conserva su reservación: márcale la llegada.`);
    }
    const { rows: [ya] } = await c.query('SELECT 1 FROM lista_espera WHERE reservacion_origen_id = $1', [id]);
    if (ya) throw regla(`${r.nombre_cliente} ya está en la lista de espera.`);
    const { rows: [l] } = await c.query(
      `INSERT INTO lista_espera (nombre_cliente, telefono, numero_personas, espera_estimada_min, nota, reservacion_origen_id, registrada_por_usuario_id)
       VALUES ($1, $2, $3, $4, 'Venía con reservación', $5, $6) RETURNING id`,
      [r.nombre_cliente, r.telefono, r.numero_personas, estimada, id, actorId]);
    return l.id;
  });
  return unoEnEspera(espera);
}

/** Proceso de cada minuto (server.js): tolerancias vencidas y mesas que se apartan */
export async function revisarReservaciones() {
  return conTransaccion(null, async (c) => (await c.query('SELECT fn_revisar_reservaciones() AS n')).rows[0].n);
}

// ---------------------------------------------------------- Lista de espera

const SQL_ESPERA = `
  SELECT v.id, v.posicion, v.nombre_cliente, v.numero_personas, v.telefono, l.telefono AS telefono_original, v.nota,
         v.llegada_en, v.minutos_esperando, v.minutos_estimados, l.espera_estimada_min, v.venia_con_reservacion
  FROM v_lista_espera v JOIN lista_espera l ON l.id = v.id`;

const unoEnEspera = async (id) => {
  const { rows: [l] } = await consulta(
    `SELECT l.id, l.nombre_cliente, l.numero_personas, l.telefono, l.nota, l.llegada_en, l.estado::text AS estado,
            fn_etiqueta('estado_espera', l.estado::text) AS estado_etiqueta, m.numero AS mesa, l.sentada_en
     FROM lista_espera l LEFT JOIN mesa m ON m.id = l.mesa_id WHERE l.id = $1`, [id]);
  if (!l) throw noExiste('ese grupo en la lista de espera');
  return l;
};

/** 03b · Quién espera (en orden de llegada), la espera promedio de hoy y el salón para asignar mesa */
export async function listaDeEspera() {
  const [{ rows: espera }, { rows: [p] }, { rows: [r] }, salon] = await Promise.all([
    consulta(`${SQL_ESPERA} ORDER BY v.posicion`),
    consulta(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM sentada_en - llegada_en) / 60))::int AS min
              FROM lista_espera WHERE estado = 'sentada' AND sentada_en::date = fn_ahora()::date`),
    consulta("SELECT count(*)::int AS n FROM reservacion WHERE fecha_hora::date = fn_ahora()::date AND estado <> 'cancelada'"),
    mapa(),
  ]);
  return { espera, espera_promedio_hoy_min: p.min, reservaciones_hoy: r.n, mesas: salon.mesas };
}

/** 03b · "Agregar": empieza a contar su espera */
export async function agregarAEspera(cuerpo, actorId) {
  const v = revisor();
  const d = {
    nombre_cliente: v.nombre('nombre_cliente', cuerpo?.nombre_cliente, { etiqueta: 'El nombre', obligatorio: true }),
    numero_personas: v.entero('numero_personas', cuerpo?.numero_personas, { etiqueta: 'Las personas', obligatorio: true, min: 1, max: 30 }),
    telefono: v.telefono('telefono', cuerpo?.telefono),
    nota: v.texto('nota', cuerpo?.nota, { etiqueta: 'La nota', max: 160 }),
    espera_estimada_min: v.entero('espera_estimada_min', cuerpo?.espera_estimada_min, { etiqueta: 'La espera estimada', min: 0, max: 240 }),
  };
  v.terminar();
  const id = await conTransaccion(actorId, async (c) => {
    const { rows: [l] } = await c.query(
      `INSERT INTO lista_espera (nombre_cliente, numero_personas, telefono, nota, espera_estimada_min, registrada_por_usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [d.nombre_cliente, d.numero_personas, d.telefono, d.nota, d.espera_estimada_min, actorId]);
    return l.id;
  });
  return unoEnEspera(id);
}

/** 03b · "Asignar": el grupo queda sentado y la mesa Por atender (la base revisa tamaño y reservaciones) */
export async function asignarMesa(id, cuerpo, actorId) {
  const v = revisor();
  const mesaId = v.id('mesa_id', cuerpo?.mesa_id, { etiqueta: 'La mesa' });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const { rows: [l] } = await c.query('SELECT nombre_cliente FROM lista_espera WHERE id = $1 FOR UPDATE', [id]);
    if (!l) throw noExiste('ese grupo en la lista de espera');
    // Con la mesa bloqueada, si otra hostess acaba de sentar ahí a otro grupo, la base ya la ve ocupada
    await exigirMesaActiva(c, mesaId);
    await c.query("UPDATE lista_espera SET estado = 'sentada', mesa_id = $1 WHERE id = $2", [mesaId, id]);
  });
  return unoEnEspera(id);
}

/** 03b · "Retirar": se fue sin mesa */
export async function retirar(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [l] } = await c.query('SELECT 1 FROM lista_espera WHERE id = $1 FOR UPDATE', [id]);
    if (!l) throw noExiste('ese grupo en la lista de espera');
    await c.query("UPDATE lista_espera SET estado = 'retirada' WHERE id = $1", [id]);
  });
  return unoEnEspera(id);
}
