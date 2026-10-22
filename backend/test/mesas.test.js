// Pruebas de 04 · Mesas: Crear mesa (Codificación de Crear mesa)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, idDe, mesaId, ultimaBitacora } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let gerente; let hostess; let mesero;
const mapa = async (agente = gerente) => (await agente.get('/api/mesas').expect(200)).body;

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

describe('04 · Al mismo tiempo', () => {
  test('la misma mesa creada dos veces a la vez: se crea una y la otra ve el aviso en su campo', async () => {
    const crear = () => gerente.post('/api/mesas').send({ numero: '30', capacidad: 4, zona: 'Terraza' });
    // La bitácora retiene a las dos justo antes de terminar: las dos ya revisaron el número
    const r = await alMismoTiempo({ candado: 'LOCK TABLE bitacora IN EXCLUSIVE MODE', peticiones: [crear, crear] });
    assert.deepEqual(estados(r), [201, 409]);
    assert.equal(r.find((x) => x.status === 409).body.campos?.numero, 'Ya existe la Mesa 30.');
  });
});
