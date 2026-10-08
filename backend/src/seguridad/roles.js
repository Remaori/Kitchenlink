// 02c · Roles y permisos
//
// Las reglas que dibuja la pantalla las hace cumplir la base (tg_rol_reglas,
// tg_rol_permiso_proteger): al Gerente no se le quitan permisos ni se da de
// baja, y un rol con usuarios no se da de baja. Aquí se valida lo demás y se
// deja constancia en la bitácora (los triggers no registran cambios de roles).
import { consulta, conTransaccion } from '../db.js';
import { ErrorHttp } from '../errores.js';
import { revisor } from '../validacion.js';

const SQL_ROLES = `
  SELECT v.id, v.nombre, v.descripcion, v.es_sistema, v.activo,
         v.usuarios, v.usuarios_texto, v.permisos_activos, v.permisos_totales, v.permisos_texto,
         v.se_puede_dar_de_baja,
         (v.usuarios - v.usuarios_dados_de_baja)::int AS usuarios_vigentes,
         COALESCE((SELECT json_agg(p.clave ORDER BY p.orden)
                   FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
                   WHERE rp.rol_id = v.id), '[]'::json) AS permisos
  FROM v_roles v`;

/** Lista de roles (los dados de baja al final) y las 17 casillas agrupadas por módulo. */
export async function listar() {
  const [{ rows: roles }, { rows: catalogo }] = await Promise.all([
    consulta(`${SQL_ROLES} ORDER BY v.activo DESC, v.id`),
    consulta('SELECT clave, nombre, modulo, orden, descripcion FROM permiso ORDER BY orden'),
  ]);
  return { roles, catalogo };
}

async function uno(id) {
  const { rows: [r] } = await consulta(`${SQL_ROLES} WHERE v.id = $1`, [id]);
  if (!r) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'No existe ese rol.');
  return r;
}

// Nombre, descripción y casillas que llegan del formulario
async function revisarDatos({ nombre, descripcion, permisos }) {
  const v = revisor();
  const datos = {
    nombre: v.texto('nombre', nombre, { etiqueta: 'El nombre del rol', obligatorio: true, min: 3, max: 50 }),
    descripcion: v.texto('descripcion', descripcion, { etiqueta: 'La descripción', max: 200 }),
    permisos: [],
  };
  if (!Array.isArray(permisos) || permisos.some((p) => typeof p !== 'string')) {
    v.error('permisos', 'Las casillas de permisos no son válidas.');
  } else {
    const { rows } = await consulta('SELECT clave FROM permiso WHERE clave = ANY($1::text[])', [permisos]);
    const validas = new Set(rows.map((r) => r.clave));
    const desconocidas = permisos.filter((p) => !validas.has(p));
    if (desconocidas.length) v.error('permisos', `No existe el permiso ${desconocidas.join(', ')}.`);
    datos.permisos = [...validas];
  }
  v.terminar();
  return datos;
}

// "Mesero" y "mesero" serían el mismo rol para cualquiera que lea la lista
async function exigirNombreLibre(c, nombre, excepto = null) {
  const { rows: [otro] } = await c.query(
    'SELECT nombre FROM rol WHERE lower(nombre) = lower($1) AND id IS DISTINCT FROM $2::bigint', [nombre, excepto]);
  if (otro) {
    throw new ErrorHttp(409, 'DUPLICADO', 'Ya existe un rol con ese nombre.',
      { campos: { nombre: `Ya existe el rol «${otro.nombre}».` } });
  }
}

const bitacora = (c, id, accion, detalle) =>
  c.query("SELECT fn_bitacora('rol', $1, $2, $3::jsonb)", [id, accion, detalle ? JSON.stringify(detalle) : null]);

/** "Nuevo rol" */
export async function crear(cuerpo, actorId) {
  const d = await revisarDatos(cuerpo ?? {});
  const id = await conTransaccion(actorId, async (c) => {
    await exigirNombreLibre(c, d.nombre);
    const { rows: [r] } = await c.query('INSERT INTO rol (nombre, descripcion) VALUES ($1, $2) RETURNING id', [d.nombre, d.descripcion]);
    await c.query('INSERT INTO rol_permiso (rol_id, permiso_id) SELECT $1, id FROM permiso WHERE clave = ANY($2::text[])', [r.id, d.permisos]);
    await bitacora(c, r.id, 'crear_rol', { nombre: d.nombre, permisos: d.permisos });
    return r.id;
  });
  return uno(id);
}

/** "Guardar cambios": nombre, descripción y casillas */
export async function actualizar(id, cuerpo, actorId) {
  const d = await revisarDatos(cuerpo ?? {});
  await conTransaccion(actorId, async (c) => {
    const { rows: [r] } = await c.query('SELECT nombre, descripcion, es_sistema, activo FROM rol WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'No existe ese rol.');
    if (!r.activo) throw new ErrorHttp(409, 'REGLA_DE_NEGOCIO', `El rol ${r.nombre} está dado de baja: reactívalo para editarlo.`);
    if (r.es_sistema && d.nombre !== r.nombre) {
      throw new ErrorHttp(409, 'REGLA_DE_NEGOCIO', `El rol ${r.nombre} es del sistema: su nombre no se cambia.`);
    }
    await exigirNombreLibre(c, d.nombre, id);

    const { rows } = await c.query('SELECT p.clave FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = $1', [id]);
    const antes = new Set(rows.map((x) => x.clave));
    const agregados = d.permisos.filter((p) => !antes.has(p));
    const quitados = [...antes].filter((p) => !d.permisos.includes(p));

    // Quitar una casilla al Gerente lo rechaza la base (tg_rol_permiso_proteger)
    if (quitados.length) {
      await c.query('DELETE FROM rol_permiso WHERE rol_id = $1 AND permiso_id IN (SELECT id FROM permiso WHERE clave = ANY($2::text[]))', [id, quitados]);
    }
    if (agregados.length) {
      await c.query('INSERT INTO rol_permiso (rol_id, permiso_id) SELECT $1, id FROM permiso WHERE clave = ANY($2::text[])', [id, agregados]);
    }
    const cambios = {};
    if (d.nombre !== r.nombre) cambios.nombre = { de: r.nombre, a: d.nombre };
    if (d.descripcion !== r.descripcion) cambios.descripcion = { de: r.descripcion, a: d.descripcion };
    if (cambios.nombre || cambios.descripcion) {
      await c.query('UPDATE rol SET nombre = $1, descripcion = $2 WHERE id = $3', [d.nombre, d.descripcion, id]);
    }
    if (agregados.length) cambios.permisos_agregados = agregados;
    if (quitados.length) cambios.permisos_quitados = quitados;
    if (Object.keys(cambios).length) await bitacora(c, id, 'editar_rol', cambios);
  });
  return uno(id);
}

/** "Dar de baja rol" (la base lo impide si tiene usuarios Pendientes o Activos, o si es el Gerente) */
export async function darDeBaja(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [r] } = await c.query('UPDATE rol SET activo = FALSE WHERE id = $1 AND activo RETURNING id', [id]);
    if (!r) await exigirExiste(c, id, 'ya está dado de baja');
    await bitacora(c, id, 'dar_de_baja_rol');
  });
  return uno(id);
}

/** Un rol dado de baja vuelve a estar disponible para asignarlo */
export async function reactivar(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const { rows: [r] } = await c.query('UPDATE rol SET activo = TRUE WHERE id = $1 AND NOT activo RETURNING id', [id]);
    if (!r) await exigirExiste(c, id, 'ya está activo');
    await bitacora(c, id, 'reactivar_rol');
  });
  return uno(id);
}

async function exigirExiste(c, id, siExiste) {
  const { rows: [r] } = await c.query('SELECT nombre FROM rol WHERE id = $1', [id]);
  if (!r) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'No existe ese rol.');
  throw new ErrorHttp(409, 'REGLA_DE_NEGOCIO', `El rol ${r.nombre} ${siExiste}.`);
}
