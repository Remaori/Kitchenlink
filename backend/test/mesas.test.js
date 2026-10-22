// Pruebas de 04 · Mesas: Crear mesa y operaciones de mesas (bloqueo; cambiar mesa o personas desde 05a)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, idDe, mesaId, comandaId, ultimaBitacora, relojDePantallas } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let gerente; let hostess; let mesero;
const mapa = async (agente = gerente) => (await agente.get('/api/mesas').expect(200)).body;
const tarjeta = async (numero, agente) => (await mapa(agente)).mesas.find((m) => m.numero === numero);
const estadoMesa = async (numero) => (await bd('SELECT estado::text AS e FROM mesa WHERE numero = $1', [numero]))[0].e;
let luis;

before(async () => {
  await prepararBase();
  ({ agente: gerente } = await entrar('lsaenz'));
  ({ agente: hostess } = await entrar('alopez'));
  ({ agente: mesero } = await entrar('cruiz'));
});
after(cerrarBase);

describe('04 · Las mesas del salón', () => {
  test('las 18 mesas en servicio, ordenadas, con capacidad, zona y estado', async () => {
    const { mesas } = await mapa();
    assert.equal(mesas.length, 18);
    assert.deepEqual(mesas.slice(0, 3).map((m) => m.numero), ['01', '02', '03']);
    const ocho = mesas.find((m) => m.numero === '08');
    assert.equal(ocho.estado_etiqueta, 'Comanda abierta');
    assert.ok(ocho.capacidad > 0);
  });

  test('lo consultan gerente, hostess, mesero y caja; cocina no', async () => {
    await mapa(hostess);
    await mapa(mesero);
    const { agente: caja } = await entrar('mdiaz');
    await mapa(caja);
    const { agente: cocina } = await entrar('dbenitez');
    await cocina.get('/api/mesas').expect(403);
  });

  test('solo quien administra mesas ve las dadas de baja', async () => {
    assert.ok(Array.isArray((await mapa()).dadas_de_baja));
    assert.equal((await mapa(mesero)).dadas_de_baja, undefined);
  });
});

describe('04 · Crear mesa', () => {
  test('nace Libre, con dos cifras en el número y queda en la bitácora', async () => {
    const r = await hostess.post('/api/mesas').send({ numero: '22', capacidad: 4, zona: 'Terraza' }).expect(201);
    assert.equal(r.body.numero, '22');
    assert.equal(r.body.estado_etiqueta, 'Libre');
    const b = await ultimaBitacora('mesa', r.body.id);
    assert.equal(b.accion, 'crear_mesa');
    assert.equal(b.por, 'alopez');
    assert.equal((await mapa()).mesas.length, 19);
  });

  test('"7" es la Mesa 07: no se repite; la capacidad va de 1 a 30', async () => {
    const a = await gerente.post('/api/mesas').send({ numero: '7', capacidad: 4 }).expect(409);
    assert.equal(a.body.campos.numero, 'Ya existe la Mesa 07.');
    const b = await gerente.post('/api/mesas').send({ numero: '30', capacidad: 0 }).expect(400);
    assert.equal(b.body.campos.capacidad, 'La capacidad: mínimo 1.');
    const c = await gerente.post('/api/mesas').send({ numero: 'T 1', capacidad: 31 }).expect(400);
    assert.ok(c.body.campos.numero && c.body.campos.capacidad);
  });

  test('el número es un entero del 1 al 999: sin letras, signos ni decimales (revisión del 21 oct)', async () => {
    for (const numero of ['T1', 'Barra-2', '-3', '+5', '2.5', '1e2', '0', '00', '1000']) {
      const r = await gerente.post('/api/mesas').send({ numero, capacidad: 2 }).expect(400);
      assert.equal(r.body.campos.numero, 'El número: solo números enteros del 1 al 999 (ej. 7 o 22).', numero);
    }
    const r = await gerente.post('/api/mesas').send({ numero: '007', capacidad: 2 }).expect(409);
    assert.equal(r.body.campos.numero, 'Ya existe la Mesa 07.');
    // La base también lo exige, aunque alguien se salte la API
    await assert.rejects(bd("INSERT INTO mesa (numero, capacidad) VALUES ('T1', 2)"), /ck_mesa_numero/);
  });

  test('el mesero no crea mesas', async () => {
    const r = await mesero.post('/api/mesas').send({ numero: '40', capacidad: 2 }).expect(403);
    assert.equal(r.body.mensaje, 'Mesero no tiene el permiso «Crear y bloquear mesas».');
  });

  test('editar guarda qué cambió y no baja la capacidad por debajo de una reservación ya hecha', async () => {
    const id = await mesaId('22');
    const a = await gerente.put(`/api/mesas/${id}`).send({ numero: '22', capacidad: 6, zona: 'Terraza' }).expect(200);
    assert.equal(a.body.capacidad, 6);
    assert.deepEqual((await ultimaBitacora('mesa', id)).detalle, { capacidad: { de: 4, a: 6 } });
    // Una reservación para mañana (la hostess la registra en 03a)
    await bd(`INSERT INTO reservacion (nombre_cliente, numero_personas, fecha_hora, mesa_id, registrada_por_usuario_id)
              VALUES ('Ana Martínez', 6, now() + interval '1 day', $1, $2)`, [id, await idDe('alopez')]);
    const b = await gerente.put(`/api/mesas/${id}`).send({ numero: '22', capacidad: 4, zona: 'Terraza' }).expect(409);
    assert.equal(b.body.campos.capacidad, 'Tiene la reservación de Ana Martínez para 6 personas: cámbiala de mesa primero.');
  });

  test('dar de baja: solo libre y sin reservaciones; no se borra y se reactiva', async () => {
    const a = await gerente.post(`/api/mesas/${await mesaId('08')}/dar-de-baja`).expect(409);
    assert.equal(a.body.mensaje, 'La Mesa 08 no está libre (está: Comanda abierta): solo se da de baja una mesa libre o bloqueada.');
    const b = await gerente.post(`/api/mesas/${await mesaId('22')}/dar-de-baja`).expect(409);
    assert.equal(b.body.mensaje, 'La Mesa 22 tiene la reservación de Ana Martínez: cámbiala de mesa o cancélala primero.');
    const { id } = (await gerente.post('/api/mesas').send({ numero: '23', capacidad: 2 }).expect(201)).body;
    await gerente.post(`/api/mesas/${id}/dar-de-baja`).expect(200);
    const m = await mapa();
    assert.equal(m.mesas.some((x) => x.numero === '23'), false);
    assert.deepEqual(m.dadas_de_baja.map((x) => x.numero), ['23']);
    const c = await gerente.post('/api/mesas').send({ numero: '23', capacidad: 2 }).expect(409);
    assert.equal(c.body.campos.numero, 'La Mesa 23 existe pero está dada de baja: reactívala.');
    await gerente.post(`/api/mesas/${id}/reactivar`).expect(200);
    assert.equal((await mapa()).mesas.some((x) => x.numero === '23'), true);
  });
});

describe('04 · Operaciones: bloquear y desbloquear', () => {
  before(async () => {
    relojDePantallas();
    ({ agente: luis } = await entrar('lmora'));
  });

  test('bloquear pide motivo y queda quién lo hizo', async () => {
    const id = await mesaId('13');
    const a = await hostess.post(`/api/mesas/${id}/bloquear`).send({}).expect(400);
    assert.ok(a.body.campos.motivo);
    await hostess.post(`/api/mesas/${id}/bloquear`).send({ motivo: 'Mantel manchado' }).expect(200);
    const t = await tarjeta('13');
    assert.equal(t.estado, 'bloqueada');
    assert.equal(t.bloqueada_por, 'Hostess');
    const b = await ultimaBitacora('mesa', id);
    assert.deepEqual([b.accion, b.detalle, b.por], ['bloquear', { motivo: 'Mantel manchado' }, 'alopez']);
  });

  test('solo se bloquea una mesa libre (lo dice la base)', async () => {
    const r = await gerente.post(`/api/mesas/${await mesaId('08')}/bloquear`).send({ motivo: 'Prueba' }).expect(409);
    assert.equal(r.body.mensaje, 'Solo se puede bloquear una mesa libre (la mesa 08 está: Comanda abierta).');
    await luis.post(`/api/mesas/${await mesaId('14')}/bloquear`).send({ motivo: 'Prueba' }).expect(403);
  });

  test('desbloquear la deja libre desde ese momento', async () => {
    await gerente.post(`/api/mesas/${await mesaId('13')}/desbloquear`).expect(200);
    const t = await tarjeta('13');
    assert.equal(t.estado, 'libre');
    assert.equal(new Date(t.libre_desde).toISOString(), '2026-09-23T01:09:00.000Z');
    const r = await gerente.post(`/api/mesas/${await mesaId('14')}/desbloquear`).expect(409);
    assert.equal(r.body.mensaje, 'La Mesa 14 no está bloqueada.');
  });
});

describe('05a · Operaciones de mesas: cambiar mesa y personas', () => {
  test('cambiar mesa: solo a una libre donde quepan; la anterior se libera y queda en bitácora', async () => {
    const id = await comandaId('C-1042');
    const a = await mesero.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('09') }).expect(409);
    assert.equal(a.body.mensaje, 'Solo se puede cambiar a una mesa libre (la mesa 09 está: Comanda abierta).');
    const b = await mesero.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('14') }).expect(409);
    assert.equal(b.body.mensaje, 'La Mesa 14 es para 2 personas y en la comanda hay 6.');
    const r = await mesero.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('07') }).expect(200);
    assert.equal(r.body.mesa, '07');
    assert.deepEqual([await estadoMesa('08'), await estadoMesa('07')], ['libre', 'comanda_abierta']);
    assert.equal((await ultimaBitacora('comanda', id)).accion, 'cambiar_mesa');
  });

  test('cambiar personas, hasta la capacidad de la mesa', async () => {
    const id = await comandaId('C-1042');
    const r = await mesero.put(`/api/comandas/${id}/personas`).send({ numero_personas: 7 }).expect(200);
    assert.equal(r.body.numero_personas, 7);
    assert.deepEqual((await ultimaBitacora('comanda', id)).detalle, { de: 6, a: 7 });
    const x = await mesero.put(`/api/comandas/${id}/personas`).send({ numero_personas: 9 }).expect(409);
    assert.equal(x.body.mensaje, 'La Mesa 07 es para 8 personas: para 9, cámbialos a una mesa más grande.');
  });

  test('otro mesero no cambia una comanda que no es suya', async () => {
    const r = await luis.put(`/api/comandas/${await comandaId('C-1042')}/personas`).send({ numero_personas: 5 });
    assert.equal(r.status, 403);
  });
});

describe('04 · Al mismo tiempo', () => {
  test('la misma mesa creada dos veces a la vez: se crea una y la otra ve el aviso en su campo', async () => {
    const crear = () => gerente.post('/api/mesas').send({ numero: '30', capacidad: 4, zona: 'Terraza' });
    // La bitácora retiene a las dos justo antes de terminar: las dos ya revisaron el número
    const r = await alMismoTiempo({ candado: 'LOCK TABLE bitacora IN EXCLUSIVE MODE', peticiones: [crear, crear] });
    assert.deepEqual(estados(r), [201, 409]);
    assert.equal(r.find((x) => x.status === 409).body.campos?.numero, 'Ya existe la Mesa 30.');
  });
});
