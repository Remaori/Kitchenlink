// npm run cronograma                 qué módulos se ven hoy (o con FECHA_REVISION de backend/.env)
// npm run cronograma -- 2026-10-28   qué se verá en esa revisión
import { TAREAS, fechaDeCorte, habilitado } from '../src/cronograma.js';

const fecha = process.argv[2] || fechaDeCorte();
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
  console.error('Escribe la fecha como AAAA-MM-DD, ej. npm run cronograma -- 2026-10-28');
  process.exit(1);
}

console.log(`\nKitchenLink · módulos del cronograma al ${fecha}\n`);
console.table(TAREAS.map((t) => ({
  'Tarea del cronograma': t.tarea,
  Pantallas: t.pantallas,
  'Del · al': `${t.inicio} · ${t.fin}`,
  'Se revisa': t.siempre ? 'siempre visible' : t.revision,
  'Se ve': habilitado(t.clave, fecha) ? 'sí' : 'no',
})));
console.log('Antes de su revisión, un módulo no sale en el menú (o sale como "pronto") y su API responde 404.\n');
