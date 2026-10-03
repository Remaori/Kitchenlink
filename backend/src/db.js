// Conexión a PostgreSQL 16 (pool de conexiones del usuario kitchenlink_app)
import pg from 'pg';
import { config } from './config.js';

// BIGINT (ids) como número de JavaScript. Los NUMERIC (dinero) se quedan
// como texto para no perder centavos por redondeo de punto flotante.
pg.types.setTypeParser(20, (v) => Number(v));

export function opcionesConexion(extra = {}) {
  return {
    ...config.bd,
    application_name: 'kitchenlink-api',
    // Esquema y zona horaria del restaurante en cada conexión
    options: `-c search_path=kitchenlink,public -c timezone=${config.zonaHoraria}`,
    statement_timeout: 15000,
    connectionTimeoutMillis: 5000,
    ...extra,
  };
}

export const pool = new pg.Pool({ ...opcionesConexion(), max: 10, idleTimeoutMillis: 30000 });

// Un error en una conexión inactiva (p. ej. se reinició PostgreSQL) no
// debe tumbar el servidor: el pool la descarta y abre otra.
pool.on('error', (err) => console.error('[bd] conexión inactiva con error:', err.message));

export const consulta = (texto, params) => pool.query(texto, params);

/**
 * Ejecuta `fn(cliente)` dentro de una transacción.
 * Antes de empezar le dice a la base quién opera (kitchenlink.usuario_id),
 * que es lo que usan los triggers para la bitácora y los permisos.
 * El valor es LOCAL a la transacción: al terminar, la conexión vuelve
 * al pool sin rastro del usuario.
 */
export async function conTransaccion(usuarioId, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SELECT set_config('kitchenlink.usuario_id', $1, true)",
      [usuarioId == null ? '' : String(usuarioId)]);
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
