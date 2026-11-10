// npm run dev        levanta la API (:3000) y la app (:5173) en este equipo. Ctrl+C detiene ambos.
// npm run dev:red    igual, pero la app también se abre desde otros equipos de la red local
//                    (http://<IP de este equipo>:5173).
// npm run demo       igual que dev, con el reloj de demostración: la app arranca a la hora de los
//                    datos de demostración (ver docs/CRONOGRAMA.md).
// npm run demo:todo  igual que demo, con todos los módulos del cronograma.
//
// Opciones, después de -- (solo valen para esa vez; el .env no cambia):
//   --red                 la app también se abre desde la red local
//   --todo                todos los módulos, sin esperar su miércoles de revisión
//   --fecha AAAA-MM-DD    lo que se verá en la revisión de esa fecha
//   Ej.: npm run demo -- --fecha 2026-10-28      npm run demo:todo -- --red
import { spawn } from 'node:child_process';

// Los datos de demostración (database/03_prueba_coherencia_v3.sql) quedan a esta hora:
// el martes 22 de septiembre a las 19:09, la que dibujan las pantallas del diseño.
const HORA_DE_LOS_DATOS = '2026-09-22T19:09:00-06:00';
// En la entrega final ya se revisó todo: con esta fecha de corte se ven todos los módulos.
const ENTREGA_FINAL = '2026-12-09';

const args = process.argv.slice(2);
const red = args.includes('--red');
const demo = args.includes('--demo');
const todo = args.includes('--todo');
const iFecha = args.findIndex((a) => a === '--fecha' || a.startsWith('--fecha='));
const fecha = iFecha < 0 ? null : args[iFecha].split('=')[1] ?? args[iFecha + 1];
if (iFecha >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) {
  console.error('Escribe la fecha como AAAA-MM-DD, ej. npm run demo -- --fecha 2026-10-28');
  process.exit(1);
}

// dotenv no reemplaza lo que ya trae el proceso: esto gana sobre lo que diga el .env
const entorno = { ...process.env };
if (demo) entorno.RELOJ_INICIO = HORA_DE_LOS_DATOS;
if (todo) entorno.FECHA_REVISION = ENTREGA_FINAL;
if (fecha) entorno.FECHA_REVISION = fecha;

const procesos = [
  spawn('npm run dev -w backend', { stdio: 'inherit', shell: true, env: entorno }),
  spawn(`npm run dev -w frontend${red ? ' -- --host' : ''}`, { stdio: 'inherit', shell: true }),
];
// En Windows, kill() solo cierra la terminal intermedia y deja vivos npm y node
// (con el puerto ocupado): taskkill /T cierra el árbol completo.
const detener = (p) => (process.platform === 'win32'
  ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
  : p.kill());
let saliendo = false;
const salir = (codigo = 0) => {
  if (saliendo) return;
  saliendo = true;
  for (const p of procesos) if (p.exitCode === null) detener(p);
  setTimeout(() => process.exit(codigo), 500);
};
for (const p of procesos) p.on('exit', (c) => salir(c ?? 0));
process.on('SIGINT', () => salir(0));
process.on('SIGTERM', () => salir(0));
