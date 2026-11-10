// Pruebas del tiempo real (Socket.IO, pantalla 11): quién se conecta, qué avisos
// llegan y que un aviso nunca lleve datos (cada pantalla los vuelve a pedir a la API).
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { io as conectarSocket } from 'socket.io-client';
import { crearApp } from '../src/app.js';
import { iniciarTiempoReal, cerrarTiempoReal, TEMAS } from '../src/tiempoReal.js';
import { revisarReservaciones } from '../src/servicios/recepcion.js';
import { prepararBase, cerrarBase, bd, productoId, relojDePantallas, DEMO, TEMPORAL } from './ayudantes.js';

let servidor; let url;
const abiertos = [];

before(async () => {
  await prepararBase();
  relojDePantallas();
  servidor = http.createServer(crearApp());
  iniciarTiempoReal(servidor);
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  url = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => {
  for (const s of abiertos) s.disconnect();
  await cerrarTiempoReal(); // también cierra el servidor HTTP
  await cerrarBase();
});

let equipo = 0;
/** Inicia sesión y devuelve la cookie y una forma de llamar a la API con ella. */
async function entrar(usuario, contrasena = DEMO) {
  const r = await request(servidor).post('/api/auth/iniciar-sesion')
    .set('X-Forwarded-For', `10.4.0.${++equipo}`).send({ usuario, contrasena });
  assert.equal(r.status, 200, `${usuario}: ${r.body.mensaje}`);
  const cookie = r.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  return { cookie, api: (metodo, ruta) => request(servidor)[metodo](ruta).set('Cookie', cookie) };
}

/** Un dispositivo que abre la conexión de tiempo real (con la cookie de su sesión, si tiene). */
function dispositivo(cookie) {
  const s = conectarSocket(url, {
    path: '/socket.io', transports: ['websocket'], reconnection: false, forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
  abiertos.push(s);
  return s;
}
const seConecta = (s) => new Promise((ok, mal) => { s.once('connect', ok); s.once('connect_error', mal); });
const esRechazado = (s) => new Promise((ok, mal) => {
  s.once('connect', () => mal(new Error('se conectó sin una sesión válida')));
  s.once('connect_error', ok);
});
/** El siguiente aviso que recibe el dispositivo, o null si no llega en `ms`. */
const siguienteAviso = (s, ms = 1500) => new Promise((ok) => {
  const f = (aviso) => { clearTimeout(t); ok(aviso); };
  const t = setTimeout(() => { s.off('cambio', f); ok(null); }, ms);
  s.once('cambio', f);
});

describe('Quién se conecta', () => {
  test('sin sesión, o con una cookie alterada, no se conecta', async () => {
    assert.equal((await esRechazado(dispositivo(null))).message, 'SIN_SESION');
    assert.equal((await esRechazado(dispositivo('kl_sesion=alterada.no.sirve'))).message, 'SIN_SESION');
  });

  test('con la contraseña temporal (01b) todavía no se conecta', async () => {
    const { cookie } = await entrar('smendez', TEMPORAL);
    assert.equal((await esRechazado(dispositivo(cookie))).message, 'SIN_SESION');
  });

  test('con sesión se conecta; después de cerrar sesión ya no vuelve a conectarse', async () => {
    const { cookie, api } = await entrar('alopez');
    await seConecta(dispositivo(cookie));
    await api('post', '/api/auth/cerrar-sesion').expect(204);
    assert.equal((await esRechazado(dispositivo(cookie))).message, 'SIN_SESION');
  });
});

describe('Qué avisos llegan', () => {
  let mesero; let cocina; let caja; let comanda;

  before(async () => {
    mesero = await entrar('cruiz');
    const deCocina = await entrar('dbenitez');
    const deCaja = await entrar('mdiaz');
    cocina = dispositivo(deCocina.cookie);
    caja = dispositivo(deCaja.cookie);
    await Promise.all([seConecta(cocina), seConecta(caja)]);
  });

  test('el mesero abre comanda y envía a cocina: cocina y caja reciben el aviso, sin datos de la comanda', async () => {
    const [m] = await bd("SELECT id FROM mesa WHERE activo AND estado = 'libre' ORDER BY numero LIMIT 1");
    const abrir = siguienteAviso(cocina);
    comanda = (await mesero.api('post', '/api/comandas').send({ mesa_id: m.id, numero_personas: 2 }).expect(201)).body.comanda;
    assert.deepEqual((await abrir).temas, ['comandas', 'mesas']);

    await mesero.api('post', `/api/comandas/${comanda.id}/productos`).send({ producto_id: await productoId('Flan napolitano') }).expect(200);
    const [enCocina, enCaja] = [siguienteAviso(cocina), siguienteAviso(caja)];
    await mesero.api('post', `/api/comandas/${comanda.id}/enviar`).expect(200);
    const aviso = await enCocina;
    assert.deepEqual(aviso.temas, ['comandas', 'mesas', 'produccion']);
    assert.deepEqual(await enCaja, aviso, 'todas las pantallas reciben el mismo aviso');
    // Solo qué cambió y cuándo: ni folio, ni productos, ni montos
    assert.deepEqual(Object.keys(aviso).sort(), ['en', 'temas']);
    assert.ok(!Number.isNaN(Date.parse(aviso.en)));
  });

  test('una operación rechazada no avisa', async () => {
    const aviso = siguienteAviso(cocina, 500);
    const r = await mesero.api('post', `/api/comandas/${comanda.id}/enviar`).expect(409);
    assert.equal(r.body.mensaje, 'No hay productos sin enviar.');
    assert.equal(await aviso, null);
  });

  test('pedir la cuenta le avisa a caja', async () => {
    const aviso = siguienteAviso(caja);
    await mesero.api('post', `/api/comandas/${comanda.id}/pedir-cuenta`).expect(200);
    assert.ok((await aviso).temas.includes('caja'));
  });

  test('el proceso de cada minuto avisa cuando una reservación pasa su tolerancia', async () => {
    relojDePantallas('19:16'); // Roberto Díaz tenía hasta las 19:15
    const aviso = siguienteAviso(cocina);
    assert.ok(await revisarReservaciones() > 0);
    assert.deepEqual((await aviso).temas, ['reservaciones', 'mesas']);
    const [r] = await bd("SELECT estado::text AS e FROM reservacion WHERE nombre_cliente = 'Roberto Díaz'");
    assert.equal(r.e, 'no_se_presento');
    relojDePantallas();
  });
});

describe('Los temas', () => {
  // Una pantalla que escucha un tema mal escrito nunca se actualizaría sola
  test('cada tema que escuchan las pantallas existe, y cada tema lo escucha alguna pantalla', () => {
    const carpeta = path.resolve(import.meta.dirname, '../../frontend/src/paginas');
    const escuchados = new Set();
    for (const archivo of fs.readdirSync(carpeta, { recursive: true }).filter((a) => a.endsWith('.jsx'))) {
      const codigo = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
      for (const [, lista] of codigo.matchAll(/useCambios\(\[([^\]]*)\]/g)) {
        for (const [, tema] of lista.matchAll(/'([^']+)'/g)) {
          assert.ok(TEMAS.includes(tema), `${archivo} escucha «${tema}», que el servidor nunca avisa`);
          escuchados.add(tema);
        }
      }
    }
    assert.deepEqual(TEMAS.filter((t) => !escuchados.has(t)), [], 'temas que ninguna pantalla escucha');
  });
});
