// Pruebas del módulo de seguridad: pantallas 01 (Iniciar sesión) y 01b (Cambio de contraseña obligatorio)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { crearApp } from '../src/app.js';
import { instalarBase } from '../scripts/lib/instalador.js';
import { restablecerDesdeServidor, crearGerenteDesdeServidor } from '../src/seguridad/servicio.js';
import { reiniciarTodo } from '../src/seguridad/limitador.js';

const DEMO = 'Kitchen2026';
const TEMPORAL = 'Temporal2026';
const app = crearApp();
let admin; // conexión de administrador para simular acciones del gerente y revisar la base

let ipN = 0;
const nuevaIp = () => `10.0.0.${++ipN}`; // cada prueba "desde otro equipo" (el limitador cuenta por equipo)

function entrar(usuario, contrasena, ip = nuevaIp()) {
  const agente = request.agent(app);
  return agente.post('/api/auth/iniciar-sesion').set('X-Forwarded-For', ip).send({ usuario, contrasena })
    .then((r) => ({ r, agente, ip }));
}
const bd = async (sql, params) => (await admin.query(sql, params)).rows;

before(async () => {
  await instalarBase({ nombre: config.bd.database, demo: true });
  admin = new pg.Client({ ...config.bdAdmin, database: config.bd.database, options: '-c search_path=kitchenlink,public' });
  await admin.connect();
  reiniciarTodo();
});
after(async () => { await admin.end(); await pool.end(); });

describe('01 · Iniciar sesión', () => {
  test('usuario y contraseña correctos: entra, recibe cookie segura y sus permisos', async () => {
    const { r } = await entrar('lsaenz', DEMO);
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.nombre_completo, 'Luis Sáenz Jiménez');
    assert.equal(r.body.usuario.iniciales, 'LS');
    assert.equal(r.body.usuario.rol, 'Gerente');
    assert.equal(r.body.permisos.length, 17);
    const cookie = r.headers['set-cookie'].join(';');
    assert.match(cookie, /kl_sesion=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.ok(!('token' in r.body), 'el token no viaja en el cuerpo, solo en la cookie httpOnly');
  });

  test('se registra la sesión: hash del token (no el token), equipo, IP y último acceso', async () => {
    const { r, ip } = await entrar('mdiaz', DEMO);
    assert.equal(r.status, 200);
    const [s] = await bd(`SELECT s.token_hash, s.direccion_ip, s.dispositivo, s.expira_en - s.emitida_en AS duracion,
                                 u.ultimo_acceso = s.emitida_en AS acceso
                          FROM sesion s JOIN usuario u ON u.id = s.usuario_id
                          WHERE u.nombre_usuario = 'mdiaz' ORDER BY s.id DESC LIMIT 1`);
    assert.match(s.token_hash, /^[0-9a-f]{64}$/);
    const token = r.headers['set-cookie'][0].split(';')[0].split('=')[1];
    assert.ok(!token.includes(s.token_hash));
    assert.equal(s.direccion_ip, ip);
    assert.equal(s.duracion.hours, 12);
    assert.equal(s.acceso, true);
  });

  test('no distingue mayúsculas ni espacios en el usuario', async () => {
    const { r } = await entrar('  CRuiz ', DEMO);
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.nombre_usuario, 'cruiz');
  });

  test('contraseña incorrecta y usuario inexistente dan el MISMO mensaje', async () => {
    const a = (await entrar('lsaenz', 'equivocada1')).r;
    const b = (await entrar('no_existe', 'equivocada1')).r;
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.mensaje, 'Usuario o contraseña incorrectos.');
  });

  test('un intento fallido de un usuario que existe queda en la bitácora', async () => {
    await entrar('alopez', 'equivocada1', '10.9.9.9');
    const [b] = await bd(`SELECT b.accion, b.detalle->>'ip' AS ip FROM bitacora b
                          WHERE b.entidad = 'usuario' AND b.entidad_id = (SELECT id FROM usuario WHERE nombre_usuario = 'alopez')
                          ORDER BY b.id DESC LIMIT 1`);
    assert.equal(b.accion, 'inicio_sesion_fallido');
    assert.equal(b.ip, '10.9.9.9');
  });

  test('faltan datos: 400', async () => {
    const r = await request(app).post('/api/auth/iniciar-sesion').send({ usuario: 'lsaenz' });
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'DATOS_INCOMPLETOS');
  });

  test('dado de baja: con la contraseña correcta se le explica; con una incorrecta, no se revela nada', async () => {
    const ok = (await entrar('jvega', DEMO)).r;
    assert.equal(ok.status, 403);
    assert.equal(ok.body.codigo, 'CUENTA_DADA_DE_BAJA');
    const mal = (await entrar('jvega', 'equivocada1')).r;
    assert.equal(mal.status, 401);
    assert.equal(mal.body.codigo, 'CREDENCIALES');
  });

  test(`después de ${3} fallos se bloquea ese usuario en ese equipo (429), aunque luego acierte`, async () => {
    const ip = nuevaIp();
    for (let i = 0; i < 3; i++) assert.equal((await entrar('lmora', 'equivocada1', ip)).r.status, 401);
    const bloqueado = (await entrar('lmora', DEMO, ip)).r;
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.body.codigo, 'DEMASIADOS_INTENTOS');
    assert.ok(Number(bloqueado.headers['retry-after']) > 0);
    // Desde otro equipo sí puede entrar
    assert.equal((await entrar('lmora', DEMO)).r.status, 200);
  });

  test('un equipo que prueba muchos usuarios también se bloquea', async () => {
    const ip = nuevaIp();
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) await entrar(u, 'equivocada1', ip);
    assert.equal((await entrar('aruiz', DEMO, ip)).r.status, 429);
  });
});

describe('Sesión y permisos', () => {
  test('GET /api/auth/sesion devuelve al usuario de la cookie', async () => {
    const { agente } = await entrar('dbenitez', DEMO);
    const r = await agente.get('/api/auth/sesion').expect(200);
    assert.equal(r.body.usuario.rol, 'Jefe de cocina');
    assert.deepEqual(r.body.permisos.map((p) => p.clave), ['produccion.ver', 'produccion.cambiar_estado', 'menu.asignar_86']);
  });

  test('sin cookie: 401', async () => {
    const r = await request(app).get('/api/auth/sesion').expect(401);
    assert.equal(r.body.codigo, 'SIN_SESION');
  });

  test('el permiso del rol decide: el gerente ve los usuarios, el mesero no', async () => {
    const g = await entrar('lsaenz', DEMO);
    const lista = await g.agente.get('/api/usuarios').expect(200);
    assert.ok(lista.body.length >= 9);
    assert.ok(lista.body.every((u) => !('contrasena_hash' in u)));
    const m = await entrar('aruiz', DEMO);
    const r = await m.agente.get('/api/usuarios').expect(403);
    assert.equal(r.body.codigo, 'SIN_PERMISO');
    assert.equal(r.body.mensaje, 'Mesero no tiene el permiso «Administrar usuarios».');
  });

  test('un token alterado o firmado con otra clave no sirve', async () => {
    const { r } = await entrar('lsaenz', DEMO);
    const token = r.headers['set-cookie'][0].split(';')[0].split('=')[1];
    const p = jwt.decode(token);
    const falso = jwt.sign({ sid: p.sid, jti: p.jti, exp: p.exp }, 'otra-clave-cualquiera-de-32-caracteres!!', { subject: p.sub, issuer: 'kitchenlink' });
    const otro = jwt.sign({ sid: p.sid, jti: 'inventado', exp: p.exp }, config.jwtSecreto, { subject: p.sub, issuer: 'kitchenlink' });
    for (const t of [falso, otro, token.slice(0, -2) + 'xx']) {
      const x = await request(app).get('/api/auth/sesion').set('Cookie', `kl_sesion=${t}`);
      assert.equal(x.status, 401);
    }
  });

  test('cerrar sesión la invalida en la base, aunque alguien se haya quedado con la cookie', async () => {
    const { r, agente } = await entrar('cruiz', DEMO);
    const cookie = r.headers['set-cookie'][0].split(';')[0];
    await agente.post('/api/auth/cerrar-sesion').expect(204);
    const x = await request(app).get('/api/auth/sesion').set('Cookie', cookie).expect(401);
    assert.equal(x.body.codigo, 'SESION_TERMINADA');
  });

  test('una sesión vencida ya no sirve', async () => {
    const { agente } = await entrar('alopez', DEMO);
    await bd(`UPDATE sesion SET emitida_en = now() - interval '13 hours', expira_en = now() - interval '1 hour'
              WHERE id = (SELECT max(id) FROM sesion WHERE usuario_id = (SELECT id FROM usuario WHERE nombre_usuario = 'alopez'))`);
    await agente.get('/api/auth/sesion').expect(401);
  });

  test('si el gerente da de baja a alguien con sesión abierta, pierde el acceso en la siguiente petición', async () => {
    const { agente } = await entrar('aruiz', DEMO);
    await agente.get('/api/auth/sesion').expect(200);
    await bd("UPDATE usuario SET estado = 'dado_de_baja' WHERE nombre_usuario = 'aruiz'");
    await agente.get('/api/auth/sesion').expect(401);
    await bd("UPDATE usuario SET estado = 'activo' WHERE nombre_usuario = 'aruiz'");
  });
});

describe('01b · Cambio de contraseña obligatorio', () => {
  test('usuario Pendiente (smendez): entra con la temporal y solo puede crear su contraseña', async () => {
    const { r, agente } = await entrar('smendez', TEMPORAL);
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.estado, 'pendiente');
    assert.equal(r.body.usuario.requiere_cambio_pw, true);
    assert.deepEqual(r.body.permisos, [], 'sin permisos hasta crear su contraseña');
    const x = await agente.get('/api/usuarios').expect(403);
    assert.equal(x.body.codigo, 'CAMBIO_CONTRASENA_REQUERIDO');
    await agente.get('/api/auth/sesion').expect(200);
  });

  test('las reglas de 01b se validan en el servidor', async () => {
    const { agente } = await entrar('smendez', TEMPORAL);
    const casos = [
      [{ nueva: 'corta1', confirmacion: 'corta1' }, 'longitud'],
      [{ nueva: 'sinnumeros', confirmacion: 'sinnumeros' }, 'numero'],
      [{ nueva: 'Valida2026', confirmacion: 'Otra2026' }, 'coinciden'],
      [{ nueva: 'a1'.repeat(40), confirmacion: 'a1'.repeat(40) }, 'maximo'],
    ];
    for (const [cuerpo, regla] of casos) {
      const r = await agente.post('/api/auth/cambiar-contrasena').send(cuerpo).expect(400);
      assert.equal(r.body.codigo, 'CONTRASENA_INVALIDA');
      assert.equal(r.body.reglas.find((x) => x.regla === regla).cumple, false, regla);
    }
    const igual = await agente.post('/api/auth/cambiar-contrasena').send({ nueva: TEMPORAL, confirmacion: TEMPORAL }).expect(400);
    assert.equal(igual.body.codigo, 'CONTRASENA_REPETIDA');
  });

  test('"Guardar y entrar": pasa a Activo, queda en la bitácora y la sesión anterior se cierra', async () => {
    const { r: r0, agente } = await entrar('smendez', TEMPORAL);
    const vieja = r0.headers['set-cookie'][0].split(';')[0];
    const r = await agente.post('/api/auth/cambiar-contrasena').send({ nueva: 'Sofia2026x', confirmacion: 'Sofia2026x' }).expect(200);
    assert.equal(r.body.usuario.estado, 'activo');
    assert.equal(r.body.usuario.requiere_cambio_pw, false);
    assert.deepEqual(r.body.permisos.map((p) => p.clave), ['comanda.abrir', 'comanda.pedir_cuenta', 'mesa.ver']);
    await agente.get('/api/auth/sesion').expect(200);                                     // la nueva cookie sirve
    await request(app).get('/api/auth/sesion').set('Cookie', vieja).expect(401);          // la de la temporal no
    const acciones = (await bd(`SELECT accion, usuario_id = entidad_id AS por_el_mismo FROM bitacora
                                WHERE entidad = 'usuario' AND entidad_id = (SELECT id FROM usuario WHERE nombre_usuario = 'smendez')
                                ORDER BY id`)).map((b) => `${b.accion}:${b.por_el_mismo}`);
    assert.ok(acciones.includes('cambiar_estado:true'));
    assert.ok(acciones.includes('cambiar_contrasena_temporal:true'));
    assert.equal((await entrar('smendez', TEMPORAL)).r.status, 401);
    assert.equal((await entrar('smendez', 'Sofia2026x')).r.status, 200);
  });

  test('restablecer desde el servidor: contraseña temporal, cambio obligatorio y sesiones cerradas', async () => {
    const abierta = await entrar('lmora', DEMO);
    const t = await restablecerDesdeServidor('lmora');
    assert.match(t.temporal, /^[A-Za-z]{6}\d{4}$/);
    await abierta.agente.get('/api/auth/sesion').expect(401);
    const { r } = await entrar('lmora', t.temporal);
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.estado, 'activo');
    assert.equal(r.body.usuario.requiere_cambio_pw, true);
    const [b] = await bd(`SELECT accion FROM bitacora WHERE entidad_id = (SELECT id FROM usuario WHERE nombre_usuario = 'lmora') ORDER BY id DESC LIMIT 1`);
    assert.equal(b.accion, 'restablecer_contrasena');
  });

  test('primer gerente desde el servidor: nace Pendiente con todos los permisos tras crear su contraseña', async () => {
    const g = await crearGerenteDesdeServidor('gerente2', 'Gerente de Prueba');
    const { agente, r } = await entrar('gerente2', g.temporal);
    assert.equal(r.body.usuario.estado, 'pendiente');
    const c = await agente.post('/api/auth/cambiar-contrasena').send({ nueva: 'Gerente2026', confirmacion: 'Gerente2026' }).expect(200);
    assert.equal(c.body.permisos.length, 17);
  });

  test('cambio voluntario (ya Activo): pide la contraseña actual', async () => {
    const { agente } = await entrar('mdiaz', DEMO);
    const sin = await agente.post('/api/auth/cambiar-contrasena').send({ nueva: 'Marta2026x', confirmacion: 'Marta2026x' }).expect(400);
    assert.equal(sin.body.codigo, 'CONTRASENA_ACTUAL');
    await agente.post('/api/auth/cambiar-contrasena').send({ actual: DEMO, nueva: 'Marta2026x', confirmacion: 'Marta2026x' }).expect(200);
  });
});
