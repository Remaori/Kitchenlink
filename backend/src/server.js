// Punto de entrada: npm run dev (se reinicia al guardar) · npm start
import { config, validarConfig } from './config.js';
import { crearApp } from './app.js';
import { pool } from './db.js';
import { revisarReservaciones } from './servicios/recepcion.js';

try {
  validarConfig();
} catch (err) {
  console.error('✗ ' + err.message);
  process.exit(1);
}

// Solo escucha en este equipo: a la red local se sale por Nginx (o por el
// servidor de Vite en desarrollo), nunca directo. HOST=0.0.0.0 lo abre.
const host = process.env.HOST || '127.0.0.1';
const servidor = crearApp().listen(config.puerto, host, async () => {
  console.log(`KitchenLink API en http://${host}:${config.puerto}  (entorno: ${config.entorno})`);
  try {
    const { rows: [r] } = await pool.query('SELECT current_database() AS base, current_user AS usuario');
    console.log(`Base de datos: ${r.base} como ${r.usuario} ✓`);
  } catch (err) {
    console.error(`⚠ Sin conexión a PostgreSQL (${err.code || err.message}). Revisa backend/.env y que el servicio esté iniciado.`);
  }
});

// 03a · "Si el cliente no llega dentro de la tolerancia, cambia sola a No se
// presentó" y "la mesa se aparta 30 min antes": la base lo hace con
// fn_revisar_reservaciones(); aquí se llama cada minuto.
const cadaMinuto = setInterval(() => {
  revisarReservaciones().catch((e) => console.error('[reservaciones]', e.message));
}, 60_000);
revisarReservaciones().catch(() => {});

function apagar(senal) {
  console.log(`\n${senal}: cerrando…`);
  clearInterval(cadaMinuto);
  servidor.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
