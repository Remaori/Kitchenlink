// Pruebas del interruptor por fecha (cronograma.js) y del reloj de la aplicación (reloj.js)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { TAREAS, habilitado, modulosHabilitados, primerMiercoles } from '../src/cronograma.js';
import { ahora, fijarReloj } from '../src/reloj.js';
import { prepararBase, cerrarBase, entrar, bd, relojDePantallas } from './ayudantes.js';

let gerente;
const original = config.fechaRevision;
const enLaRevision = (fecha) => { config.fechaRevision = fecha; };

before(async () => {
  await prepararBase();
  ({ agente: gerente } = await entrar('lsaenz'));
});
after(async () => {
  config.fechaRevision = original;
  fijarReloj(null);
  await cerrarBase();
});

describe('Cronograma · cada módulo aparece el miércoles en que se revisa', () => {
  test('el primer miércoles desde que empieza la tarea (si empieza en miércoles, ese día)', () => {
    assert.equal(primerMiercoles('2026-10-16'), '2026-10-21'); // viernes -> miércoles siguiente
    assert.equal(primerMiercoles('2026-10-21'), '2026-10-21'); // ya es miércoles
    assert.deepEqual(Object.fromEntries(TAREAS.map((t) => [t.clave, t.revision])), {
      seguridad: '2026-10-07',
      menu: '2026-10-21', mesas: '2026-10-21',
      recepcion: '2026-10-28', operaciones_mesas: '2026-10-28',
      comandas: '2026-11-04', produccion: '2026-11-04',
      historial_comandas: '2026-11-11', monitoreo: '2026-11-11',
      cobro: '2026-11-18',
      ventas: '2026-11-25', reportes: '2026-11-25',
    });
  });

  test('qué se ve en cada revisión', () => {
    assert.deepEqual(modulosHabilitados('2026-10-14'), ['seguridad']);
    assert.deepEqual(modulosHabilitados('2026-10-21'), ['seguridad', 'menu', 'mesas']);
    assert.deepEqual(modulosHabilitados('2026-10-27'), ['seguridad', 'menu', 'mesas']); // martes antes de la revisión
    assert.deepEqual(modulosHabilitados('2026-11-04'),
      ['seguridad', 'menu', 'mesas', 'recepcion', 'operaciones_mesas', 'comandas', 'produccion']);
    assert.equal(modulosHabilitados('2026-11-25').length, TAREAS.length);
    assert.equal(habilitado('seguridad', '2026-01-01'), true); // lo ya revisado siempre se ve
    assert.throws(() => habilitado('modificadores'), /No existe el módulo/);
  });

  test('antes de su revisión la API del módulo no existe (404) y la sesión no lo anuncia', async () => {
    enLaRevision('2026-10-14');
    const r = await gerente.get('/api/menu').expect(404);
    assert.equal(r.body.codigo, 'NO_ENCONTRADO');
    const s = await gerente.get('/api/auth/sesion').expect(200);
    assert.deepEqual(s.body.modulos, ['seguridad']);
    assert.equal(s.body.revision, '2026-10-14');
    await gerente.get('/api/usuarios').expect(200); // lo ya revisado sigue igual

    enLaRevision('2026-10-21');
    await gerente.get('/api/menu').expect(200);
    assert.deepEqual((await gerente.get('/api/auth/sesion')).body.modulos, ['seguridad', 'menu', 'mesas']);
    enLaRevision(original);
  });
});

describe('Reloj de la aplicación', () => {
  test('cada respuesta lleva la hora de la aplicación (X-Ahora)', async () => {
    fijarReloj(null);
    const r = await gerente.get('/api/salud').expect(200);
    assert.ok(Math.abs(Date.parse(r.headers['x-ahora']) - Date.now()) < 5000);
  });

  test('con el reloj de demostración la base vive a la hora de las pantallas', async () => {
    relojDePantallas();
    const r = await gerente.get('/api/salud').expect(200);
    assert.equal(r.headers['x-ahora'], '2026-09-23T01:09:00.000Z');
    assert.equal(new Date(r.body.base_de_datos.hora).toISOString(), '2026-09-23T01:09:00.000Z');
  });

  test('si corre, avanza desde la hora de inicio; la sesión sigue venciendo con la hora real', async () => {
    fijarReloj('2026-09-22T19:09:00-06:00', { corre: true });
    await new Promise((r) => setTimeout(r, 60));
    const t = ahora().getTime() - Date.parse('2026-09-22T19:09:00-06:00');
    assert.ok(t >= 50 && t < 5000, `avanzó ${t} ms`);
    const { r, agente } = await entrar('cruiz');
    const cookie = r.headers['set-cookie'][0];
    const vence = Date.parse(/Expires=([^;]+)/.exec(cookie)[1]);
    assert.ok(vence > Date.now() + 11 * 3_600_000, 'la cookie vence en 12 h de hora real');
    await agente.get('/api/auth/sesion').expect(200);
    const [s] = await bd("SELECT emitida_en FROM sesion WHERE usuario_id = (SELECT id FROM usuario WHERE nombre_usuario = 'cruiz') ORDER BY id DESC LIMIT 1");
    assert.equal(new Date(s.emitida_en).toISOString().slice(0, 16), '2026-09-23T01:09'); // la fila, con el reloj de la aplicación
  });
});
