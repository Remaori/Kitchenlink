// Pruebas de conectividad Backend <-> PostgreSQL
// Necesitan DB_ADMIN_PASSWORD en backend/.env: crean la base kitchenlink_pruebas.
import './entorno.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import { config } from '../src/config.js';
import { pool, conTransaccion, opcionesConexion } from '../src/db.js';
import { crearApp } from '../src/app.js';
import { instalarBase } from '../scripts/lib/instalador.js';
import { ejecutarVerificaciones } from '../scripts/lib/conectividad.js';

before(async () => {
  const r = await instalarBase({ nombre: config.bd.database, demo: true });
  assert.equal(r.prueba.resultado, 'TODO CORRECTO', 'la prueba de coherencia del esquema debe pasar');
});
after(() => pool.end());

test('el backend se conecta como kitchenlink_app, sin ser superusuario', async () => {
  const { rows: [r] } = await pool.query(
    "SELECT current_user AS u, current_database() AS b, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su");
  assert.equal(r.u, 'kitchenlink_app');
  assert.equal(r.b, config.bd.database);
  assert.equal(r.su, false);
});

test('una contraseña incorrecta no conecta (28P01)', async () => {
  const c = new pg.Client({ ...opcionesConexion(), password: 'no-es-la-contraseña' });
  await assert.rejects(c.connect(), (e) => e.code === '28P01');
});

test('una base que no existe da un error claro (3D000)', async () => {
  const c = new pg.Client({ ...opcionesConexion(), database: 'no_existe_kitchenlink' });
  await assert.rejects(c.connect(), (e) => ['3D000', '28000'].includes(e.code));
});

test('todas las verificaciones de `npm run db:conectividad` pasan', async () => {
  const res = await ejecutarVerificaciones({ urlApi: 'http://127.0.0.1:9' }); // sin API: solo aviso
  const fallas = res.filter((r) => r.resultado === 'FALLA');
  assert.deepEqual(fallas, []);
  assert.ok(res.filter((r) => r.grupo === 'Permisos mínimos').length >= 6);
});

test('el usuario de una transacción no queda en la conexión al devolverla al pool', async () => {
  const dentro = await conTransaccion(7, async (c) => (await c.query('SELECT fn_usuario_actual() AS u')).rows[0].u);
  assert.equal(dentro, 7);
  // El pool tiene pocas conexiones abiertas: varias consultas pasan por la misma
  const despues = await Promise.all(Array.from({ length: 12 }, () => pool.query('SELECT fn_usuario_actual() AS u')));
  assert.ok(despues.every((r) => r.rows[0].u === null));
});

test('si la transacción falla, se deshace completa', async () => {
  await assert.rejects(conTransaccion(null, async (c) => {
    await c.query("UPDATE mesa SET zona = 'Zona temporal' WHERE numero = '01'");
    await c.query('SELECT 1/0');
  }));
  const { rows: [m] } = await pool.query("SELECT zona FROM mesa WHERE numero = '01'");
  assert.notEqual(m.zona, 'Zona temporal');
});

test('GET /api/salud responde con la base conectada', async () => {
  const r = await request(crearApp()).get('/api/salud').expect(200);
  assert.equal(r.body.estado, 'ok');
  assert.equal(r.body.base_de_datos.estado, 'conectada');
  assert.equal(typeof r.body.base_de_datos.latencia_ms, 'number');
});

test('una ruta de la API que no existe responde 404 en JSON', async () => {
  const r = await request(crearApp()).get('/api/no-existe').expect(404);
  assert.equal(r.body.codigo, 'NO_ENCONTRADO');
});
