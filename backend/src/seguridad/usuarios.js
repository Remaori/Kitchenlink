// 02a · Usuarios  ·  02b · Nuevo usuario y edición
//
// La base ya hace cumplir el ciclo de vida (tg_usuario_reglas / _despues):
// todo usuario nace Pendiente con contraseña temporal, pasa a Activo al crear
// la suya, dar de baja cierra sus sesiones, y altas, cambios de estado, de rol
// y restablecimientos quedan en la bitácora con quién lo hizo.
// Aquí se agregan las reglas que protegen al propio gerente: no puede darse de
// baja, cambiar su rol ni restablecer su contraseña, y no se puede quedar el
// sistema sin un Gerente activo.
import { consulta, conTransaccion } from '../db.js';
import { ErrorHttp } from '../errores.js';
import { revisor } from '../validacion.js';
import * as pw from './contrasenas.js';

export const REGLA_USUARIO = /^[a-z0-9._-]{3,40}$/;

const SQL_DETALLE = `
  SELECT u.id, u.nombre_completo, u.nombre_usuario, u.telefono, u.correo,
         u.rol_id, r.nombre AS rol, r.es_sistema AS rol_de_sistema, r.activo AS rol_activo,
         u.estado::text AS estado, e.etiqueta AS estado_etiqueta, e.tono AS estado_tono,
         u.requiere_cambio_pw, u.ultimo_acceso, u.dado_de_baja_en,
         EXISTS (SELECT 1 FROM sesion s WHERE s.usuario_id = u.id AND s.cerrada_en IS NULL AND s.expira_en > fn_ahora()) AS en_linea
  FROM usuario u
  JOIN rol r ON r.id = u.rol_id
  LEFT JOIN etiqueta_estado e ON e.dominio = 'estado_usuario' AND e.valor = u.estado::text`;

const regla = (mensaje) => new ErrorHttp(409, 'REGLA_DE_NEGOCIO', mensaje);
const bitacora = (c, id, accion, detalle) =>
  c.query("SELECT fn_bitacora('usuario', $1, $2, $3::jsonb)", [id, accion, detalle ? JSON.stringify(detalle) : null]);

/** 02a · Lista (activos, luego dados de baja, y los Pendientes al final) */
export async function listar() {
  const { rows } = await consulta(
    `SELECT id, nombre_completo, nombre_usuario, rol, estado::text AS estado, estado_etiqueta, estado_tono,
            en_linea, ultimo_acceso, requiere_cambio_pw, aviso
     FROM v_usuarios`);
  return rows;
}

export async function detalle(id) {
  const { rows: [u] } = await consulta(`${SQL_DETALLE} WHERE u.id = $1`, [id]);
  if (!u) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'No existe ese usuario.');
  return u;
}

// Fila bloqueada mientras dura la transacción (dos gerentes a la vez no se pisan)
async function leerParaCambiar(c, id) {
  const { rows: [u] } = await c.query(
    `SELECT u.id, u.nombre_completo, u.telefono, u.correo, u.rol_id, u.estado::text AS estado,
            u.requiere_cambio_pw, u.ultimo_acceso, r.nombre AS rol, r.es_sistema AS rol_de_sistema, r.activo AS rol_activo
     FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = $1 FOR UPDATE OF u`, [id]);
  if (!u) throw new ErrorHttp(404, 'NO_ENCONTRADO', 'No existe ese usuario.');
  return u;
}

function revisarDatos(cuerpo, { nuevo }) {
  const v = revisor();
  const d = {
    nombre_completo: v.texto('nombre_completo', cuerpo.nombre_completo, { etiqueta: 'El nombre completo', obligatorio: true, min: 3, max: 120 }),
    telefono: v.texto('telefono', cuerpo.telefono, { etiqueta: 'El teléfono', max: 20 }),
    correo: v.texto('correo', cuerpo.correo, { etiqueta: 'El correo', max: 120 })?.toLowerCase() ?? null,
    rol_id: Number(cuerpo.rol_id),
  };
  if (d.telefono && !/^[0-9 +()-]{7,20}$/.test(d.telefono)) v.error('telefono', 'Usa solo números, espacios y + ( ) -.');
  if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) v.error('correo', 'El correo no tiene un formato válido.');
  if (!Number.isSafeInteger(d.rol_id) || d.rol_id <= 0) v.error('rol_id', 'Elige un rol.');

  if (nuevo) {
    // Siempre en minúsculas: el inicio de sesión no distingue mayúsculas,
    // así no pueden existir "Luis" y "luis" al mismo tiempo.
    d.nombre_usuario = typeof cuerpo.nombre_usuario === 'string' ? cuerpo.nombre_usuario.trim().toLowerCase() : '';
    if (!d.nombre_usuario) v.error('nombre_usuario', 'Escribe el nombre de usuario.');
    else if (!REGLA_USUARIO.test(d.nombre_usuario)) {
      v.error('nombre_usuario', 'De 3 a 40 caracteres: letras sin acentos, números, punto, guion o guion bajo.');
    }
    const t = cuerpo.contrasena_temporal;
    if (typeof t !== 'string' || t.length < 8 || Buffer.byteLength(t, 'utf8') > 72 || !/\d/.test(t) || !/[A-Za-z]/.test(t)) {
      v.error('contrasena_temporal', 'Genera una contraseña temporal.');
    }
    d.contrasena_temporal = t;
  }
  v.terminar();
  return d;
}

async function exigirRolDisponible(c, rolId) {
  const { rows: [r] } = await c.query('SELECT nombre, activo, es_sistema FROM rol WHERE id = $1', [rolId]);
  if (!r) throw new ErrorHttp(400, 'DATOS_INVALIDOS', 'Revisa los datos marcados.', { campos: { rol_id: 'Ese rol no existe.' } });
  if (!r.activo) {
    throw new ErrorHttp(409, 'REGLA_DE_NEGOCIO', `El rol ${r.nombre} está dado de baja.`,
      { campos: { rol_id: `El rol ${r.nombre} está dado de baja: elige otro.` } });
  }
  return r;
}

async function exigirLibres(c, { nombre_usuario, correo }, excepto = null) {
  const campos = {};
  if (nombre_usuario) {
    const { rowCount } = await c.query('SELECT 1 FROM usuario WHERE lower(nombre_usuario) = $1 AND id IS DISTINCT FROM $2::bigint', [nombre_usuario, excepto]);
    if (rowCount) campos.nombre_usuario = 'Ya existe: no puede repetirse con otro usuario.';
  }
  if (correo) {
    const { rowCount } = await c.query('SELECT 1 FROM usuario WHERE lower(correo) = $1 AND id IS DISTINCT FROM $2::bigint', [correo, excepto]);
    if (rowCount) campos.correo = 'Ese correo ya lo tiene otro usuario.';
  }
  if (Object.keys(campos).length) throw new ErrorHttp(409, 'DUPLICADO', 'Ya existe un usuario con esos datos.', { campos });
}

// 12 · "conviene tener al menos dos cuentas de gerente": nunca se queda en cero
async function exigirOtroGerente(c, u, accion) {
  if (!u.rol_de_sistema || u.estado !== 'activo') return;
  const { rows: [x] } = await c.query(
    `SELECT count(*)::int AS n FROM usuario o JOIN rol r ON r.id = o.rol_id
     WHERE r.es_sistema AND o.estado = 'activo' AND o.id <> $1`, [u.id]);
  if (!x.n) {
    throw regla(`${u.nombre_completo} es el único ${u.rol} activo: no se puede ${accion}. Primero da de alta a otro ${u.rol}.`);
  }
}

/** 02b · "Crear usuario": nace Pendiente con la contraseña temporal que se le entrega */
export async function crear(cuerpo, actorId) {
  const d = revisarDatos(cuerpo ?? {}, { nuevo: true });
  const hash = await pw.hashear(d.contrasena_temporal);
  const id = await conTransaccion(actorId, async (c) => {
    await exigirRolDisponible(c, d.rol_id);
    await exigirLibres(c, d);
    const { rows: [u] } = await c.query(
      `INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, telefono, correo, contrasena_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [d.rol_id, d.nombre_completo, d.nombre_usuario, d.telefono, d.correo, hash]);
    return u.id;
  });
  return detalle(id);
}

/** 02a · "Editar": datos de contacto y rol (el nombre de usuario no cambia) */
export async function editar(id, cuerpo, actorId) {
  const d = revisarDatos(cuerpo ?? {}, { nuevo: false });
  await conTransaccion(actorId, async (c) => {
    const u = await leerParaCambiar(c, id);
    if (u.estado === 'dado_de_baja') throw regla(`${u.nombre_completo} está dado de baja: reactívalo para editarlo.`);
    if (d.rol_id !== u.rol_id) {
      if (id === actorId) throw regla('No puedes cambiar tu propio rol: pídeselo a otro gerente.');
      const nuevo = await exigirRolDisponible(c, d.rol_id);
      if (!nuevo.es_sistema) await exigirOtroGerente(c, u, 'cambiarle el rol');
    }
    await exigirLibres(c, { correo: d.correo }, id);

    const campos = ['nombre_completo', 'telefono', 'correo'].filter((k) => d[k] !== u[k]);
    if (!campos.length && d.rol_id === u.rol_id) return;
    // El cambio de rol lo registra el trigger; los datos de contacto, aquí
    await c.query('UPDATE usuario SET nombre_completo = $1, telefono = $2, correo = $3, rol_id = $4 WHERE id = $5',
      [d.nombre_completo, d.telefono, d.correo, d.rol_id, id]);
    if (campos.length) await bitacora(c, id, 'editar_datos', { campos });
  });
  return detalle(id);
}

/** 02a · "Restablecer contraseña": temporal nueva, sesiones cerradas, cambio obligatorio (01b) */
export async function restablecerContrasena(id, actorId) {
  if (id === actorId) throw regla('No puedes restablecer tu propia contraseña: pídeselo a otro gerente.');
  const temporal = pw.generarTemporal();
  const hash = await pw.hashear(temporal);
  await conTransaccion(actorId, async (c) => {
    const u = await leerParaCambiar(c, id);
    if (u.estado === 'dado_de_baja') throw regla(`${u.nombre_completo} está dado de baja: reactívalo antes de restablecer su contraseña.`);
    await c.query('UPDATE usuario SET contrasena_hash = $1, requiere_cambio_pw = TRUE WHERE id = $2', [hash, id]);
    await c.query('UPDATE sesion SET cerrada_en = fn_ahora() WHERE usuario_id = $1 AND cerrada_en IS NULL', [id]);
    // Si ya tenía una temporal (Pendiente), el trigger no ve el cambio: se registra aquí
    if (u.requiere_cambio_pw) await bitacora(c, id, 'restablecer_contrasena');
  });
  return { usuario: await detalle(id), temporal };
}

/** Dar de baja: ya no entra, pero su historial (comandas, cobros) se conserva */
export async function darDeBaja(id, actorId) {
  if (id === actorId) throw regla('No puedes darte de baja a ti mismo.');
  await conTransaccion(actorId, async (c) => {
    const u = await leerParaCambiar(c, id);
    if (u.estado === 'dado_de_baja') throw regla(`${u.nombre_completo} ya está dado de baja.`);
    await exigirOtroGerente(c, u, 'darlo de baja');
    await c.query("UPDATE usuario SET estado = 'dado_de_baja' WHERE id = $1", [id]);
  });
  return detalle(id);
}

/** 02a · "Reactivar". Si nunca entró, vuelve a Pendiente; si ya había entrado, a Activo. */
export async function reactivar(id, actorId) {
  await conTransaccion(actorId, async (c) => {
    const u = await leerParaCambiar(c, id);
    if (u.estado !== 'dado_de_baja') throw regla(`${u.nombre_completo} no está dado de baja.`);
    if (!u.rol_activo) throw regla(`El rol ${u.rol} está dado de baja: reactívalo primero en Roles y permisos.`);
    await c.query(
      `UPDATE usuario SET estado = (CASE WHEN ultimo_acceso IS NULL THEN 'pendiente' ELSE 'activo' END)::estado_usuario
       WHERE id = $1`, [id]);
  });
  return detalle(id);
}

const CAMPOS = { nombre_completo: 'nombre', telefono: 'teléfono', correo: 'correo' };
function describir({ accion, detalle: d }) {
  switch (accion) {
    case 'crear_usuario': return `Alta en el sistema como ${d?.rol ?? '—'}`;
    case 'cambiar_estado': return `Estado de la cuenta: ${d?.de} → ${d?.a}`;
    case 'cambiar_rol': return `Rol: ${d?.de} → ${d?.a}`;
    case 'editar_datos': return `Datos editados: ${(d?.campos ?? []).map((c) => CAMPOS[c] ?? c).join(', ')}`;
    case 'restablecer_contrasena': return 'Contraseña restablecida: recibió una temporal';
    case 'cambiar_contrasena_temporal': return 'Creó su propia contraseña';
    case 'inicio_sesion_fallido': return `Intento fallido de inicio de sesión${d?.ip ? ` desde ${d.ip}` : ''}${d?.dispositivo ? ` (${d.dispositivo})` : ''}`;
    default: return accion.replaceAll('_', ' ');
  }
}

/** 02a · "Ver historial": la bitácora de la cuenta y lo que se conserva tras la baja */
export async function historial(id) {
  const usuario = await detalle(id);
  const [{ rows: eventos }, { rows: [conservado] }] = await Promise.all([
    consulta(
      `SELECT b.id, b.accion, b.registrado_en, a.nombre_completo AS hecho_por,
              CASE b.accion
                WHEN 'cambiar_rol' THEN jsonb_build_object(
                  'de', (SELECT nombre FROM rol WHERE id = (b.detalle->>'de')::bigint),
                  'a',  (SELECT nombre FROM rol WHERE id = (b.detalle->>'a')::bigint))
                WHEN 'cambiar_estado' THEN jsonb_build_object(
                  'de', fn_etiqueta('estado_usuario', b.detalle->>'de'),
                  'a',  fn_etiqueta('estado_usuario', b.detalle->>'a'))
                ELSE b.detalle END AS detalle
       FROM bitacora b LEFT JOIN usuario a ON a.id = b.usuario_id
       WHERE b.entidad = 'usuario' AND b.entidad_id = $1
       ORDER BY b.registrado_en DESC, b.id DESC
       LIMIT 100`, [id]),
    consulta(
      `SELECT (SELECT count(*) FROM comanda WHERE mesero_usuario_id = $1)::int        AS comandas,
              (SELECT count(*) FROM pago    WHERE registrado_por_usuario_id = $1)::int AS pagos,
              (SELECT count(*) FROM sesion  WHERE usuario_id = $1)::int               AS sesiones`, [id]),
  ]);
  return {
    usuario,
    conservado,
    eventos: eventos.map((e) => ({ id: e.id, accion: e.accion, fecha: e.registrado_en, hecho_por: e.hecho_por, texto: describir(e) })),
  };
}
