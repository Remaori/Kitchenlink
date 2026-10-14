// 04 · Mesas: Crear mesa
//
// El estado de la mesa lo mueven los triggers de comandas y reservaciones
// (tg_mesa_reglas). Aquí se agrega: número sin repetirse ("7" y "07" son la
// misma mesa), capacidad que no deje fuera a una reservación ya hecha, y dar
// de baja en lugar de borrar.
import { consulta, conTransaccion, enFila } from '../db.js';
import { revisor } from '../validacion.js';
import { bitacora, campoInvalido, noExiste, regla } from './comun.js';

/** Las mesas del salón (v_mapa_mesas: solo las que están en servicio). */
export async function mapa({ conBajas = false } = {}) {
  const [{ rows: mesas }, bajas] = await Promise.all([
    consulta(`SELECT v.id, v.numero, v.capacidad, m.zona, v.estado::text AS estado, v.estado_etiqueta, v.estado_tono
              FROM v_mapa_mesas v JOIN mesa m ON m.id = v.id ORDER BY v.numero`),
    conBajas
      ? consulta('SELECT id, numero, capacidad, zona FROM mesa WHERE NOT activo ORDER BY numero').then((r) => r.rows)
      : Promise.resolve(undefined),
  ]);
  return { mesas, ...(bajas ? { dadas_de_baja: bajas } : {}) };
}

// ------------------------------------------------------- Crear y editar mesa

// "7" y "07" son la misma mesa: los números van con dos cifras, como en el diseño
const normalizarNumero = (t) => (/^\d$/.test(t) ? `0${t}` : t);

function revisar(cuerpo) {
  const v = revisor();
  const numero = v.texto('numero', cuerpo.numero == null ? null : String(cuerpo.numero), { etiqueta: 'El número', obligatorio: true, max: 10 });
  if (numero && !/^[0-9A-Za-zÁÉÍÓÚÑáéíóúñ-]+$/.test(numero)) v.error('numero', 'Usa solo letras, números o guion (ej. 22, T1, Barra-2).');
  const d = {
    numero: numero && normalizarNumero(numero.toUpperCase()),
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
