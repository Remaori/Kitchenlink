// Ayudantes de las pruebas de 02a, 02b y 02c. Se importan DESPUÉS de ./entorno.js.
import request from 'supertest';
import pg from 'pg';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { crearApp } from '../src/app.js';
import { instalarBase } from '../scripts/lib/instalador.js';
import { reiniciarTodo } from '../src/seguridad/limitador.js';

export const DEMO = 'Kitchen2026';
export const TEMPORAL = 'Temporal2026';
export const app = crearApp();

let admin; // conexión de administrador para revisar la base por fuera de la API
export const bd = async (sql, params) => (await admin.query(sql, params)).rows;

/** Base de pruebas recién instalada con los datos de las pantallas (22 sep, 19:09). */
export async function prepararBase() {
  await instalarBase({ nombre: config.bd.database, demo: true });
  reiniciarTodo();
  admin = new pg.Client({ ...config.bdAdmin, database: config.bd.database, options: '-c search_path=kitchenlink,public' });
  await admin.connect();
}
export async function cerrarBase() {
  await admin.end();
  await pool.end();
}

let equipo = 0;
/** Inicia sesión "desde otro equipo" (el límite de intentos cuenta por equipo). */
export async function entrar(usuario, contrasena = DEMO) {
  const n = ++equipo;
  const agente = request.agent(app);
  const r = await agente.post('/api/auth/iniciar-sesion')
    .set('X-Forwarded-For', `10.2.${Math.floor(n / 250)}.${(n % 250) + 1}`)
    .send({ usuario, contrasena });
  return { r, agente };
}

/** Primer inicio con la temporal + 01b. Devuelve el agente ya con su sesión normal. */
export async function activar(usuario, temporal, nueva = 'Nueva2026x') {
  const { r, agente } = await entrar(usuario, temporal);
  if (r.status !== 200) throw new Error(`No pudo entrar ${usuario}: ${r.status} ${JSON.stringify(r.body)}`);
  const c = await agente.post('/api/auth/cambiar-contrasena').send({ nueva, confirmacion: nueva });
  if (c.status !== 200) throw new Error(`No pudo crear su contraseña ${usuario}: ${c.status} ${JSON.stringify(c.body)}`);
  return { agente, sesion: c.body };
}

export const idDe = async (nombreUsuario) => (await bd('SELECT id FROM usuario WHERE nombre_usuario = $1', [nombreUsuario]))[0].id;
export const rolId = async (nombre) => (await bd('SELECT id FROM rol WHERE nombre = $1', [nombre]))[0].id;
export const ultimaBitacora = async (entidad, id) =>
  (await bd(`SELECT b.accion, b.detalle, u.nombre_usuario AS por FROM bitacora b LEFT JOIN usuario u ON u.id = b.usuario_id
             WHERE b.entidad = $1 AND b.entidad_id = $2 ORDER BY b.id DESC LIMIT 1`, [entidad, id]))[0];
