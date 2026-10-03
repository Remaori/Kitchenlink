// Verificaciones de conectividad Backend <-> PostgreSQL (y API si está iniciada).
// Las usan `npm run db:conectividad` (reporte) y test/conectividad.test.js.
import pg from 'pg';
import { config } from '../../src/config.js';
import { pool, opcionesConexion } from '../../src/db.js';

const PASA = 'PASA', AVISO = 'AVISO', FALLA = 'FALLA';

// Ejecuta sql dentro de una transacción que siempre se deshace y devuelve el código de error (o null)
async function intentar(cliente, sql) {
  await cliente.query('BEGIN');
  try {
    await cliente.query(sql);
    return null;
  } catch (e) {
    return e;
  } finally {
    await cliente.query('ROLLBACK');
  }
}

export async function ejecutarVerificaciones({ urlApi = `http://127.0.0.1:${config.puerto}` } = {}) {
  const res = [];
  const v = (grupo, nombre, resultado, detalle) => res.push({ grupo, nombre, resultado, detalle });

  // 1. Conexión y autenticación
  let cliente;
  const t0 = Date.now();
  try {
    cliente = await pool.connect();
    v('Conexión', `Conectar a ${config.bd.host}:${config.bd.port}/${config.bd.database} como ${config.bd.user}`, PASA, `${Date.now() - t0} ms`);
  } catch (e) {
    const causa = { '28P01': 'contraseña incorrecta (DB_PASSWORD)', '3D000': 'la base no existe (npm run db:instalar)',
      ECONNREFUSED: 'PostgreSQL no responde en ese host/puerto', '28000': 'el rol no existe o no tiene permiso de conexión' }[e.code];
    v('Conexión', `Conectar a ${config.bd.host}:${config.bd.port}/${config.bd.database} como ${config.bd.user}`, FALLA, causa || e.message);
    return res;
  }

  try {
    const malo = new pg.Client({ ...opcionesConexion(), password: 'contraseña-equivocada' });
    try { await malo.connect(); await malo.end(); v('Conexión', 'Rechaza una contraseña incorrecta', FALLA, 'PostgreSQL aceptó la conexión: revisa pg_hba.conf (no debe decir trust)'); }
    catch (e) { v('Conexión', 'Rechaza una contraseña incorrecta', e.code === '28P01' ? PASA : AVISO, e.code === '28P01' ? 'autenticación por contraseña activa' : e.message); }

    // 2. Servidor y sesión
    const { rows: [s] } = await cliente.query(`
      SELECT current_user AS usuario, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario,
             current_setting('server_version_num')::int AS version_num, current_setting('server_version') AS version,
             pg_encoding_to_char((SELECT encoding FROM pg_database WHERE datname = current_database())) AS codificacion,
             current_setting('TimeZone') AS zona, current_setting('search_path') AS search_path,
             (fn_ahora() = now()) AS reloj_real`);
    v('Servidor', 'Versión de PostgreSQL', Math.floor(s.version_num / 10000) === 16 ? PASA : AVISO, s.version);
    v('Servidor', 'Usuario de la aplicación sin privilegios de superusuario', !s.superusuario ? PASA : FALLA, s.usuario);
    v('Servidor', 'Codificación UTF8', s.codificacion === 'UTF8' ? PASA : AVISO, s.codificacion + (s.codificacion === 'UTF8' ? '' : ' → npm run db:instalar -- --recrear'));
    v('Servidor', 'Zona horaria del restaurante', s.zona === config.zonaHoraria ? PASA : AVISO, s.zona);
    v('Servidor', 'Esquema kitchenlink en search_path', /kitchenlink/.test(s.search_path) ? PASA : FALLA, s.search_path);
    v('Servidor', 'Reloj real (sin hora fija de pruebas)', s.reloj_real ? PASA : AVISO, s.reloj_real ? 'fn_ahora() = now()' : 'kitchenlink.ahora está fijado');

    // 3. Esquema v3
    const { rows: [e] } = await cliente.query(`
      SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'kitchenlink' AND table_type = 'BASE TABLE')::int AS tablas,
             (SELECT count(*) FROM information_schema.views  WHERE table_schema = 'kitchenlink')::int AS vistas,
             (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'kitchenlink' AND t.typtype = 'e')::int AS enums,
             (SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'kitchenlink' AND NOT g.tgisinternal)::int AS triggers,
             (SELECT count(*) FROM rol)::int AS roles, (SELECT count(*) FROM permiso)::int AS permisos,
             fn_config_txt('impuesto.tasa') AS iva`);
    v('Esquema v3', 'Tablas', e.tablas === 19 ? PASA : FALLA, `${e.tablas} de 19`);
    v('Esquema v3', 'Vistas (pantallas, tickets y reportes)', e.vistas === 22 ? PASA : FALLA, `${e.vistas} de 22`);
    v('Esquema v3', 'Tipos ENUM', e.enums === 10 ? PASA : FALLA, `${e.enums} de 10`);
    v('Esquema v3', 'Triggers de reglas de negocio', e.triggers === 27 ? PASA : FALLA, `${e.triggers} de 27`);
    v('Esquema v3', 'Catálogos: roles · permisos · IVA', e.roles === 6 && e.permisos === 17 && e.iva === '0.1600' ? PASA : FALLA, `${e.roles} roles · ${e.permisos} permisos · IVA ${e.iva}`);
    const { rows: [l] } = await cliente.query('SELECT (SELECT count(*) FROM v_mapa_mesas)::int AS mesas, (SELECT count(*) FROM v_usuarios)::int AS usuarios');
    v('Esquema v3', 'Lectura de vistas (v_mapa_mesas, v_usuarios)', PASA, `${l.mesas} mesas · ${l.usuarios} usuarios`);

    // 4. Permisos mínimos: estas operaciones DEBEN fallar con "permiso denegado"
    for (const [nombre, sql] of [
      ['No puede crear tablas', 'CREATE TABLE kitchenlink.x (id int)'],
      ['No puede borrar tablas', 'DROP TABLE kitchenlink.pago'],
      ['No puede vaciar tablas (TRUNCATE)', 'TRUNCATE kitchenlink.comanda CASCADE'],
      ['No puede modificar la bitácora', 'UPDATE kitchenlink.bitacora SET accion = accion'],
      ['No puede borrar pagos', 'DELETE FROM kitchenlink.pago'],
      ['No puede borrar cancelaciones', 'DELETE FROM kitchenlink.cancelacion'],
    ]) {
      const err = await intentar(cliente, sql);
      v('Permisos mínimos', nombre, err?.code === '42501' ? PASA : FALLA, err ? `rechazado (${err.code})` : 'SE PERMITIÓ');
    }

    // 5. Las reglas de negocio (triggers) se aplican también a la aplicación
    const errRegla = await intentar(cliente,
      "INSERT INTO usuario (rol_id, nombre_completo, nombre_usuario, contrasena_hash, estado, requiere_cambio_pw) SELECT id, 'Prueba', 'prueba_conectividad', 'x', 'activo', false FROM rol LIMIT 1");
    v('Reglas', 'Trigger rechaza un usuario nuevo que no empieza Pendiente', errRegla?.code === 'P0001' ? PASA : FALLA, errRegla ? errRegla.message : 'SE PERMITIÓ');

    // 6. Usuario de la petición: vive solo dentro de su transacción
    await cliente.query('BEGIN');
    await cliente.query("SELECT set_config('kitchenlink.usuario_id', '42', true)");
    const dentro = (await cliente.query('SELECT fn_usuario_actual() AS u')).rows[0].u;
    await cliente.query('COMMIT');
    const fuera = (await cliente.query('SELECT fn_usuario_actual() AS u')).rows[0].u;
    v('Pool', 'kitchenlink.usuario_id no se filtra a la siguiente petición', dentro === 42 && fuera === null ? PASA : FALLA, `dentro: ${dentro} · después: ${fuera}`);
  } finally {
    cliente.release();
  }

  // 7. Varias peticiones a la vez (pool de 10 conexiones)
  const n = 30;
  const t1 = Date.now();
  const tiempos = await Promise.all(Array.from({ length: n }, async () => {
    const t = Date.now(); await pool.query('SELECT count(*) FROM v_mapa_mesas'); return Date.now() - t;
  }));
  v('Pool', `${n} consultas simultáneas`, PASA, `total ${Date.now() - t1} ms · la más lenta ${Math.max(...tiempos)} ms`);

  // 8. API (si el servidor está iniciado)
  try {
    const r = await fetch(`${urlApi}/api/salud`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    v('API', `GET ${urlApi}/api/salud`, r.ok && j.base_de_datos?.estado === 'conectada' ? PASA : FALLA,
      `HTTP ${r.status} · base ${j.base_de_datos?.estado} · ${j.base_de_datos?.latencia_ms ?? '-'} ms`);
  } catch (e) {
    v('API', `GET ${urlApi}/api/salud`, AVISO, 'el servidor no está iniciado (npm run dev) — se omite');
  }
  return res;
}

export const RESULTADOS = { PASA, AVISO, FALLA };
