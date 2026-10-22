// 09 · Menú y productos (también "Menú" del mesero y "Productos 86" de cocina)
//
// Reglas que ya hace cumplir la base: el destino (cocina o barra) es de la
// categoría; el 86 lo asigna quien tiene «Asignar 86 a productos» y queda en
// la bitácora (tabla producto_86, tg_producto_86); un producto con 86 o fuera del menú no
// se puede capturar en una comanda (tg_detalle_agregar); el precio se congela
// en la comanda al capturarlo, así que cambiarlo aquí no altera cuentas.
// Aquí se agrega: nombres que no se repiten (sin importar mayúsculas), dar de
// baja en lugar de borrar, y la bitácora de altas y cambios.
import { consulta, conTransaccion, enFila } from '../db.js';
import { revisor } from '../validacion.js';
import { bitacora, campoInvalido, noExiste, regla } from './comun.js';

const DESTINOS = ['cocina', 'barra'];

const SQL_CATEGORIAS = `
  SELECT k.id, k.nombre, k.descripcion, k.destino::text AS destino, fn_etiqueta('destino_produccion', k.destino::text) AS destino_etiqueta,
         k.orden, k.activo,
         (SELECT count(*) FROM producto p WHERE p.categoria_id = k.id AND p.activo)::int AS productos,
         (SELECT count(*) FROM producto p WHERE p.categoria_id = k.id AND p.activo
            AND EXISTS (SELECT 1 FROM producto_86 o WHERE o.producto_id = p.id AND o.quitado_en IS NULL))::int AS productos_86
  FROM categoria k`;

const SQL_PRODUCTOS = `
  SELECT p.id, p.categoria_id, k.nombre AS categoria, k.destino::text AS destino, p.nombre, p.descripcion, p.precio,
         (o.id IS NULL) AS disponible, o.motivo AS motivo_no_disponible, o.asignado_en AS agotado_desde, p.activo
  FROM producto p JOIN categoria k ON k.id = p.categoria_id
  LEFT JOIN producto_86 o ON o.producto_id = p.id AND o.quitado_en IS NULL`;

/**
 * El catálogo. Quien administra el menú ve también lo dado de baja; los demás
 * (mesero, cocina) solo lo que está en el menú.
 */
export async function catalogo({ todo = false } = {}) {
  const [{ rows: categorias }, { rows: productos }] = await Promise.all([
    consulta(`${SQL_CATEGORIAS} ${todo ? '' : 'WHERE k.activo'} ORDER BY k.activo DESC, k.orden, k.id`),
    consulta(`${SQL_PRODUCTOS} ${todo ? '' : 'WHERE p.activo AND k.activo'} ORDER BY k.orden, k.id, p.activo DESC, p.id`),
  ]);
  return { categorias, productos };
}

const categoria = async (id) => {
  const { rows: [k] } = await consulta(`${SQL_CATEGORIAS} WHERE k.id = $1`, [id]);
  if (!k) throw noExiste('esa categoría');
  return k;
};
const producto = async (id) => {
  const { rows: [p] } = await consulta(`${SQL_PRODUCTOS} WHERE p.id = $1`, [id]);
  if (!p) throw noExiste('ese producto');
  return p;
};

// ---------------------------------------------------------------- Categorías

function revisarCategoria(cuerpo) {
  const v = revisor();
  const d = {
    nombre: v.texto('nombre', cuerpo.nombre, { etiqueta: 'El nombre', obligatorio: true, min: 2, max: 60 }),
    descripcion: v.texto('descripcion', cuerpo.descripcion, { etiqueta: 'La descripción', max: 200 }),
    destino: v.opcion('destino', cuerpo.destino, DESTINOS, { etiqueta: 'Dónde se prepara' }),
    orden: v.entero('orden', cuerpo.orden, { etiqueta: 'El orden en el menú', min: 0, max: 999 }),
  };
  v.terminar();
  return d;
}

// En fila: dos categorías iguales creadas a la vez, la segunda ve a la primera
async function exigirNombreCategoriaLibre(c, nombre, excepto = null) {
  await enFila(c, 'menu:categorias');
  const { rows: [otra] } = await c.query(
    'SELECT nombre FROM categoria WHERE lower(nombre) = lower($1) AND id IS DISTINCT FROM $2::bigint', [nombre, excepto]);
  if (otra) throw campoInvalido('nombre', `Ya existe la categoría «${otra.nombre}».`, 'DUPLICADO', 409);
}

/** "Nueva categoría" (sin orden, va al final) */
export async function crearCategoria(cuerpo, actorId) {
  const d = revisarCategoria(cuerpo ?? {});
  const id = await conTransaccion(actorId, async (c) => {
    await exigirNombreCategoriaLibre(c, d.nombre);
    const { rows: [k] } = await c.query(
      `INSERT INTO categoria (nombre, descripcion, destino, orden)
       VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(orden), 0) + 1 FROM categoria))) RETURNING id`,
      [d.nombre, d.descripcion, d.destino, d.orden]);
    await bitacora(c, 'categoria', k.id, 'crear_categoria', { nombre: d.nombre, destino: d.destino });
    return k.id;
  });
  return categoria(id);
}

/** Editar nombre, descripción, "Se prepara en" y "Orden en el menú" */
export async function editarCategoria(id, cuerpo, actorId) {
  const d = revisarCategoria(cuerpo ?? {});
  await conTransaccion(actorId, async (c) => {
    const { rows: [k] } = await c.query('SELECT nombre, descripcion, destino::text AS destino, orden, activo FROM categoria WHERE id = $1 FOR UPDATE', [id]);
    if (!k) throw noExiste('esa categoría');
    if (!k.activo) throw regla(`La categoría ${k.nombre} está dada de baja: reactívala para editarla.`);
    await exigirNombreCategoriaLibre(c, d.nombre, id);
    const nuevo = { ...d, orden: d.orden ?? k.orden };
    const cambios = Object.fromEntries(['nombre', 'descripcion', 'destino', 'orden']
      .filter((x) => nuevo[x] !== k[x]).map((x) => [x, { de: k[x], a: nuevo[x] }]));
    if (!Object.keys(cambios).length) return;
    await c.query('UPDATE categoria SET nombre = $1, descripcion = $2, destino = $3, orden = $4 WHERE id = $5',
      [nuevo.nombre, nuevo.descripcion, nuevo.destino, nuevo.orden, id]);
    await bitacora(c, 'categoria', id, 'editar_categoria', cambios);
  });
  return categoria(id);
}

/** Dar de baja: solo sin productos en el menú (nunca se borra: las comandas la referencian) */
export async function darDeBajaCategoria(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [k] } = await c.query('SELECT nombre, activo FROM categoria WHERE id = $1 FOR UPDATE', [id]);
    if (!k) throw noExiste('esa categoría');
    if (!k.activo) throw regla(`La categoría ${k.nombre} ya está dada de baja.`);
    // Se cuentan ya con la categoría bloqueada: así entra el producto que alguien acababa de agregar
    const { rows: [{ productos }] } = await c.query('SELECT count(*)::int AS productos FROM producto WHERE categoria_id = $1 AND activo', [id]);
    if (productos) {
      throw regla(`La categoría ${k.nombre} tiene ${productos === 1 ? '1 producto' : `${productos} productos`} en el menú: muévelos a otra categoría o quítalos del menú primero.`);
    }
    await c.query('UPDATE categoria SET activo = FALSE WHERE id = $1', [id]);
    await bitacora(c, 'categoria', id, 'dar_de_baja_categoria');
  });
  return categoria(id);
}

export async function reactivarCategoria(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [k] } = await c.query('UPDATE categoria SET activo = TRUE WHERE id = $1 AND NOT activo RETURNING id', [id]);
    if (!k) {
      const { rows: [x] } = await c.query('SELECT nombre FROM categoria WHERE id = $1', [id]);
      throw x ? regla(`La categoría ${x.nombre} ya está activa.`) : noExiste('esa categoría');
    }
    await bitacora(c, 'categoria', id, 'reactivar_categoria');
  });
  return categoria(id);
}

// ----------------------------------------------------------------- Productos

function revisarProducto(cuerpo) {
  const v = revisor();
  const d = {
    categoria_id: v.id('categoria_id', cuerpo.categoria_id, { etiqueta: 'La categoría' }),
    nombre: v.texto('nombre', cuerpo.nombre, { etiqueta: 'El nombre', obligatorio: true, min: 2, max: 120 }),
    descripcion: v.texto('descripcion', cuerpo.descripcion, { etiqueta: 'La descripción', max: 250 }),
    precio: v.dinero('precio', cuerpo.precio, { etiqueta: 'El precio', obligatorio: true }),
  };
  v.terminar();
  return d;
}

// FOR SHARE: mientras se agrega el producto, nadie da de baja la categoría
// (y si la están dando de baja, se espera a ver cómo quedó)
async function exigirCategoriaActiva(c, id) {
  const { rows: [k] } = await c.query('SELECT nombre, activo FROM categoria WHERE id = $1 FOR SHARE', [id]);
  if (!k) throw campoInvalido('categoria_id', 'Esa categoría no existe.');
  if (!k.activo) throw campoInvalido('categoria_id', `La categoría ${k.nombre} está dada de baja: elige otra.`, 'REGLA_DE_NEGOCIO', 409);
}

async function exigirNombreProductoLibre(c, categoriaId, nombre, excepto = null) {
  await enFila(c, 'menu:productos');
  const { rows: [otro] } = await c.query(
    `SELECT p.nombre, k.nombre AS categoria FROM producto p JOIN categoria k ON k.id = p.categoria_id
     WHERE p.categoria_id = $1 AND lower(p.nombre) = lower($2) AND p.id IS DISTINCT FROM $3::bigint`, [categoriaId, nombre, excepto]);
  if (otro) throw campoInvalido('nombre', `Ya existe «${otro.nombre}» en ${otro.categoria}.`, 'DUPLICADO', 409);
}

/** "Nuevo producto": entra al menú disponible */
export async function crearProducto(cuerpo, actorId) {
  const d = revisarProducto(cuerpo ?? {});
  const id = await conTransaccion(actorId, async (c) => {
    await exigirCategoriaActiva(c, d.categoria_id);
    await exigirNombreProductoLibre(c, d.categoria_id, d.nombre);
    const { rows: [p] } = await c.query(
      'INSERT INTO producto (categoria_id, nombre, descripcion, precio) VALUES ($1, $2, $3, $4) RETURNING id',
      [d.categoria_id, d.nombre, d.descripcion, d.precio]);
    await bitacora(c, 'producto', p.id, 'crear_producto', { nombre: d.nombre, precio: d.precio });
    return p.id;
  });
  return producto(id);
}

/** "Editar": nombre, descripción, precio y categoría */
export async function editarProducto(id, cuerpo, actorId) {
  const d = revisarProducto(cuerpo ?? {});
  await conTransaccion(actorId, async (c) => {
    const { rows: [p] } = await c.query('SELECT categoria_id, nombre, descripcion, precio, activo FROM producto WHERE id = $1 FOR UPDATE', [id]);
    if (!p) throw noExiste('ese producto');
    if (!p.activo) throw regla(`${p.nombre} no está en el menú: vuelve a agregarlo para editarlo.`);
    if (d.categoria_id !== p.categoria_id) await exigirCategoriaActiva(c, d.categoria_id);
    await exigirNombreProductoLibre(c, d.categoria_id, d.nombre, id);
    const cambios = Object.fromEntries(['categoria_id', 'nombre', 'descripcion', 'precio']
      .filter((x) => String(d[x] ?? '') !== String(p[x] ?? '')).map((x) => [x, { de: p[x], a: d[x] }]));
    if (!Object.keys(cambios).length) return;
    await c.query('UPDATE producto SET categoria_id = $1, nombre = $2, descripcion = $3, precio = $4 WHERE id = $5',
      [d.categoria_id, d.nombre, d.descripcion, d.precio, id]);
    await bitacora(c, 'producto', id, 'editar_producto', cambios);
  });
  return producto(id);
}

/** "Quitar del menú": ya no se ofrece, pero sigue en las comandas y reportes donde se vendió */
export async function darDeBajaProducto(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [p] } = await c.query('UPDATE producto SET activo = FALSE WHERE id = $1 AND activo RETURNING id', [id]);
    if (!p) {
      const { rows: [x] } = await c.query('SELECT nombre FROM producto WHERE id = $1', [id]);
      throw x ? regla(`${x.nombre} ya no está en el menú.`) : noExiste('ese producto');
    }
    await bitacora(c, 'producto', id, 'quitar_del_menu');
  });
  return producto(id);
}

export async function reactivarProducto(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [p] } = await c.query(
      'SELECT p.nombre, p.activo, p.categoria_id FROM producto p WHERE p.id = $1 FOR UPDATE', [id]);
    if (!p) throw noExiste('ese producto');
    if (p.activo) throw regla(`${p.nombre} ya está en el menú.`);
    await exigirCategoriaActiva(c, p.categoria_id);
    await c.query('UPDATE producto SET activo = TRUE WHERE id = $1', [id]);
    await bitacora(c, 'producto', id, 'regresar_al_menu');
  });
  return producto(id);
}

// ------------------------------------------------------------- Productos 86

// El producto queda en fila (FOR UPDATE): dos personas que le asignan o quitan el 86 a la
// vez no abren dos registros; la segunda ve cómo lo dejó la primera.
const productoEnFila = async (c, id) => {
  const { rows: [p] } = await c.query('SELECT nombre, activo FROM producto WHERE id = $1 FOR UPDATE', [id]);
  if (!p) throw noExiste('ese producto');
  // En otra consulta: la que esperó el candado no vería el 86 que acaba de abrir la otra persona
  const { rows: [o] } = await c.query(
    'SELECT EXISTS (SELECT 1 FROM producto_86 WHERE producto_id = $1 AND quitado_en IS NULL) AS agotado', [id]);
  return { ...p, agotado: o.agotado };
};

/**
 * "Asignar 86" (agotado): abre un registro en producto_86 con el motivo y la hora. Sigue
 * en el menú pero no se puede capturar. Quién lo hizo y la bitácora los pone la base.
 */
export async function asignar86(id, cuerpo, actorId) {
  const v = revisor();
  const motivo = v.texto('motivo', cuerpo?.motivo, { etiqueta: 'El motivo', obligatorio: true, min: 3, max: 160 });
  v.terminar();
  await conTransaccion(actorId, async (c) => {
    const p = await productoEnFila(c, id);
    if (!p.activo) throw regla(`${p.nombre} no está en el menú.`);
    if (p.agotado) throw regla(`${p.nombre} ya tiene 86.`);
    await c.query('INSERT INTO producto_86 (producto_id, motivo) VALUES ($1, $2)', [id, motivo]);
  });
  return producto(id);
}

/** "Quitar 86": cierra el registro abierto; el producto vuelve a estar disponible y el historial se queda */
export async function quitar86(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const p = await productoEnFila(c, id);
    if (!p.agotado) throw regla(`${p.nombre} ya está disponible.`);
    await c.query('UPDATE producto_86 SET quitado_en = fn_ahora() WHERE producto_id = $1 AND quitado_en IS NULL', [id]);
  });
  return producto(id);
}

/** Historial de 86: qué se agotó, por qué, desde cuándo, cuánto duró y quién (lo más reciente primero) */
export async function historial86() {
  const { rows } = await consulta(`
    SELECT o.id, o.producto_id, p.nombre AS producto, k.nombre AS categoria, o.motivo,
           o.asignado_en, ua.nombre_completo AS asignado_por, o.quitado_en, uq.nombre_completo AS quitado_por,
           floor(EXTRACT(EPOCH FROM COALESCE(o.quitado_en, fn_ahora()) - o.asignado_en) / 60)::int AS minutos
    FROM producto_86 o
    JOIN producto p  ON p.id = o.producto_id
    JOIN categoria k ON k.id = p.categoria_id
    LEFT JOIN usuario ua ON ua.id = o.asignado_por_usuario_id
    LEFT JOIN usuario uq ON uq.id = o.quitado_por_usuario_id
    ORDER BY o.asignado_en DESC, o.id DESC
    LIMIT 200`);
  return rows;
}
