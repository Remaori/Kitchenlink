// Pruebas de 04 · Mesas: Crear mesa, bloqueo (operaciones de mesas) y el mapa del salón (monitoreo)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, mesaId, ultimaBitacora, relojDePantallas } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let gerente; let hostess; let mesero;
const mapa = async (agente = gerente) => (await agente.get('/api/mesas').expect(200)).body;
const tarjeta = async (numero, agente) => (await mapa(agente)).mesas.find((m) => m.numero === numero);

before(async () => {
  await prepararBase();
  relojDePantallas();
  ({ agente: gerente } = await entrar('lsaenz'));
  ({ agente: hostess } = await entrar('alopez'));
  ({ agente: mesero } = await entrar('cruiz'));
});
after(cerrarBase);

describe('04 · El salón a las 19:09', () => {
  test('contadores: Ocupadas = Por atender + Comanda abierta + Por cobrar', async () => {
    const { resumen } = await mapa();
    assert.deepEqual(resumen, { total: 18, libres: 7, ocupadas: 8, reservadas: 2, bloqueadas: 1 });
  });

  test('lo que dice cada tarjeta sale de la base', async () => {
    const { mesas } = await mapa();
    const m = Object.fromEntries(mesas.map((x) => [x.numero, x]));
    assert.equal(m['16'].estado_etiqueta, 'Bloqueada');
    assert.equal(m['16'].motivo_bloqueo, 'En limpieza');
    assert.equal(m['16'].bloqueada_por, 'Hostess');
    assert.equal(m['10'].libre_porque_no_llego, 'Paola Ruiz');
    assert.equal(m['02'].estado_etiqueta, 'Por cobrar');
    assert.equal(m['02'].total, '980.20');
    assert.equal(m['08'].en_preparacion, 'Arrachera 350 g');
    assert.equal(new Date(m['08'].en_preparacion_desde).toISOString(), '2026-09-23T00:52:00.000Z'); // 18:52
    assert.equal(m['21'].grupo_de_reservacion, 'Familia Torres');
    assert.equal(m['05'].grupo_por_atender, 'Mariana Soto');
    assert.equal(m['07'].proxima_reservacion_estado, 'por_confirmar');
    assert.equal(m['03'].proxima_reservacion, 'Ana Martínez');
  });

  test('lo consultan gerente, hostess, mesero y caja; cocina no', async () => {
    await mapa(hostess);
    await mapa(mesero);
    const { agente: caja } = await entrar('mdiaz');
    await mapa(caja);
    const { agente: cocina } = await entrar('dbenitez');
    await cocina.get('/api/mesas').expect(403);
  });

  test('detalle de una mesa con las comandas que ya tuvo hoy', async () => {
    const r = await gerente.get(`/api/mesas/${await mesaId('06')}`).expect(200);
    assert.deepEqual(r.body.comandas_de_hoy.map((c) => `${c.folio} · ${c.estado_etiqueta} · ${c.total}`), ['C-1038 · Cerrada · 313.20']);
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
    assert.equal((await mapa()).resumen.total, 19);
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

  test('editar: no se baja la capacidad por debajo de una reservación ya hecha', async () => {
    const tres = await mesaId('03');
    const a = await gerente.put(`/api/mesas/${tres}`).send({ numero: '03', capacidad: 4, zona: 'Salón' }).expect(409);
    assert.equal(a.body.campos.capacidad, 'Tiene la reservación de Ana Martínez para 6 personas: cámbiala de mesa primero.');
    const id = await mesaId('22');
    const b = await gerente.put(`/api/mesas/${id}`).send({ numero: '22', capacidad: 6, zona: 'Terraza' }).expect(200);
    assert.equal(b.body.capacidad, 6);
    assert.deepEqual((await ultimaBitacora('mesa', id)).detalle, { capacidad: { de: 4, a: 6 } });
  });

  test('dar de baja: solo libre y sin reservaciones; no se borra y se reactiva', async () => {
    const a = await gerente.post(`/api/mesas/${await mesaId('08')}/dar-de-baja`).expect(409);
    assert.equal(a.body.mensaje, 'La Mesa 08 no está libre (está: Comanda abierta): solo se da de baja una mesa libre o bloqueada.');
    const b = await gerente.post(`/api/mesas/${await mesaId('07')}/dar-de-baja`).expect(409);
    assert.equal(b.body.mensaje, 'La Mesa 07 tiene la reservación de Luis Herrera: cámbiala de mesa o cancélala primero.');
    const id = await mesaId('22');
    await gerente.post(`/api/mesas/${id}/dar-de-baja`).expect(200);
    const m = await mapa();
    assert.equal(m.mesas.some((x) => x.numero === '22'), false);
    assert.deepEqual(m.dadas_de_baja.map((x) => x.numero), ['22']);
    await gerente.post(`/api/mesas/${id}/reactivar`).expect(200);
  });
});

describe('04 · Operaciones: bloquear y desbloquear', () => {
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
    await mesero.post(`/api/mesas/${await mesaId('14')}/bloquear`).send({ motivo: 'Prueba' }).expect(403);
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

describe('04 · Al mismo tiempo', () => {
  test('la misma mesa creada dos veces a la vez: se crea una y la otra ve el aviso en su campo', async () => {
    const crear = () => gerente.post('/api/mesas').send({ numero: '30', capacidad: 4, zona: 'Terraza' });
    // La bitácora retiene a las dos justo antes de terminar: las dos ya revisaron el número
    const r = await alMismoTiempo({ candado: 'LOCK TABLE bitacora IN EXCLUSIVE MODE', peticiones: [crear, crear] });
    assert.deepEqual(estados(r), [201, 409]);
    assert.equal(r.find((x) => x.status === 409).body.campos?.numero, 'Ya existe la Mesa 30.');
  });
});
