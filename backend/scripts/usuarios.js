// Comandos de consola del servidor (pantalla 12: "si no hay otro gerente,
// se restablece desde el servidor con un comando").
//
//   npm run usuario:gerente -- lsaenz "Luis Sáenz Jiménez"   primer gerente de una base nueva
//   npm run usuario:restablecer -- lsaenz                    contraseña temporal nueva
//
// Ambos imprimen una contraseña temporal; al entrar, la persona crea la suya (01b).
import { validarConfig } from '../src/config.js';
import { pool } from '../src/db.js';
import { crearGerenteDesdeServidor, restablecerDesdeServidor } from '../src/seguridad/servicio.js';

const [accion, usuario, nombre] = process.argv.slice(2);
try {
  validarConfig();
  let r;
  if (accion === 'crear-gerente') {
    if (!usuario || !nombre) throw new Error('Uso: npm run usuario:gerente -- <usuario> "<Nombre completo>"');
    r = await crearGerenteDesdeServidor(usuario, nombre);
    console.log(`\n✓ Gerente creado: ${r.nombre_completo} (${r.nombre_usuario}) · estado Pendiente`);
  } else if (accion === 'restablecer') {
    if (!usuario) throw new Error('Uso: npm run usuario:restablecer -- <usuario>');
    r = await restablecerDesdeServidor(usuario);
    console.log(`\n✓ Contraseña restablecida: ${r.nombre_completo} (${r.nombre_usuario}). Sus sesiones abiertas se cerraron.`);
  } else {
    throw new Error('Acción desconocida. Usa crear-gerente o restablecer.');
  }
  console.log(`  Contraseña temporal: ${r.temporal}`);
  console.log('  Al entrar, el sistema le pedirá crear una contraseña propia.\n');
} catch (err) {
  console.error('\n✗ ' + (err.code === '23505' ? 'Ya existe un usuario con ese nombre.' : err.message) + '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
