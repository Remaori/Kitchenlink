// Pruebas de peticiones al mismo tiempo. Lanzarlas con Promise.all no basta:
// casi siempre una termina antes de que empiece la otra. Aquí una conexión de
// administrador retiene un candado, las peticiones llegan y se quedan esperando
// en la base, y al soltarlo compiten de verdad. Se importa DESPUÉS de ./entorno.js.
import pg from 'pg';
import { config } from '../src/config.js';

const conectar = async () => {
  const c = new pg.Client({ ...config.bdAdmin, database: config.bd.database, options: '-c search_path=kitchenlink,public' });
  await c.connect();
  return c;
};

// Las peticiones detenidas son las conexiones que esperan un candado. Se revisa
// desde otra conexión: dentro de una transacción pg_stat_activity no se actualiza.
async function esperarDetenidas(observador, n, ms = 5000) {
  const limite = Date.now() + ms;
  for (;;) {
    const { rows: [r] } = await observador.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
    if (r.n >= n) return;
    if (Date.now() > limite) throw new Error(`Solo ${r.n} de ${n} peticiones llegaron a esperar el candado.`);
    await new Promise((listo) => setTimeout(listo, 10));
  }
}

/**
 * candado:      SQL que retiene la conexión de administrador (ej. LOCK TABLE bitacora IN EXCLUSIVE MODE)
 * peticiones:   funciones que devuelven la petición de supertest
 * detenidas:    cuántas deben quedar esperando antes de soltar (por defecto, todas)
 * enOrden:      la segunda sale cuando la primera ya está esperando (fija quién llegó primero)
 * antesDeSoltar(c): lo que hace "otra persona" en la misma transacción antes de soltar (opcional)
 * Devuelve las respuestas en el mismo orden que las peticiones.
 */
export async function alMismoTiempo({ candado, params = [], peticiones, detenidas = peticiones.length, enOrden = false, antesDeSoltar }) {
  const [c, observador] = await Promise.all([conectar(), conectar()]);
  try {
    await c.query('BEGIN');
    await c.query(candado, params);
    const enCurso = [];
    // Si alguna responde antes de quedar detenida, el error dice cuál y qué respondió
    const respondieron = [];
    const esperar = (n) => esperarDetenidas(observador, n).catch((e) => {
      throw new Error(respondieron.length ? `${e.message} Ya respondieron: ${respondieron.join(' · ')}` : e.message);
    });
    for (const [i, p] of peticiones.entries()) {
      enCurso.push(p().then((r) => {
        if (r?.status) respondieron.push(`#${i + 1} ${r.status} ${r.body?.mensaje ?? ''}`.trim());
        return r;
      }));
      if (enOrden) await esperar(enCurso.length);
    }
    await esperar(detenidas);
    if (antesDeSoltar) await antesDeSoltar(c);
    await c.query('COMMIT');
    return await Promise.all(enCurso);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await Promise.all([c.end(), observador.end()]);
  }
}

/** Los códigos HTTP ordenados, para comparar sin depender de quién ganó. */
export const estados = (respuestas) => respuestas.map((r) => r.status).sort();
