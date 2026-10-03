// npm run dev      levanta la API (:3000) y la app (:5173) en este equipo
// npm run dev:red  igual, pero la app también se abre desde otros equipos de la red local
//                  (http://<IP de este equipo>:5173). Ctrl+C detiene ambos.
import { spawn } from 'node:child_process';

const red = process.argv.includes('--red');
const procesos = [
  spawn('npm run dev -w backend', { stdio: 'inherit', shell: true }),
  spawn(`npm run dev -w frontend${red ? ' -- --host' : ''}`, { stdio: 'inherit', shell: true }),
];
let saliendo = false;
const salir = (codigo = 0) => {
  if (saliendo) return;
  saliendo = true;
  for (const p of procesos) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(codigo), 500);
};
for (const p of procesos) p.on('exit', (c) => salir(c ?? 0));
process.on('SIGINT', () => salir(0));
process.on('SIGTERM', () => salir(0));
