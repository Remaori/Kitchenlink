// npm run db:respaldar                     copia de la base en backend/respaldos/
// npm run db:respaldar -- E:\respaldos     en otra carpeta (el disco externo)
//
// pg_dump en formato comprimido (-Fc) como el administrador: esquema, datos y
// permisos. Trae los hashes de las contraseñas y los datos de los clientes, así
// que no se sube al repositorio. Restaurar y programarlo cada noche:
// docs/GUIA_ENTORNO.md, sección "Respaldo de la base".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, RAIZ_BACKEND, validarConfig } from '../src/config.js';

// En Windows pg_dump no queda en el PATH: se usa el de la versión más nueva en Program Files
function pgDump() {
  const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const base = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
  const versiones = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a) : [];
  return versiones.map((v) => path.join(base, v, 'bin', exe)).find((p) => fs.existsSync(p)) ?? exe;
}

try {
  validarConfig({ admin: true });
  // shortcut: no borra respaldos viejos (cada uno pesa pocos MB); limpiar a mano o agregarlo si el disco se llena
  // INIT_CWD: la carpeta desde la que se corrió npm, no backend/
  const carpeta = path.resolve(process.env.INIT_CWD || process.cwd(), process.argv[2] || path.join(RAIZ_BACKEND, 'respaldos'));
  fs.mkdirSync(carpeta, { recursive: true });
  const cuando = new Date().toLocaleString('sv-SE', { timeZone: config.zonaHoraria }).replace(' ', '_').replace(/:/g, '');
  const archivo = path.join(carpeta, `${config.bd.database}_${cuando}.dump`);
  const { host, port, user, password } = config.bdAdmin;
  // -w: nunca pide contraseña (en una tarea programada se quedaría esperando)
  const r = spawnSync(pgDump(), ['-Fc', '-w', '-h', host, '-p', String(port), '-U', user, '-d', config.bd.database, '-f', archivo],
    { env: { ...process.env, PGPASSWORD: password }, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error?.code === 'ENOENT') throw new Error('No se encontró pg_dump. Instala PostgreSQL o agrega su carpeta bin al PATH.');
  if (r.error) throw r.error;
  if (r.status !== 0) {
    fs.rmSync(archivo, { force: true });
    throw new Error(`pg_dump terminó con el código ${r.status} (el mensaje está arriba).`);
  }
  console.log(`✓ Respaldo de "${config.bd.database}": ${archivo} (${Math.ceil(fs.statSync(archivo).size / 1024)} KB)`);
} catch (err) {
  console.error('✗ No se pudo respaldar:', err.message);
  process.exitCode = 1;
}
