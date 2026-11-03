// Pruebas de 06 · Panel de cocina y barra (Consultar comandas pendientes y cambiar estado)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, relojDePantallas } from './ayudantes.js';

let cocina; let mesero;
const panel = async (destino = 'cocina', agente = cocina) => (await agente.get(`/api/produccion/${destino}`).expect(200)).body;
const envioId = async (folio, numero) => (await bd(
  'SELECT e.id FROM envio e JOIN comanda c ON c.id = e.comanda_id WHERE c.folio = $1 AND e.numero = $2', [folio, numero]))[0].id;
const titulo = (t) => `Mesa ${t.mesa} · Envío ${t.envio_numero}`;

before(async () => {
  await prepararBase();
  relojDePantallas();
  ({ agente: cocina } = await entrar('dbenitez'));
  ({ agente: mesero } = await entrar('cruiz'));
});
after(cerrarBase);

describe('06 · Panel de cocina a las 19:09', () => {
  test('tres columnas con las tarjetas del diseño, en su orden', async () => {
    const { columnas } = await panel();
    assert.deepEqual(columnas.por_preparar.map(titulo), ['Mesa 08 · Envío 2', 'Mesa 02 · Envío 3', 'Mesa 12 · Envío 1']);
    assert.deepEqual(columnas.en_preparacion.map(titulo), ['Mesa 08 · Envío 1', 'Mesa 15 · Envío 2']);
    assert.deepEqual(columnas.listo.map(titulo), ['Mesa 09 · Envío 1', 'Mesa 21 · Envío 2']);
  });

  test('cada tarjeta: productos con tiempo y nota, minutos, mesero, adicional y alergia', async () => {
    const { columnas } = await panel();
    const [m08e2, m02] = columnas.por_preparar;
    assert.deepEqual([m08e2.es_adicional, m08e2.mesero, m08e2.minutos_desde_envio, m08e2.nota_mesa],
      [true, 'Carlos Ruiz', 4, 'Un comensal es alérgico al cacahuate']);
    assert.deepEqual(m02.productos.map((p) => `${p.cantidad}× ${p.nombre_producto} · ${p.detalle_texto}`),
      ['1× Pastel de chocolate · 3er tiempo', '1× Flan napolitano · 3er tiempo · sin caramelo']);
    const m08e1 = columnas.en_preparacion[0];
    assert.equal(m08e1.minutos_desde_envio, 17);
    assert.equal(m08e1.productos[0].detalle_texto, '2º tiempo · término medio, papas a la francesa, sin cebolla');
    assert.equal(m08e1.resto_del_envio, 'De este envío ya se entregó: Pasta Alfredo; 3× Limonada natural lo hizo barra.');
    assert.equal(m08e1.accion, 'Marcar como listo');
    assert.deepEqual(columnas.listo.map((t) => t.minutos_desde_listo), [1, 3]);
  });

  test('barra no tiene pendientes (el café de la Mesa 08 no se ha enviado)', async () => {
    const { columnas } = await panel('barra');
    assert.equal(Object.values(columnas).flat().length, 0);
  });

  test('el mesero no ve el panel', async () => {
    await mesero.get('/api/produccion/cocina').expect(403);
    await cocina.get('/api/produccion/terraza').expect(404);
  });
});

describe('06 · Mover las tarjetas', () => {
  test('Empezar a preparar → Marcar como listo → Marcar como entregado', async () => {
    const id = await envioId('C-1044', 1);
    const a = await cocina.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'en_preparacion' }).expect(200);
    assert.equal(a.body.productos, 2);
    assert.ok((await panel()).columnas.en_preparacion.some((t) => t.envio_id === id));
    await cocina.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'listo' }).expect(200);
    const listo = (await panel()).columnas.listo[0];
    assert.equal(listo.envio_id, id);
    assert.equal(listo.minutos_desde_listo, 0);
    // El mesero recibe el aviso: su mesa tiene platillos listos
    const [m] = await bd("SELECT platillos_listos FROM v_mapa_mesas WHERE numero = '12'");
    assert.equal(Number(m.platillos_listos), 3);
    await cocina.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'entregado' }).expect(200);
    assert.equal((await panel()).columnas.listo.some((t) => t.envio_id === id), false);
  });

  test('no se salta pasos y el mesero no mueve las tarjetas (solo entrega)', async () => {
    const id = await envioId('C-1042', 2);
    const a = await cocina.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'listo' }).expect(409);
    assert.equal(a.body.mensaje, 'Esa tarjeta no tiene productos en «En preparación».');
    const b = await mesero.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'en_preparacion' }).expect(403);
    assert.equal(b.body.mensaje, 'Carlos Ruiz (Mesero) no tiene permiso para cambiar el estado de los platillos.');
    const entregado = await mesero.post(`/api/produccion/envios/${await envioId('C-1040', 1)}/avanzar`).send({ destino: 'cocina', estado: 'entregado' }).expect(200);
    assert.equal(entregado.body.productos, 1);
    const c = await cocina.post(`/api/produccion/envios/${id}/avanzar`).send({ destino: 'cocina', estado: 'cerrado' }).expect(400);
    assert.ok(c.body.campos.estado);
  });
});
