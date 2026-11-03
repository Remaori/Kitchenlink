// Pruebas de 05a/05b · Gestionar comanda y operaciones de mesas (cambio de mesa o de personas)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, mesaId, productoId, comandaId, ultimaBitacora, relojDePantallas, idDe } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let gerente; let carlos; let luis;
const estadoMesa = async (numero) => (await bd('SELECT estado::text AS e FROM mesa WHERE numero = $1', [numero]))[0].e;
const lineaId = async (folio, producto) => (await bd(
  'SELECT d.id FROM detalle_comanda d JOIN comanda c ON c.id = d.comanda_id WHERE c.folio = $1 AND d.nombre_producto = $2 ORDER BY d.id DESC LIMIT 1',
  [folio, producto]))[0].id;
const comanda = async (folio, agente = carlos) => (await agente.get(`/api/comandas/${await comandaId(folio)}`).expect(200)).body;

before(async () => {
  await prepararBase();
  relojDePantallas();
  ({ agente: gerente } = await entrar('lsaenz'));
  ({ agente: carlos } = await entrar('cruiz'));
  ({ agente: luis } = await entrar('lmora'));
});
after(cerrarBase);

describe('05b · La comanda de la Mesa 08 (19:09)', () => {
  test('encabezado, nota de mesa, envíos y totales como en el diseño', async () => {
    const { comanda: c, lineas, puede } = await comanda('C-1042');
    assert.equal(`Mesa ${c.mesa} · ${c.folio} · ${c.numero_personas} personas · ${c.mesero}`, 'Mesa 08 · C-1042 · 6 personas · Carlos Ruiz');
    assert.equal(c.nota_general, 'Un comensal es alérgico al cacahuate');
    assert.deepEqual([c.subtotal, c.iva, c.total], ['1355.00', '216.80', '1571.80']);
    assert.deepEqual(lineas.map((l) => `${l.envio_texto ?? 'SIN ENVIAR'} | ${l.cantidad}× ${l.nombre_producto} | ${l.estado_etiqueta}`), [
      'Envío 1 · 18:52 | 3× Limonada natural | Entregado',
      'Envío 1 · 18:52 | 1× Pasta Alfredo | Entregado',
      'Envío 1 · 18:52 | 2× Arrachera 350 g | En preparación',
      'Envío 2 · 19:05 · pedido adicional | 1× Tacos de camarón | Por preparar',
      'SIN ENVIAR | 1× Flan napolitano | Sin enviar',
      'SIN ENVIAR | 2× Café de olla | Sin enviar',
    ]);
    assert.deepEqual(puede, { trabajar: true, supervisar: false });
    assert.deepEqual((await comanda('C-1042', luis)).puede, { trabajar: false, supervisar: false });
  });

  test('el mesero ve sus comandas abiertas; el gerente, todas', async () => {
    const mias = (await carlos.get('/api/comandas').expect(200)).body.comandas;
    assert.deepEqual(mias.map((c) => `${c.mesa} ${c.folio} ${c.estado_etiqueta}`), ['02 C-1041 Por cobrar', '08 C-1042 Abierta', '12 C-1044 Abierta']);
    const todas = (await gerente.get('/api/comandas').expect(200)).body.comandas;
    assert.equal(todas.length, 7);
  });
});

describe('05a · Abrir comanda', () => {
  test('en la mesa que sentó la hostess: se vincula sola y queda a nombre de quien la abre', async () => {
    const r = await carlos.post('/api/comandas').send({ mesa_id: await mesaId('05'), numero_personas: 2 }).expect(201);
    assert.equal(r.body.comanda.folio, 'C-1046');
    assert.equal(r.body.comanda.mesero, 'Carlos Ruiz');
    assert.equal(r.body.comanda.lista_espera, 'Mariana Soto');
    assert.equal(await estadoMesa('05'), 'comanda_abierta');
  });

  test('la base rechaza mesas reservadas, bloqueadas u ocupadas', async () => {
    const a = await carlos.post('/api/comandas').send({ mesa_id: await mesaId('04'), numero_personas: 2 }).expect(409);
    assert.equal(a.body.mensaje, 'No se puede abrir comanda en la mesa 04: está Reservada.');
    const b = await carlos.post('/api/comandas').send({ mesa_id: await mesaId('08'), numero_personas: 2 }).expect(409);
    assert.equal(b.body.mensaje, 'No se puede abrir comanda en la mesa 08: está Comanda abierta.');
    await carlos.post('/api/comandas').send({ mesa_id: await mesaId('16'), numero_personas: 2 }).expect(409);
    const c = await carlos.post('/api/comandas').send({ mesa_id: await mesaId('13'), numero_personas: 0 }).expect(400);
    assert.ok(c.body.campos.numero_personas);
  });

  test('el mesero no la abre a nombre de otro; el gerente sí', async () => {
    const a = await carlos.post('/api/comandas').send({ mesa_id: await mesaId('13'), numero_personas: 3, mesero_usuario_id: (await bd("SELECT id FROM usuario WHERE nombre_usuario = 'lmora'"))[0].id }).expect(409);
    assert.equal(a.body.mensaje, 'Quien abre la comanda queda como su mesero: Carlos Ruiz no puede abrirla a nombre de Luis Mora.');
    const lm = (await gerente.get('/api/comandas/meseros').expect(200)).body.find((m) => m.nombre_completo === 'Luis Mora');
    const b = await gerente.post('/api/comandas').send({ mesa_id: await mesaId('13'), numero_personas: 3, mesero_usuario_id: lm.id }).expect(201);
    assert.equal(b.body.comanda.mesero, 'Luis Mora');
    assert.equal(b.body.comanda.folio, 'C-1047');
  });
});

describe('05a · Lo que ya pasó en la mesa', () => {
  test('el detalle de una mesa trae las comandas que ya tuvo hoy', async () => {
    const r = await gerente.get(`/api/mesas/${await mesaId('06')}`).expect(200);
    assert.deepEqual(r.body.comandas_de_hoy.map((c) => `${c.folio} · ${c.estado_etiqueta} · ${c.total}`), ['C-1038 · Cerrada · 313.20']);
  });
});

describe('05b · Capturar, enviar y pedir la cuenta', () => {
  test('tocar un producto lo agrega a «Sin enviar»; tocarlo otra vez suma; el precio lo pone el menú', async () => {
    const id = await comandaId('C-1042');
    await carlos.post(`/api/comandas/${id}/productos`).send({ producto_id: await productoId('Churros con cajeta'), tiempo: 3, precio_unitario: 1 }).expect(200);
    const r = await carlos.post(`/api/comandas/${id}/productos`).send({ producto_id: await productoId('Churros con cajeta'), tiempo: 3 }).expect(200);
    const churros = r.body.lineas.find((l) => l.nombre_producto === 'Churros con cajeta');
    assert.deepEqual([churros.cantidad, churros.importe, churros.estado, churros.detalle_texto], [2, '180.00', 'sin_enviar', '3er tiempo']);
    assert.equal(r.body.comanda.productos_sin_enviar, 3);
  });

  test('un producto con 86 no se captura', async () => {
    const r = await carlos.post(`/api/comandas/${await comandaId('C-1042')}/productos`).send({ producto_id: await productoId('Pay de limón') }).expect(409);
    assert.equal(r.body.mensaje, 'Pay de limón está agotado (86).');
  });

  test('otro mesero no trabaja una mesa que no es suya', async () => {
    const r = await luis.post(`/api/comandas/${await comandaId('C-1042')}/productos`).send({ producto_id: await productoId('Guacamole') }).expect(403);
    assert.equal(r.body.mensaje, 'Luis Mora no atiende la mesa 08 (es de Carlos Ruiz): no puede agregar productos. Para tomarla, Carlos Ruiz se la transfiere o lo hace el gerente.');
  });

  test('"Nota": cantidad, tiempo y nota mientras está sin enviar; "Quitar" lo borra', async () => {
    const id = await comandaId('C-1042');
    const churros = await lineaId('C-1042', 'Churros con cajeta');
    const r = await carlos.put(`/api/comandas/${id}/productos/${churros}`).send({ cantidad: 1, tiempo: 3, nota: 'cajeta aparte' }).expect(200);
    assert.equal(r.body.lineas.find((l) => l.id === churros).detalle_texto, '3er tiempo · cajeta aparte');
    const q = await carlos.delete(`/api/comandas/${id}/productos/${churros}`).expect(200);
    assert.equal(q.body.lineas.some((l) => l.id === churros), false);
    const x = await carlos.delete(`/api/comandas/${id}/productos/${await lineaId('C-1042', 'Tacos de camarón')}`).expect(409);
    assert.equal(x.body.mensaje, 'Solo se quitan productos Sin enviar. Lo que ya se envió se cancela con motivo y autorización del gerente.');
  });

  test('con productos sin enviar no se pide la cuenta; "Enviar" crea un envío adicional', async () => {
    const id = await comandaId('C-1042');
    const a = await carlos.post(`/api/comandas/${id}/pedir-cuenta`).expect(409);
    assert.equal(a.body.mensaje, 'Hay productos sin enviar: envíalos o quítalos antes de pedir la cuenta.');
    const r = await carlos.post(`/api/comandas/${id}/enviar`).expect(200);
    assert.equal(r.body.comanda.productos_sin_enviar, 0);
    assert.equal(r.body.comanda.envios, 3);
    assert.ok(r.body.lineas.filter((l) => l.envio_numero === 3).every((l) => l.estado === 'por_preparar' && l.es_adicional));
    await carlos.post(`/api/comandas/${id}/enviar`).expect(409);
  });

  test('pedir la cuenta: Por cobrar, la mesa también, y ya no se agrega', async () => {
    const id = await comandaId('C-1044');
    const r = await carlos.post(`/api/comandas/${id}/pedir-cuenta`).expect(200);
    assert.equal(r.body.comanda.estado_etiqueta, 'Por cobrar');
    assert.equal(r.body.comanda.tasa_impuesto, '0.1600');
    assert.equal(await estadoMesa('12'), 'por_cobrar');
    const x = await carlos.post(`/api/comandas/${id}/productos`).send({ producto_id: await productoId('Guacamole') }).expect(409);
    assert.equal(x.body.mensaje, 'La comanda C-1044 está Por cobrar: para agregar algo, la cajera cancela el pre-ticket y la comanda vuelve a Abierta.');
  });

  test('entregar lo que está Listo lo puede cualquier mesero (12, paso 6)', async () => {
    const id = await comandaId('C-1040'); // Mesa 09, de Luis Mora: el salmón está listo
    const r = await carlos.post(`/api/comandas/${id}/entregar`).send({}).expect(200);
    assert.equal(r.body.lineas.find((l) => l.nombre_producto === 'Salmón a la parrilla').estado_etiqueta, 'Entregado');
    await carlos.post(`/api/comandas/${id}/entregar`).send({}).expect(409);
  });
});

describe('Operaciones de mesas: cambiar mesa, personas y transferir', () => {
  test('cambiar mesa: solo a una libre donde quepan; la anterior se libera y queda en bitácora', async () => {
    const id = await comandaId('C-1042');
    const a = await carlos.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('09') }).expect(409);
    assert.equal(a.body.mensaje, 'Solo se puede cambiar a una mesa libre (la mesa 09 está: Comanda abierta).');
    const b = await carlos.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('14') }).expect(409);
    assert.equal(b.body.mensaje, 'La Mesa 14 es para 2 personas y en la comanda hay 6.');
    const r = await carlos.put(`/api/comandas/${id}/mesa`).send({ mesa_id: await mesaId('07') }).expect(200);
    assert.equal(r.body.comanda.mesa, '07');
    assert.deepEqual([await estadoMesa('08'), await estadoMesa('07')], ['libre', 'comanda_abierta']);
    assert.equal((await ultimaBitacora('comanda', id)).accion, 'cambiar_mesa');
    assert.ok(r.body.eventos.some((e) => e.texto === 'Cambió de la Mesa 08 a la Mesa 07'));
  });

  test('cambiar personas, hasta la capacidad de la mesa', async () => {
    const id = await comandaId('C-1042');
    const r = await carlos.put(`/api/comandas/${id}/personas`).send({ numero_personas: 7 }).expect(200);
    assert.equal(r.body.comanda.numero_personas, 7);
    assert.ok(r.body.eventos.some((e) => e.texto === 'Personas: 6 → 7'));
    const x = await carlos.put(`/api/comandas/${id}/personas`).send({ numero_personas: 9 }).expect(409);
    assert.equal(x.body.mensaje, 'La Mesa 07 es para 8 personas: para 9, cámbialos a una mesa más grande.');
  });

  test('otro mesero no cambia una comanda que no es suya', async () => {
    const r = await luis.put(`/api/comandas/${await comandaId('C-1042')}/personas`).send({ numero_personas: 5 });
    assert.equal(r.status, 403);
  });

  test('transferir: su mesero se la pasa a otro, que ya la trabaja; otro mesero no puede', async () => {
    const id = await comandaId('C-1046');
    const lm = (await bd("SELECT id FROM usuario WHERE nombre_usuario = 'lmora'"))[0].id;
    const cr = (await bd("SELECT id FROM usuario WHERE nombre_usuario = 'cruiz'"))[0].id;
    const r = await carlos.post(`/api/comandas/${id}/transferir`).send({ mesero_usuario_id: lm }).expect(200);
    assert.equal(r.body.comanda.mesero, 'Luis Mora');
    assert.ok(r.body.eventos.some((e) => e.texto === 'Se transfirió de Carlos Ruiz a Luis Mora'));
    await carlos.post(`/api/comandas/${id}/productos`).send({ producto_id: await productoId('Guacamole') }).expect(403);
    await luis.post(`/api/comandas/${id}/productos`).send({ producto_id: await productoId('Guacamole') }).expect(200);
    const x = await carlos.post(`/api/comandas/${id}/transferir`).send({ mesero_usuario_id: cr }).expect(403);
    assert.match(x.body.mensaje, /^Carlos Ruiz no atiende la mesa 05/);
  });
});

describe('05b · Cancelaciones con autorización del gerente', () => {
  test('cancelar un producto enviado pide motivo y la autorización de alguien con el permiso', async () => {
    const id = await comandaId('C-1042');
    const tacos = await lineaId('C-1042', 'Tacos de camarón');
    const ruta = `/api/comandas/${id}/productos/${tacos}/cancelar`;
    const a = await carlos.post(ruta).send({ motivo: 'Tardó demasiado' }).expect(403);
    assert.equal(a.body.codigo, 'AUTORIZACION_REQUERIDA');
    const b = await carlos.post(ruta).send({ motivo: 'Tardó demasiado', autoriza: { usuario: 'lsaenz', contrasena: 'equivocada' } }).expect(403);
    assert.equal(b.body.mensaje, 'Usuario o contraseña de quien autoriza incorrectos.');
    const c = await carlos.post(ruta).send({ motivo: 'Tardó demasiado', autoriza: { usuario: 'alopez', contrasena: 'Kitchen2026' } }).expect(403);
    assert.equal(c.body.mensaje, 'Ana López (Hostess) no puede autorizar cancelaciones.');
    await carlos.post(ruta).send({ motivo: '', autoriza: { usuario: 'lsaenz', contrasena: 'Kitchen2026' } }).expect(400);
    const r = await carlos.post(ruta).send({ motivo: 'Tardó demasiado', autoriza: { usuario: 'LSaenz', contrasena: 'Kitchen2026' } }).expect(200);
    assert.equal(r.body.lineas.find((l) => l.id === tacos).estado_etiqueta, 'Cancelado');
    assert.deepEqual(r.body.cancelaciones.map((k) => `${k.producto} · ${k.motivo} · ${k.monto} · ${k.solicito} · ${k.autorizo}`),
      ['Tacos de camarón · Tardó demasiado · 185.00 · Carlos Ruiz · Luis Sáenz Jiménez']);
  });

  test('el gerente cancela una comanda él mismo: la mesa se libera', async () => {
    const id = await comandaId('C-1045');
    const r = await gerente.post(`/api/comandas/${id}/cancelar`).send({ motivo: 'El grupo se fue antes de ordenar' }).expect(200);
    assert.equal(r.body.comanda.estado_etiqueta, 'Cancelada');
    assert.equal(await estadoMesa('17'), 'libre');
  });
});

describe('Una comanda cerrada', () => {
  test('el detalle de una comanda cerrada trae sus pagos', async () => {
    const d = await comanda('C-1038', gerente);
    assert.deepEqual(d.pagos.map((p) => `${p.metodo_etiqueta} ${p.monto} recibido ${p.monto_recibido} cambio ${p.cambio}`),
      ['Efectivo 313.20 recibido 500.00 cambio 186.80']);
    assert.equal(d.puede.trabajar, false);
  });
});

describe('El gerente y el mesero al mismo tiempo', () => {
  const mesaLibre = async () => (await bd(
    `SELECT id, numero FROM mesa m WHERE m.activo AND m.estado = 'libre'
       AND NOT EXISTS (SELECT 1 FROM reservacion r WHERE r.mesa_id = m.id AND r.estado IN ('por_confirmar','confirmada'))
     ORDER BY m.numero LIMIT 1`))[0];
  let abierta; // la comanda que se abre en la primera prueba

  test('abren comanda en la misma mesa a la vez: se abre una sola', async () => {
    const m = await mesaLibre();
    const datos = { mesa_id: m.id, numero_personas: 2, mesero_usuario_id: await idDe('cruiz') };
    // El folio retenido: las dos llegan antes de que exista la comanda
    const r = await alMismoTiempo({
      candado: "SELECT pg_advisory_xact_lock(hashtext('kitchenlink:folio:comanda'))",
      peticiones: [() => carlos.post('/api/comandas').send(datos), () => gerente.post('/api/comandas').send(datos)],
    });
    assert.deepEqual(estados(r), [201, 409]);
    assert.match(r.find((x) => x.status === 409).body.mensaje, new RegExp(`^No se puede abrir comanda en la mesa ${m.numero}`));
    abierta = r.find((x) => x.status === 201).body.comanda.id;
    const [n] = await bd("SELECT count(*)::int AS n FROM comanda WHERE mesa_id = $1 AND estado = 'abierta'", [m.id]);
    assert.equal(n.n, 1);
  });

  test('presionan Enviar a la vez: lo nuevo llega a cocina una sola vez', async () => {
    await carlos.post(`/api/comandas/${abierta}/productos`).send({ producto_id: await productoId('Flan napolitano'), cantidad: 2 }).expect(200);
    const r = await alMismoTiempo({
      candado: 'SELECT 1 FROM comanda WHERE id = $1 FOR SHARE', params: [abierta],
      peticiones: [() => carlos.post(`/api/comandas/${abierta}/enviar`), () => gerente.post(`/api/comandas/${abierta}/enviar`)],
    });
    assert.deepEqual(estados(r), [200, 409]);
    assert.equal(r.find((x) => x.status === 409).body.mensaje, 'No hay productos sin enviar.');
    const [e] = await bd('SELECT count(*)::int AS n FROM envio WHERE comanda_id = $1', [abierta]);
    assert.equal(e.n, 1);
  });

  test('abrir comanda en una mesa que el gerente está dando de baja: espera y se rechaza', async () => {
    const m = await mesaLibre();
    const r = await alMismoTiempo({
      candado: 'LOCK TABLE bitacora IN EXCLUSIVE MODE', // retiene la baja justo antes de terminar
      enOrden: true,
      peticiones: [
        () => gerente.post(`/api/mesas/${m.id}/dar-de-baja`),
        () => carlos.post('/api/comandas').send({ mesa_id: m.id, numero_personas: 2 }),
      ],
    });
    assert.deepEqual(r.map((x) => x.status), [200, 409]);
    assert.equal(r[1].body.campos?.mesa_id, `La Mesa ${m.numero} está dada de baja: elige otra.`);
    const [n] = await bd('SELECT count(*)::int AS n FROM comanda WHERE mesa_id = $1 AND estado = \'abierta\'', [m.id]);
    assert.equal(n.n, 0);
  });
});
