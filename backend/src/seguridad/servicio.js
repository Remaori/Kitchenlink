// Autenticación · pantallas 01 (Iniciar sesión) y 01b (Cambio de contraseña obligatorio)
import { consulta, conTransaccion } from '../db.js';
import { config } from '../config.js';
import { ErrorHttp } from '../errores.js';
import * as pw from './contrasenas.js';
import * as tk from './tokens.js';
import * as limitador from './limitador.js';

const CREDENCIALES = 'Usuario o contraseña incorrectos.';

export function iniciales(nombre) {
  return String(nombre).trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

// "Mozilla/5.0 (Windows NT 10.0…) Chrome/…" -> "Chrome · Windows" (para 02a)
export function describirDispositivo(ua = '') {
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const sistema = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const d = [navegador, sistema].filter(Boolean).join(' · ');
  return (d || ua || 'Desconocido').slice(0, 120);
}

const SQL_PERMISOS = `
  COALESCE((SELECT json_agg(json_build_object('clave', p.clave, 'nombre', p.nombre, 'modulo', p.modulo) ORDER BY p.orden)
            FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
            WHERE rp.rol_id = r.id AND u.estado = 'activo' AND r.activo), '[]'::json) AS permisos`;

function aPublico(fila) {
  return {
    usuario: {
      id: fila.id,
      nombre_completo: fila.nombre_completo,
      nombre_usuario: fila.nombre_usuario,
      iniciales: iniciales(fila.nombre_completo),
      rol: fila.rol,
      estado: fila.estado,
      requiere_cambio_pw: fila.requiere_cambio_pw,
    },
    permisos: fila.permisos,
  };
}

async function abrirSesion(cliente, usuarioId, { ip, dispositivo }) {
  const jti = tk.nuevoJti();
  const { rows: [s] } = await cliente.query(
    `INSERT INTO sesion (usuario_id, token_hash, direccion_ip, dispositivo, expira_en)
     VALUES ($1, $2, $3, $4, fn_ahora() + ($5::float8 * interval '1 hour'))
     RETURNING id, emitida_en, expira_en`,
    [usuarioId, tk.hashJti(jti), ip ? String(ip).slice(0, 45) : null, describirDispositivo(dispositivo), config.sesionHoras]);
  const token = tk.firmar({ usuarioId, sesionId: s.id, jti, expiraEn: s.expira_en });
  return { token, sesionId: s.id, emitidaEn: s.emitida_en, expiraEn: s.expira_en };
}

async function datosUsuario(usuarioId) {
  const { rows: [f] } = await consulta(
    `SELECT u.id, u.nombre_completo, u.nombre_usuario, u.estado::text AS estado, u.requiere_cambio_pw, r.nombre AS rol, ${SQL_PERMISOS}
     FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = $1`, [usuarioId]);
  return aPublico(f);
}

/** 01 · Botón "Iniciar sesión" */
export async function iniciarSesion({ usuario, contrasena, ip, dispositivo }) {
  if (typeof usuario !== 'string' || !usuario.trim() || typeof contrasena !== 'string' || !contrasena) {
    throw new ErrorHttp(400, 'DATOS_INCOMPLETOS', 'Escribe tu usuario y tu contraseña.');
  }
  const nombre = usuario.trim();
  const espera = limitador.minutosDeBloqueo(ip, nombre);
  if (espera) {
    throw new ErrorHttp(429, 'DEMASIADOS_INTENTOS',
      `Demasiados intentos fallidos. Espera ${espera} min o pide al gerente que restablezca tu contraseña.`,
      { reintentar_en_min: espera });
  }

  const { rows: [u] } = await consulta(
    `SELECT u.id, u.estado::text AS estado, u.contrasena_hash FROM usuario u WHERE lower(u.nombre_usuario) = lower($1)`, [nombre]);

  let correcta = false;
  if (!u) await pw.compararConRelleno(contrasena);
  else correcta = await pw.comparar(contrasena, u.contrasena_hash).catch(() => false);

  if (!correcta) {
    limitador.registrarFalla(ip, nombre);
    if (u) {
      // Queda en la bitácora del usuario (solo si el usuario existe: así no se
      // guardan textos al azar, ni una contraseña escrita por error en "Usuario").
      await conTransaccion(null, (c) => c.query(
        "SELECT fn_bitacora('usuario', $1, 'inicio_sesion_fallido', $2::jsonb)",
        [u.id, JSON.stringify({ ip: ip || null, dispositivo: describirDispositivo(dispositivo) })]));
    }
    throw new ErrorHttp(401, 'CREDENCIALES', CREDENCIALES);
  }
  if (u.estado === 'dado_de_baja') {
    throw new ErrorHttp(403, 'CUENTA_DADA_DE_BAJA', 'Tu cuenta está dada de baja. Si es un error, habla con el gerente.');
  }

  limitador.limpiar(ip, nombre);
  const sesion = await conTransaccion(u.id, (c) => abrirSesion(c, u.id, { ip, dispositivo }));
  return { ...(await datosUsuario(u.id)), sesion };
}

/** Lee la sesión de la cookie. null si no es válida, venció, se cerró o el usuario fue dado de baja. */
export async function cargarSesion({ usuarioId, sesionId, jti }) {
  const { rows: [f] } = await consulta(
    `SELECT s.id AS sesion_id, s.emitida_en, s.expira_en,
            u.id, u.nombre_completo, u.nombre_usuario, u.estado::text AS estado, u.requiere_cambio_pw, r.nombre AS rol,
            ${SQL_PERMISOS}
     FROM sesion s
     JOIN usuario u ON u.id = s.usuario_id
     JOIN rol r     ON r.id = u.rol_id
     WHERE s.id = $1 AND s.usuario_id = $2 AND s.token_hash = $3
       AND s.cerrada_en IS NULL AND s.expira_en > fn_ahora()
       AND u.estado <> 'dado_de_baja'`,
    [sesionId, usuarioId, tk.hashJti(jti)]);
  if (!f) return null;
  return { ...aPublico(f), sesion: { sesionId: f.sesion_id, emitidaEn: f.emitida_en, expiraEn: f.expira_en } };
}

/** Botón "Cerrar sesión" */
export async function cerrarSesion({ sesionId, usuarioId, jti }) {
  await conTransaccion(usuarioId, (c) =>
    c.query('UPDATE sesion SET cerrada_en = fn_ahora() WHERE id = $1 AND usuario_id = $2 AND token_hash = $3 AND cerrada_en IS NULL',
      [sesionId, usuarioId, tk.hashJti(jti)]));
}

/** 01b · "Guardar y entrar" (también sirve para cambiar la propia contraseña después) */
export async function cambiarContrasena({ usuarioId, actual, nueva, confirmacion, ip, dispositivo }) {
  const politica = pw.revisarPolitica(nueva, confirmacion);
  if (!politica.valida) {
    throw new ErrorHttp(400, 'CONTRASENA_INVALIDA', 'La nueva contraseña no cumple los requisitos.', { reglas: politica.reglas });
  }
  const { rows: [u] } = await consulta('SELECT contrasena_hash, requiere_cambio_pw FROM usuario WHERE id = $1', [usuarioId]);
  if (!u.requiere_cambio_pw) {
    // Cambio voluntario: pide la actual (en 01b no, porque acaba de escribir la temporal)
    if (typeof actual !== 'string' || !(await pw.comparar(actual, u.contrasena_hash).catch(() => false))) {
      throw new ErrorHttp(400, 'CONTRASENA_ACTUAL', 'La contraseña actual no es correcta.');
    }
  }
  if (await pw.comparar(nueva, u.contrasena_hash).catch(() => false)) {
    throw new ErrorHttp(400, 'CONTRASENA_REPETIDA', u.requiere_cambio_pw
      ? 'La nueva contraseña debe ser distinta de la temporal.'
      : 'La nueva contraseña debe ser distinta de la actual.');
  }
  const hash = await pw.hashear(nueva);
  // Los triggers hacen el resto: Pendiente -> Activo y registro en la bitácora.
  // Se cierran todas sus sesiones y se abre una nueva (la anterior se emitió
  // con la contraseña temporal).
  const sesion = await conTransaccion(usuarioId, async (c) => {
    await c.query('UPDATE usuario SET contrasena_hash = $1, requiere_cambio_pw = FALSE WHERE id = $2', [hash, usuarioId]);
    await c.query('UPDATE sesion SET cerrada_en = fn_ahora() WHERE usuario_id = $1 AND cerrada_en IS NULL', [usuarioId]);
    return abrirSesion(c, usuarioId, { ip, dispositivo });
  });
  return { ...(await datosUsuario(usuarioId)), sesion };
}

/** Consola del servidor: restablecer (12 · "si no hay otro gerente, se restablece desde el servidor") */
export async function restablecerDesdeServidor(nombreUsuario) {
  const temporal = pw.generarTemporal();
  const hash = await pw.hashear(temporal);
  const fila = await conTransaccion(null, async (c) => {
    const { rows: [u] } = await c.query(
      `UPDATE usuario SET contrasena_hash = $1, requiere_cambio_pw = TRUE
       WHERE lower(nombre_usuario) = lower($2) AND estado <> 'dado_de_baja'
       RETURNING id, nombre_completo, nombre_usuario`, [hash, nombreUsuario]);
    if (u) await c.query('UPDATE sesion SET cerrada_en = fn_ahora() WHERE usuario_id = $1 AND cerrada_en IS NULL', [u.id]);
    return u;
  });
  if (!fila) throw new Error(`No hay un usuario activo o pendiente llamado "${nombreUsuario}".`);
  return { ...fila, temporal };
}

/** Consola del servidor: primer gerente de una base nueva */
export async function crearGerenteDesdeServidor(nombreUsuario, nombreCompleto) {
  if (!/^[a-z0-9._-]{3,40}$/i.test(nombreUsuario || '')) throw new Error('El usuario debe tener de 3 a 40 letras, números, punto, guion o guion bajo.');
  if (!nombreCompleto || !nombreCompleto.trim()) throw new Error('Falta el nombre completo.');
  const temporal = pw.generarTemporal();
  const hash = await pw.hashear(temporal);
  const fila = await conTransaccion(null, async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, contrasena_hash)
       SELECT id, $1, lower($2), $3 FROM rol WHERE es_sistema
       RETURNING id, nombre_completo, nombre_usuario`, [nombreCompleto.trim(), nombreUsuario, hash]);
    return u;
  });
  return { ...fila, temporal };
}
