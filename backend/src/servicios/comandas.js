// 05a · Operaciones de mesas sobre una comanda abierta: cambiar de mesa o de
// personas. La base hace cumplir que la mesa nueva esté libre, revisa que sea su
// mesero o el gerente y lo registra en la bitácora (tg_comanda_reglas).
import { consulta, conTransaccion } from '../db.js';
import { revisor } from '../validacion.js';
import { exigirMesaActiva, noExiste, regla } from './comun.js';

const exigirComanda = async (c, id) => {
  const { rows: [x] } = await c.query(
    `SELECT c.id, c.folio, c.estado::text AS estado, c.mesero_usuario_id, c.numero_personas, c.mesa_id, m.numero AS mesa
     FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  if (!x) throw noExiste('esa comanda');
  return x;
};

/** Cómo quedó la comanda: folio, mesa y personas */
const resumen = async (id) => {
  const { rows: [k] } = await consulta(
    `SELECT c.id, c.folio, c.estado::text AS estado, c.numero_personas, c.mesa_id, m.numero AS mesa
     FROM comanda c JOIN mesa m ON m.id = c.mesa_id WHERE c.id = $1`, [id]);
  if (!k) throw noExiste('esa comanda');
  return k;
};

/** "Cambiar mesa": solo a una mesa libre; la anterior se libera (y queda en bitácora) */
export async function cambiarMesa(id, cuerpo, actorId) {
  const v = revisor();
  const mesaId = v.id('mesa_id', cuerpo?.mesa_id, { etiqueta: 'La mesa nueva' });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.mesa_id === mesaId) throw regla(`La comanda ${k.folio} ya está en la Mesa ${k.mesa}.`);
    const m = await exigirMesaActiva(c, mesaId);
    // Si no está libre, la base explica por qué (tg_comanda_reglas); si está libre, que quepan
    if (m.estado === 'libre' && k.numero_personas > m.capacidad) {
      throw regla(`La Mesa ${m.numero} es para ${m.capacidad} personas y en la comanda hay ${k.numero_personas}.`);
    }
    await c.query('UPDATE comanda SET mesa_id = $1 WHERE id = $2', [mesaId, id]);
  });
  return resumen(id);
}

/** "Cambiar personas": se ajusta si llegó o se fue alguien (queda en bitácora) */
export async function cambiarPersonas(id, cuerpo, actorId) {
  const v = revisor();
  const personas = v.entero('numero_personas', cuerpo?.numero_personas, { etiqueta: 'El número de personas', obligatorio: true, min: 1, max: 30 });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const k = await exigirComanda(c, id);
    if (k.numero_personas === personas) return;
    const { rows: [m] } = await c.query('SELECT numero, capacidad FROM mesa WHERE id = $1', [k.mesa_id]);
    if (personas > m.capacidad) {
      throw regla(`La Mesa ${m.numero} es para ${m.capacidad} personas: para ${personas}, cámbialos a una mesa más grande.`);
    }
    await c.query('UPDATE comanda SET numero_personas = $1 WHERE id = $2', [personas, id]);
    await c.query("SELECT fn_bitacora('comanda', $1, 'cambiar_personas', $2::jsonb)", [id, JSON.stringify({ de: k.numero_personas, a: personas })]);
  });
  return resumen(id);
}
