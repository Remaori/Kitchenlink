// npm run db:conectividad                      prueba Backend <-> PostgreSQL y la API local
// npm run db:conectividad -- --api http://192.168.1.50:5173   prueba la API de otro equipo
// Imprime la tabla y guarda el reporte en backend/reportes/ (evidencia para la revisión).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, validarConfig, RAIZ_BACKEND } from '../src/config.js';
import { pool } from '../src/db.js';
import { ejecutarVerificaciones } from './lib/conectividad.js';

const i = process.argv.indexOf('--api');
const urlApi = i > 0 ? process.argv[i + 1].replace(/\/$/, '') : undefined;

try {
  validarConfig({ admin: false });
} catch (e) {
  if (!config.bd.password) { console.error('✗ ' + e.message); process.exit(1); }
}

const fecha = new Date();
const res = await ejecutarVerificaciones({ urlApi });
await pool.end();

const icono = { PASA: '✓', AVISO: '!', FALLA: '✗' };
console.log('\nKitchenLink · Pruebas de conectividad con la base de datos\n');
for (const r of res) console.log(`  ${icono[r.resultado]} [${r.grupo}] ${r.nombre} — ${r.detalle}`);
const cuenta = (x) => res.filter((r) => r.resultado === x).length;
const resumen = `${res.length} verificaciones · ${cuenta('PASA')} pasan · ${cuenta('AVISO')} avisos · ${cuenta('FALLA')} fallan`;
console.log(`\n  ${resumen}\n`);

// Reporte en Markdown
const carpeta = path.join(RAIZ_BACKEND, 'reportes');
fs.mkdirSync(carpeta, { recursive: true });
const sello = fecha.toLocaleString('sv-SE', { timeZone: config.zonaHoraria }).slice(0, 16).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-');
const archivo = path.join(carpeta, `conectividad-${sello}.md`);
const md = [
  '# KitchenLink · Reporte de pruebas de conectividad',
  '',
  `- Fecha: ${fecha.toLocaleString('es-MX', { timeZone: config.zonaHoraria })}`,
  `- Equipo: ${os.hostname()} (${os.platform()} ${os.release()}) · Node.js ${process.version}`,
  `- Base: ${config.bd.database} en ${config.bd.host}:${config.bd.port} · usuario ${config.bd.user}`,
  `- Resultado: **${resumen}**`,
  '',
  '| # | Grupo | Verificación | Resultado | Detalle |',
  '|---|---|---|---|---|',
  ...res.map((r, n) => `| ${n + 1} | ${r.grupo} | ${r.nombre} | ${r.resultado} | ${String(r.detalle).replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
fs.writeFileSync(archivo, md);
console.log(`  Reporte guardado en ${path.relative(path.resolve(RAIZ_BACKEND, '..'), archivo)}\n`);
process.exitCode = cuenta('FALLA') ? 1 : 0;
