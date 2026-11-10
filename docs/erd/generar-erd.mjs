// Genera el diagrama entidad-relación (KitchenLink_ERD_v3.pdf y .png) a partir de la base de
// datos real: las tablas, columnas, tipos, llaves y relaciones salen del catálogo de PostgreSQL.
// Aquí solo se decide en qué módulo y en qué lugar va cada tabla.
//   node docs/erd/generar-erd.mjs      (usa la base de backend/.env y el Edge de las pruebas de pantalla;
//                                       la primera vez: npm install --prefix e2e)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const aqui = import.meta.dirname;
const raiz = path.resolve(aqui, '../..');
const pg = createRequire(path.join(raiz, 'backend/package.json'))('pg');
const { chromium } = createRequire(path.join(raiz, 'e2e/package.json'))('@playwright/test');
const { config } = await import(pathToFileURL(path.join(raiz, 'backend/src/config.js')).href);

// ------------------------------------------------------------------ Acomodo
const MODULOS = {
  seguridad: { titulo: 'Usuarios y seguridad · 02a, 02b, 02c', color: '#7C5CFC', fondo: '#F6F4FF', borde: '#DCD3FD' },
  mesas: { titulo: 'Mesas y recepción · 03a, 03b, 04', color: '#2F6FDB', fondo: '#F0F5FE', borde: '#C8D9F7' },
  comandas: { titulo: 'Comandas y cocina · 05a, 05b, 06', color: '#D97706', fondo: '#FFF8EC', borde: '#F3DDB5' },
  menu: { titulo: 'Menú · 09', color: '#15936A', fondo: '#EEF9F4', borde: '#BDE5D2' },
  caja: { titulo: 'Caja y cobro · 07, 08', color: '#0E8A8F', fondo: '#EDF8F8', borde: '#BCE2E3' },
  catalogos: { titulo: 'Catálogos · sin relaciones', color: '#64748B', fondo: '#F6F7F9', borde: '#DCE0E6' },
};
// Esquina superior izquierda de cada tabla y su módulo
const TABLAS = {
  configuracion: ['catalogos', 70, 175], etiqueta_estado: ['catalogos', 70, 335],
  categoria: ['menu', 500, 175], producto: ['menu', 900, 175], producto_86: ['menu', 1270, 175],
  pago: ['caja', 1710, 175], corte_caja: ['caja', 2080, 175],
  cancelacion: ['comandas', 70, 760], detalle_comanda: ['comandas', 440, 760], envio: ['comandas', 810, 760],
  comanda: ['comandas', 1180, 760],
  mesa: ['mesas', 1870, 760], reservacion: ['mesas', 2240, 760], lista_espera: ['mesas', 2240, 1230],
  sesion: ['seguridad', 70, 1350], bitacora: ['seguridad', 70, 1645], usuario: ['seguridad', 440, 1350],
  rol: ['seguridad', 810, 1350], permiso: ['seguridad', 810, 1580], rol_permiso: ['seguridad', 440, 1760],
};
// La tabla usuario repetida en cada módulo, para las líneas de "quién hizo la acción"
const COPIAS = { menu: [1270, 460], caja: [2080, 545], comandas: [1550, 1070], mesas: [1870, 1380] };
// Notas: [módulo que la rodea (o null), x, y, ancho, texto]
const NOTAS = [
  ['menu', 500, 420, 300, '<b>producto_86</b> · revisión del 21 de octubre. Cada vez que un producto se agota queda su motivo, '
    + 'desde y hasta cuándo, y quién lo marcó y lo regresó. El producto ya no guarda la disponibilidad: '
    + 'está agotado si tiene un 86 abierto (a lo más uno).'],
  [null, 2660, 760, 300, '<h4>Cambios de la revisión del 21 oct</h4><ul>'
    + '<li><b>producto_86</b>: tabla nueva con el historial de 86 (motivo, desde, hasta y quién).</li>'
    + '<li><b>producto</b>: sin <s>disponible</s> ni <s>motivo_no_disponible</s>.</li>'
    + '<li><b>mesa.numero</b>: solo enteros del 1 al 999, con dos cifras (07, 22).</li></ul>'],
];
const NUEVAS = { producto_86: 'nuevo · 21 oct' };

const ANCHO = 330;
const ANCHO_COPIA = 210;
const CABEZA = 34;
const FILA = 26;

// ------------------------------------------------------------ Lo que dice la base
const c = new pg.Client({ ...config.bdAdmin, database: config.bd.database });
await c.connect();
const { rows: columnas } = await c.query(`
  SELECT c.relname AS tabla, a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo,
         a.attnotnull AS obligatoria, a.attgenerated <> '' AS calculada, t.typtype = 'e' AS enum
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE s.nspname = 'kitchenlink' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY c.relname, a.attnum`);
const { rows: llaves } = await c.query(`
  SELECT c.relname AS tabla, k.contype AS tipo, r.relname AS ref,
         ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(n, i)
               JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n ORDER BY u.i) AS cols,
         ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(n, i)
               JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.n ORDER BY u.i) AS refcols
  FROM pg_constraint k
  JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace s ON s.oid = c.relnamespace
  LEFT JOIN pg_class r ON r.oid = k.confrelid
  WHERE s.nspname = 'kitchenlink' AND k.contype IN ('p', 'f')`);
// Únicos de una sola columna, sin condición ni expresión (lower(...) o WHERE no cuentan)
const { rows: unicos } = await c.query(`
  SELECT c.relname AS tabla, a.attname AS columna
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace s ON s.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
  WHERE s.nspname = 'kitchenlink' AND i.indisunique AND NOT i.indisprimary AND i.indnatts = 1
    AND i.indpred IS NULL AND i.indkey[0] > 0`);
await c.end();

const tablas = {};
for (const r of columnas) (tablas[r.tabla] ??= { nombre: r.tabla, columnas: [] }).columnas.push({ ...r, pk: false, fk: false, uq: false });
const col = (t, nombre) => tablas[t].columnas.find((x) => x.columna === nombre);
const faltan = Object.keys(tablas).filter((t) => !TABLAS[t]);
if (faltan.length) throw new Error(`Tablas sin lugar en el diagrama: ${faltan.join(', ')} (agrégalas a TABLAS)`);
for (const k of llaves.filter((x) => x.tipo === 'p')) for (const n of k.cols) col(k.tabla, n).pk = true;
for (const u of unicos) col(u.tabla, u.columna).uq = true;
const relaciones = llaves.filter((k) => k.tipo === 'f').map((k) => {
  for (const n of k.cols) col(k.tabla, n).fk = true;
  // Llave compuesta (detalle_comanda → envio): se dibuja la columna que apunta a la PK
  const i = Math.max(0, k.refcols.findIndex((n) => col(k.ref, n).pk && tablas[k.ref].columnas.filter((x) => x.pk).length === 1));
  const columna = col(k.tabla, k.cols[i]);
  return { tabla: k.tabla, columna: columna.columna, ref: k.ref, refcol: k.refcols[i], opcional: !columna.obligatoria };
});

// ------------------------------------------------------------------ Geometría
const alto = (n) => CABEZA + 8 + n * FILA;
const caja = {};
for (const [t, [modulo, x, y]] of Object.entries(TABLAS)) caja[t] = { modulo, x, y, w: ANCHO, h: alto(tablas[t].columnas.length) };
for (const [m, [x, y]] of Object.entries(COPIAS)) caja[`usuario@${m}`] = { modulo: m, x, y, w: ANCHO_COPIA, h: alto(1) + 30, copia: true };
const filaY = (t, nombre) => {
  const b = caja[t];
  const i = b.copia ? 0 : tablas[t].columnas.findIndex((x) => x.columna === nombre);
  return b.y + CABEZA + 4 + i * FILA + FILA / 2;
};

// "Quién hizo la acción": FK a usuario desde otra tabla que no sea su sesión
const esActor = (r) => r.ref === 'usuario' && r.tabla !== 'sesion';
const destino = (r) => {
  const m = caja[r.tabla].modulo;
  return esActor(r) && m !== 'seguridad' ? `usuario@${m}` : r.ref;
};

function lado(a, b) {
  const ca = a.x + a.w / 2;
  const cb = b.x + b.w / 2;
  if (cb - ca > a.w * 0.6) return [1, -1];
  if (ca - cb > a.w * 0.6) return [-1, 1];
  return [1, 1];
}
const svg = [];
function marca(x, y, d, tipo, trazo) {
  const p = (dx, dy) => `${x + d * dx},${y + dy}`;
  const linea = (a, b) => `<path d="M${a} L${b}" stroke="${trazo}" stroke-width="1.6" fill="none"/>`;
  const circulo = (dx) => `<circle cx="${x + d * dx}" cy="${y}" r="4.2" fill="#fff" stroke="${trazo}" stroke-width="1.6"/>`;
  if (tipo === 'muchos') return linea(p(0, -7), p(13, 0)) + linea(p(0, 7), p(13, 0)) + linea(p(0, 0), p(13, 0)) + circulo(19);
  if (tipo === 'uno') return linea(p(6, -7), p(6, 7)) + linea(p(11, -7), p(11, 7));
  return linea(p(6, -7), p(6, 7)) + circulo(14);
}
for (const r of relaciones) {
  const a = caja[r.tabla];
  const t = destino(r);
  const b = caja[t];
  const [da, db] = lado(a, b);
  const x1 = da > 0 ? a.x + a.w : a.x;
  const x2 = db > 0 ? b.x + b.w : b.x;
  const y1 = filaY(r.tabla, r.columna);
  const y2 = filaY(t, r.refcol);
  const k = da === db ? 60 + Math.abs(y2 - y1) * 0.12 : Math.max(60, Math.abs(x2 - x1) * 0.45);
  const actor = esActor(r);
  const trazo = actor ? '#9AA3B2' : '#2B3445';
  svg.push(`<path d="M${x1},${y1} C${x1 + da * k},${y1} ${x2 + db * k},${y2} ${x2},${y2}" fill="none" stroke="${trazo}"
    stroke-width="${actor ? 1.4 : 1.8}" ${actor ? 'stroke-dasharray="6 5"' : ''}/>`);
  svg.push(marca(x1, y1, da, 'muchos', trazo), marca(x2, y2, db, r.opcional ? 'cero_o_uno' : 'uno', trazo));
}

// Los módulos rodean sus tablas, copias y notas
const marcos = {};
const ampliar = (m, x1, y1, x2, y2) => {
  const f = (marcos[m] ??= { x1, y1, x2, y2 });
  Object.assign(f, { x1: Math.min(f.x1, x1), y1: Math.min(f.y1, y1), x2: Math.max(f.x2, x2), y2: Math.max(f.y2, y2) });
};
for (const b of Object.values(caja)) ampliar(b.modulo, b.x, b.y, b.x + b.w, b.y + b.h);
for (const [m, x, y, w] of NOTAS) if (m) ampliar(m, x, y, x + w, y + 150);

// ---------------------------------------------------------------------- HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tipo = (x) => {
  const t = x.tipo.replace(/^character varying/, 'varchar').replace('timestamp with time zone', 'timestamptz');
  return x.calculada ? `${t} (calculada)` : t;
};
const insignias = (x) => [x.pk && '<i class="pk">PK</i>', x.fk && '<i class="fk">FK</i>', x.uq && '<i class="uq">UQ</i>'].filter(Boolean).join('');
const htmlTabla = (t) => {
  const b = caja[t];
  const m = MODULOS[b.modulo];
  const filas = tablas[t].columnas.map((x) => `<div class="fila${x.obligatoria ? ' nn' : ''}">
      <span class="ins">${insignias(x)}</span><span class="col">${esc(x.columna)}</span>
      <span class="tipo${x.enum ? ' enum' : ''}">${esc(tipo(x))}</span></div>`).join('');
  return `<div class="tabla" style="left:${b.x}px;top:${b.y}px;width:${b.w}px">
    <div class="cabeza" style="background:${m.color}">${t}${NUEVAS[t] ? `<em>${NUEVAS[t]}</em>` : ''}</div>${filas}</div>`;
};
const htmlCopia = (m) => {
  const b = caja[`usuario@${m}`];
  return `<div class="tabla copia" style="left:${b.x}px;top:${b.y}px;width:${b.w}px">
    <div class="cabeza">usuario <small>(copia)</small></div>
    <div class="fila nn"><span class="ins"><i class="pk">PK</i></span><span class="col">id</span><span class="tipo">bigint</span></div>
    <p>Misma tabla del módulo<br>Usuarios y seguridad</p></div>`;
};
const htmlMarco = (m) => {
  const f = marcos[m];
  const d = MODULOS[m];
  return `<div class="modulo" style="left:${f.x1 - 28}px;top:${f.y1 - 52}px;width:${f.x2 - f.x1 + 56}px;height:${f.y2 - f.y1 + 80}px;
    background:${d.fondo};border-color:${d.borde}"><h2 style="color:${d.color}">${d.titulo}</h2></div>`;
};
const W = Math.max(...Object.values(marcos).map((f) => f.x2), ...NOTAS.map(([, x, , w]) => x + w), 2490 + 460) + 50;
const H = Math.max(...Object.values(marcos).map((f) => f.y2)) + 70;

const glifo = (tipoFin) => `<svg width="74" height="18">${`<path d="M4,9 L70,9" stroke="#2B3445" stroke-width="1.6"/>`}
  ${marca(4, 9, 1, tipoFin, '#2B3445')}${marca(70, 9, -1, 'muchos', '#2B3445')}</svg>`;
const leyenda = [
  ['<i class="pk">PK</i>', 'Llave primaria'],
  ['<i class="fk">FK</i>', 'Llave foránea (apunta a otra tabla)'],
  ['<i class="uq">UQ</i>', 'Valor único (no se repite)'],
  ['<b>columna</b>', 'Obligatoria (NOT NULL)'],
  ['<span class="gris">columna</span>', 'Puede quedar vacía (NULL)'],
  ['<span class="enumtxt">estado_mesa</span>', 'Tipo ENUM (lista fija de estados)'],
  ['<svg width="74" height="18"><path d="M4,9 L70,9" stroke="#2B3445" stroke-width="1.8"/></svg>', 'Relación del negocio'],
  ['<svg width="74" height="18"><path d="M4,9 L70,9" stroke="#9AA3B2" stroke-width="1.4" stroke-dasharray="6 5"/></svg>', 'Quién hizo la acción (usuario)'],
  ['<span class="copiatxt">usuario</span> <small>(copia)</small>', 'La misma tabla usuario, repetida en cada módulo para que las líneas no crucen el diagrama'],
  [glifo('uno'), 'Uno a muchos: una fila de un lado, cero o muchas del lado de la pata de gallo'],
  [glifo('cero_o_uno'), 'La FK puede quedar vacía: relación opcional'],
  ['<em class="nuevo">nuevo · 21 oct</em>', 'Cambio de la revisión del 21 de octubre'],
].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');

const fuente = (peso) => pathToFileURL(path.join(raiz, `node_modules/@fontsource/inter/files/inter-latin-${peso}-normal.woff2`)).href;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>KitchenLink · Modelo entidad-relación</title><style>
${[400, 500, 600, 700].map((p) => `@font-face{font-family:Inter;font-weight:${p};src:url('${fuente(p)}') format('woff2')}`).join('\n')}
@page { size: ${W}px ${H}px; margin: 0 }
* { box-sizing: border-box; margin: 0 }
body { width: ${W}px; height: ${H}px; position: relative; background: #fff; font-family: Inter, sans-serif; color: #111827; }
h1 { position: absolute; left: 40px; top: 28px; font-size: 34px; font-weight: 700; letter-spacing: -.01em }
.sub { position: absolute; left: 40px; top: 76px; font-size: 15px; color: #6B7280 }
.modulo { position: absolute; border: 1.5px solid; border-radius: 14px }
.modulo h2 { position: absolute; left: 18px; top: 14px; font-size: 17px; font-weight: 700 }
svg.lineas { position: absolute; left: 0; top: 0 }
.tabla { position: absolute; background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(17,24,39,.06); padding-bottom: 8px }
.cabeza { height: ${CABEZA}px; color: #fff; font-weight: 700; font-size: 15px; padding: 0 12px; display: flex; align-items: center; gap: 10px }
.cabeza em { font-style: normal; font-size: 11px; font-weight: 600; background: rgba(255,255,255,.22); border-radius: 999px; padding: 2px 8px }
.fila { height: ${FILA}px; display: grid; grid-template-columns: 58px 1fr auto; align-items: center; padding: 0 12px 0 8px; font-size: 13px; color: #6B7280 }
.fila:nth-child(odd) { background: #FAFAFB }
.fila.nn .col { color: #111827; font-weight: 500 }
.ins { display: flex; gap: 3px }
i { font-style: normal; font-size: 9.5px; font-weight: 700; border-radius: 4px; padding: 1px 4px; letter-spacing: .02em }
i.pk { background: #FEF3C7; color: #B45309 } i.fk { background: #DBEAFE; color: #1D4ED8 } i.uq { background: #E5E7EB; color: #4B5563 }
.tipo { font-size: 11.5px; color: #9CA3AF; padding-left: 10px }
.tipo.enum, .enumtxt { color: #7C5CFC; font-style: italic }
.copia { border: 1.6px dashed #A78BFA; background: #FBFAFF }
.copia .cabeza { color: #7C5CFC; background: #EFEAFE } .copia .cabeza small { font-weight: 500; color: #9C8CF0 }
.copia p { font-size: 10.5px; color: #8B8FA0; padding: 6px 12px 0; line-height: 1.35 }
.nota { position: absolute; font-size: 13px; line-height: 1.5; color: #35554A; background: #fff; border: 1px solid #BDE5D2;
  border-radius: 10px; padding: 10px 14px }
.leyenda { position: absolute; left: 2490px; top: 125px; width: 460px; background: #fff; border: 1px solid #DCE0E6; border-radius: 12px; overflow: hidden }
.leyenda h3 { background: #334155; color: #fff; font-size: 14px; padding: 9px 14px }
.leyenda div { display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 10px; padding: 5px 14px; font-size: 12px; color: #374151 }
.leyenda .gris { color: #9CA3AF } .copiatxt { color: #7C5CFC; font-weight: 600 }
.nota.suelta { border-color: #DCE0E6; color: #374151 }
.nota h4 { font-size: 14px; margin-bottom: 6px; color: #15936A }
.nota ul { padding-left: 18px } .nota li { margin: 4px 0 } .nota s { color: #9CA3AF }
em.nuevo { font-style: normal; font-size: 11px; font-weight: 600; color: #fff; background: #15936A; border-radius: 999px; padding: 2px 8px }
</style></head><body>
<h1>KitchenLink · Modelo entidad-relación</h1>
<p class="sub">PostgreSQL 16+ · esquema kitchenlink · ${Object.keys(tablas).length} tablas · ${relaciones.length} relaciones ·
  los números de pantalla indican dónde se usa cada módulo · actualizado con la revisión del 21 de octubre</p>
${Object.keys(marcos).map(htmlMarco).join('\n')}
<svg class="lineas" width="${W}" height="${H}">${svg.join('\n')}</svg>
${Object.keys(TABLAS).map(htmlTabla).join('\n')}
${Object.keys(COPIAS).map(htmlCopia).join('\n')}
${NOTAS.map(([m, x, y, w, t]) => `<div class="nota${m ? '' : ' suelta'}" style="left:${x}px;top:${y}px;width:${w}px">${t}</div>`).join('\n')}
<div class="leyenda"><h3>Cómo leer el diagrama</h3>${leyenda}</div>
</body></html>`;

// ------------------------------------------------------------------ PDF y PNG
const archivo = path.join(os.tmpdir(), 'kitchenlink-erd.html');
fs.writeFileSync(archivo, html);
const navegador = await chromium.launch({ channel: process.env.E2E_NAVEGADOR || 'msedge' });
const pagina = await navegador.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await pagina.goto(pathToFileURL(archivo).href);
await pagina.evaluate(() => document.fonts.ready);
const base = path.join(aqui, 'KitchenLink_ERD_v3');
await pagina.pdf({ path: `${base}.pdf`, preferCSSPageSize: true, printBackground: true });
await pagina.screenshot({ path: `${base}.png`, fullPage: true });
await navegador.close();
console.log(`${Object.keys(tablas).length} tablas · ${relaciones.length} relaciones · ${W}×${H}\n${base}.pdf\n${base}.png`);
