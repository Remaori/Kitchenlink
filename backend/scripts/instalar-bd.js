// npm run db:instalar                 crea (o actualiza) la base kitchenlink con datos demo
// npm run db:instalar -- --recrear    la borra y la crea de nuevo en UTF8
// npm run db:instalar -- --sin-demo   solo esquema y permisos (sin usuarios ni datos)
import { config, validarConfig } from '../src/config.js';
import { instalarBase } from './lib/instalador.js';

const args = process.argv.slice(2);
const recrear = args.includes('--recrear');
const demo = !args.includes('--sin-demo');

try {
  validarConfig({ admin: true });
  console.log(`\nKitchenLink · instalación de la base "${config.bd.database}" en ${config.bd.host}:${config.bd.port}\n`);
  const r = await instalarBase({ nombre: config.bd.database, recrear, demo, log: console.log });
  console.log(`\n  PostgreSQL ${r.versionServidor} · codificación ${r.codificacion}`);
  if (r.aviso) console.log('  ⚠ ' + r.aviso);
  if (r.prueba) {
    console.log(`  Prueba de coherencia: ${r.prueba.detalle} → ${r.prueba.resultado}`);
    if (r.fallas.length) { console.log('  Fallas:'); console.table(r.fallas); process.exitCode = 1; }
  }
  if (r.usuariosDemo) {
    console.log('\n  Usuarios de demostración:');
    console.table(r.usuariosDemo);
  } else {
    console.log('\n  Sin usuarios. Crea el primer gerente con:  npm run usuario:gerente -- <usuario> "<Nombre completo>"');
  }
  console.log('\nListo. Siguiente paso:  npm run db:conectividad\n');
} catch (err) {
  console.error('\n✗ No se pudo instalar la base:', err.message);
  if (err.code === '28P01') console.error('  La contraseña de DB_ADMIN_PASSWORD (usuario postgres) no es correcta.');
  if (err.code === 'ECONNREFUSED') console.error('  PostgreSQL no responde en ese host/puerto. ¿Está iniciado el servicio?');
  process.exitCode = 1;
}
