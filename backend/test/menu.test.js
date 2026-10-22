// Pruebas de 09 · Menú y productos (Codificación de Gestionar menú, categorías y productos)
import './entorno.js';
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBase, cerrarBase, entrar, bd, productoId, ultimaBitacora } from './ayudantes.js';
import { alMismoTiempo, estados } from './concurrencia.js';

let gerente; let cocina; let mesero;
const catalogo = async (agente = gerente) => (await agente.get('/api/menu').expect(200)).body;
const categoriaId = async (nombre) => (await bd('SELECT id FROM categoria WHERE nombre = $1', [nombre]))[0].id;

before(async () => {
  await prepararBase();
  ({ agente: gerente } = await entrar('lsaenz'));
  ({ agente: cocina } = await entrar('dbenitez'));
  ({ agente: mesero } = await entrar('cruiz'));
});
after(cerrarBase);

describe('09 · Catálogo', () => {
  test('las 5 categorías en su orden, con dónde se preparan y cuántos productos tienen', async () => {
    const { categorias, productos } = await catalogo();
    assert.deepEqual(categorias.map((k) => `${k.nombre}: ${k.destino_etiqueta} · ${k.productos}`),
      ['Entradas: Cocina · 2', 'Platos fuertes: Cocina · 8', 'Bebidas: Barra · 2', 'Postres: Cocina · 6', 'Bar: Barra · 1']);
    assert.equal(productos.length, 19);
    const risotto = productos.find((p) => p.nombre === 'Risotto de hongos');
    assert.equal(risotto.precio, '225.00');
    assert.equal(risotto.disponible, false);
    assert.equal(risotto.motivo_no_disponible, 'No llegaron los hongos');
    assert.equal(categorias.find((k) => k.nombre === 'Postres').productos_86, 1);
  });

  test('el mesero y cocina lo consultan; la hostess no', async () => {
    assert.equal((await catalogo(mesero)).productos.length, 19);
    assert.equal((await catalogo(cocina)).categorias.length, 5);
    const { agente: hostess } = await entrar('alopez');
    const r = await hostess.get('/api/menu').expect(403);
    assert.equal(r.body.codigo, 'SIN_PERMISO');
  });

  test('solo «Administrar menú y productos» cambia el catálogo', async () => {
    const pasta = await productoId('Pasta Alfredo');
    await mesero.post('/api/menu/productos').send({ categoria_id: 1, nombre: 'Intruso', precio: 1 }).expect(403);
    const r = await cocina.put(`/api/menu/productos/${pasta}`).send({ categoria_id: 1, nombre: 'Pasta', precio: 1 }).expect(403);
    assert.equal(r.body.mensaje, 'Jefe de cocina no tiene el permiso «Administrar menú y productos».');
  });
});

describe('09 · Categorías', () => {
  test('nueva categoría: va al final del menú y queda en la bitácora', async () => {
    const r = await gerente.post('/api/menu/categorias').send({ nombre: '  Desayunos ', destino: 'cocina' }).expect(201);
    assert.equal(r.body.nombre, 'Desayunos');
    assert.equal(r.body.orden, 6);
    assert.equal(r.body.productos, 0);
    const b = await ultimaBitacora('categoria', r.body.id);
    assert.equal(b.accion, 'crear_categoria');
    assert.equal(b.por, 'lsaenz');
  });

  test('el nombre no se repite aunque cambien las mayúsculas, y el destino es cocina o barra', async () => {
    const a = await gerente.post('/api/menu/categorias').send({ nombre: 'BEBIDAS', destino: 'barra' }).expect(409);
    assert.equal(a.body.campos.nombre, 'Ya existe la categoría «Bebidas».');
    const b = await gerente.post('/api/menu/categorias').send({ nombre: 'Café', destino: 'cafetería' }).expect(400);
    assert.ok(b.body.campos.destino);
    const c = await gerente.post('/api/menu/categorias').send({ nombre: 'C', destino: 'barra', orden: 'dos' }).expect(400);
    assert.ok(c.body.campos.nombre && c.body.campos.orden);
  });

  test('editar "Se prepara en" y el orden; la bitácora guarda qué cambió', async () => {
    const id = await categoriaId('Postres');
    const r = await gerente.put(`/api/menu/categorias/${id}`).send({ nombre: 'Postres', destino: 'barra', orden: 7 }).expect(200);
    assert.equal(r.body.destino_etiqueta, 'Barra');
    const b = await ultimaBitacora('categoria', id);
    assert.deepEqual(b.detalle, { destino: { de: 'cocina', a: 'barra' }, orden: { de: 4, a: 7 } });
    await gerente.put(`/api/menu/categorias/${id}`).send({ nombre: 'Postres', destino: 'cocina', orden: 4 }).expect(200);
  });

  test('una categoría con productos no se da de baja; vacía sí, y se reactiva', async () => {
    const a = await gerente.post(`/api/menu/categorias/${await categoriaId('Bebidas')}/dar-de-baja`).expect(409);
    assert.equal(a.body.mensaje, 'La categoría Bebidas tiene 2 productos en el menú: muévelos a otra categoría o quítalos del menú primero.');
    const id = await categoriaId('Desayunos');
    const b = await gerente.post(`/api/menu/categorias/${id}/dar-de-baja`).expect(200);
    assert.equal(b.body.activo, false);
    const c = await gerente.post('/api/menu/productos').send({ categoria_id: id, nombre: 'Chilaquiles', precio: 120 }).expect(409);
    assert.equal(c.body.campos.categoria_id, 'La categoría Desayunos está dada de baja: elige otra.');
    assert.equal((await catalogo(mesero)).categorias.some((k) => k.nombre === 'Desayunos'), false);
    await gerente.post(`/api/menu/categorias/${id}/reactivar`).expect(200);
  });
});

describe('09 · Productos', () => {
  test('nuevo producto: el precio se guarda exacto (NUMERIC) y sale en el menú del mesero', async () => {
    const r = await gerente.post('/api/menu/productos')
      .send({ categoria_id: await categoriaId('Bar'), nombre: 'Mezcal  joven', descripcion: 'Con naranja', precio: '$1,250.5' }).expect(201);
    assert.equal(r.body.nombre, 'Mezcal joven');
    assert.equal(r.body.precio, '1250.50');
    assert.equal(r.body.disponible, true);
    assert.ok((await catalogo(mesero)).productos.some((p) => p.nombre === 'Mezcal joven' && p.destino === 'barra'));
  });

  test('datos inválidos y nombres repetidos en la misma categoría', async () => {
    const bar = await categoriaId('Bar');
    const a = await gerente.post('/api/menu/productos').send({ categoria_id: bar, nombre: 'Algo', precio: '12.345' }).expect(400);
    assert.match(a.body.campos.precio, /120\.50/);
    const b = await gerente.post('/api/menu/productos').send({ nombre: '', precio: '' }).expect(400);
    assert.deepEqual(Object.keys(b.body.campos).sort(), ['categoria_id', 'nombre', 'precio']);
    const c = await gerente.post('/api/menu/productos').send({ categoria_id: bar, nombre: 'MARGARITA', precio: 99 }).expect(409);
    assert.equal(c.body.campos.nombre, 'Ya existe «Margarita» en Bar.');
    // En otra categoría el nombre sí se puede usar
    await gerente.post('/api/menu/productos').send({ categoria_id: await categoriaId('Bebidas'), nombre: 'Margarita', precio: 60 }).expect(201);
  });

  test('cambiar el precio no altera las comandas: el precio se congeló al capturar', async () => {
    const id = await productoId('Limonada natural');
    const r = await gerente.put(`/api/menu/productos/${id}`)
      .send({ categoria_id: await categoriaId('Bebidas'), nombre: 'Limonada natural', precio: 50 }).expect(200);
    assert.equal(r.body.precio, '50.00');
    const [linea] = await bd("SELECT importe FROM v_comanda_detalle WHERE folio = 'C-1042' AND nombre_producto = 'Limonada natural'");
    assert.equal(linea.importe, '135.00');
    const b = await ultimaBitacora('producto', id);
    assert.equal(b.accion, 'editar_producto');
    assert.deepEqual(b.detalle, { precio: { de: '45.00', a: '50.00' } });
  });

  test('asignar 86 pide motivo, lo hace cocina y queda en la bitácora; quitar 86 lo regresa', async () => {
    const id = await productoId('Costillas BBQ');
    const a = await cocina.post(`/api/menu/productos/${id}/asignar-86`).send({ motivo: ' ' }).expect(400);
    assert.ok(a.body.campos.motivo);
    const r = await cocina.post(`/api/menu/productos/${id}/asignar-86`).send({ motivo: 'Se acabaron las costillas' }).expect(200);
    assert.equal(r.body.disponible, false);
    const b = await ultimaBitacora('producto', id);
    assert.equal(b.accion, 'asignar_86');
    assert.equal(b.por, 'dbenitez');
    const dos = await cocina.post(`/api/menu/productos/${id}/asignar-86`).send({ motivo: 'otra vez' }).expect(409);
    assert.equal(dos.body.mensaje, 'Costillas BBQ ya tiene 86.');
    await mesero.post(`/api/menu/productos/${id}/quitar-86`).expect(403);
    const q = await cocina.post(`/api/menu/productos/${id}/quitar-86`).expect(200);
    assert.equal(q.body.disponible, true);
    assert.equal(q.body.motivo_no_disponible, null);
  });

  test('quitar del menú no borra: sale del menú del mesero y se puede regresar', async () => {
    const id = await productoId('Arroz con leche');
    const r = await gerente.post(`/api/menu/productos/${id}/dar-de-baja`).expect(200);
    assert.equal(r.body.activo, false);
    assert.equal((await catalogo(mesero)).productos.some((p) => p.id === id), false);
    assert.equal((await catalogo()).productos.find((p) => p.id === id).activo, false);
    const e = await gerente.put(`/api/menu/productos/${id}`).send({ categoria_id: await categoriaId('Postres'), nombre: 'Arroz con leche', precio: 70 }).expect(409);
    assert.equal(e.body.mensaje, 'Arroz con leche no está en el menú: vuelve a agregarlo para editarlo.');
    await gerente.post(`/api/menu/productos/${id}/reactivar`).expect(200);
    assert.equal((await bd('SELECT activo FROM producto WHERE id = $1', [id]))[0].activo, true);
  });
});

describe('09 · Historial de 86 (tabla propia, revisión del 21 oct)', () => {
  test('cada 86 queda con su motivo, desde cuándo y quién; al quitarlo se cierra y no se borra', async () => {
    const id = await productoId('Guacamole');
    await cocina.post(`/api/menu/productos/${id}/asignar-86`).send({ motivo: 'Se acabó el aguacate' }).expect(200);
    await gerente.post(`/api/menu/productos/${id}/quitar-86`).expect(200);
    const filas = await bd(`SELECT o.motivo, ua.nombre_usuario AS marco, uq.nombre_usuario AS regreso, o.quitado_en >= o.asignado_en AS cerrado
                            FROM producto_86 o
                            LEFT JOIN usuario ua ON ua.id = o.asignado_por_usuario_id
                            LEFT JOIN usuario uq ON uq.id = o.quitado_por_usuario_id
                            WHERE o.producto_id = $1 ORDER BY o.id`, [id]);
    // El del 20 de septiembre (datos de demostración) y el de ahora: los dos se quedan
    assert.deepEqual(filas.map((f) => [f.motivo, f.marco, f.regreso, f.cerrado]), [
      ['Se acabó el aguacate', 'dbenitez', 'dbenitez', true],
      ['Se acabó el aguacate', 'dbenitez', 'lsaenz', true],
    ]);
  });

  test('el historial lo consultan el gerente y cocina, lo más reciente primero; el mesero no', async () => {
    const h = (await cocina.get('/api/menu/86').expect(200)).body;
    assert.equal(h[0].producto, 'Guacamole');
    assert.equal(h[0].quitado_por, 'Luis Sáenz Jiménez');
    const risotto = h.find((o) => o.producto === 'Risotto de hongos');
    assert.deepEqual([risotto.motivo, risotto.quitado_en, risotto.asignado_por], ['No llegaron los hongos', null, 'Luis Sáenz Jiménez']);
    await gerente.get('/api/menu/86').expect(200);
    await mesero.get('/api/menu/86').expect(403);
  });

  test('la base no deja dos 86 abiertos del mismo producto ni cambiar el motivo de uno', async () => {
    const id = await productoId('Risotto de hongos');
    await assert.rejects(bd("INSERT INTO producto_86 (producto_id, motivo) VALUES ($1, 'Otra vez')", [id]), /uq_producto_86_abierto/);
    await assert.rejects(bd("UPDATE producto_86 SET motivo = 'Otro' WHERE producto_id = $1 AND quitado_en IS NULL", [id]),
      /solo se registra cuándo se quitó/);
  });
});

describe('09 · Al mismo tiempo', () => {
  // La bitácora retiene a las dos justo antes de terminar: las dos ya revisaron sus reglas
  const RETENER_EN_BITACORA = 'LOCK TABLE bitacora IN EXCLUSIVE MODE';

  test('dar de baja una categoría mientras le agregan un producto: no queda un producto del menú en una categoría dada de baja', async () => {
    const k = (await gerente.post('/api/menu/categorias').send({ nombre: 'Temporada', destino: 'cocina' }).expect(201)).body;
    const r = await alMismoTiempo({
      candado: RETENER_EN_BITACORA,
      peticiones: [
        () => gerente.post(`/api/menu/categorias/${k.id}/dar-de-baja`),
        () => gerente.post('/api/menu/productos').send({ categoria_id: k.id, nombre: 'Ponche', precio: 45 }),
      ],
    });
    assert.equal(r.filter((x) => x.status < 300).length, 1, r.map((x) => `${x.status} ${x.body.mensaje ?? ''}`).join(' / '));
    const [n] = await bd(`SELECT count(*)::int AS n FROM producto p JOIN categoria k ON k.id = p.categoria_id
                          WHERE k.id = $1 AND NOT k.activo AND p.activo`, [k.id]);
    assert.equal(n.n, 0);
  });

  test('dos personas asignan 86 al mismo producto a la vez: se abre un solo registro', async () => {
    const id = await productoId('Churros con cajeta');
    const asignar = (agente) => () => agente.post(`/api/menu/productos/${id}/asignar-86`).send({ motivo: 'Se acabó la cajeta' });
    const r = await alMismoTiempo({ candado: RETENER_EN_BITACORA, peticiones: [asignar(cocina), asignar(gerente)] });
    assert.deepEqual(estados(r), [200, 409]);
    assert.equal(r.find((x) => x.status === 409).body.mensaje, 'Churros con cajeta ya tiene 86.');
    const [n] = await bd('SELECT count(*)::int AS n FROM producto_86 WHERE producto_id = $1 AND quitado_en IS NULL', [id]);
    assert.equal(n.n, 1);
  });

  test('dos gerentes crean la misma categoría a la vez (con otras mayúsculas): queda una y el otro ve el aviso', async () => {
    const nueva = (nombre) => () => gerente.post('/api/menu/categorias').send({ nombre, destino: 'barra' });
    const r = await alMismoTiempo({ candado: RETENER_EN_BITACORA, peticiones: [nueva('Mocteles'), nueva('MOCTELES')] });
    assert.deepEqual(estados(r), [201, 409]);
    assert.match(r.find((x) => x.status === 409).body.campos?.nombre ?? '', /^Ya existe la categoría/);
  });
});
