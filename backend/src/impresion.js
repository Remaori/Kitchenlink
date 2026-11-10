// Servicio de impresión (ESC/POS) · pantalla 11: "envía tickets finales,
// pre-tickets y cortes Z a la impresora térmica de caja por red local".
//
// La impresora térmica recibe texto plano por TCP (puerto 9100) con algunos
// comandos ESC/POS: iniciar, letra grande, cortar el papel. Si no hay
// impresora configurada (IMPRESORA_HOST vacío), la API regresa el mismo texto
// y la pantalla lo imprime con el navegador.
import net from 'node:net';
import { config } from './config.js';

export const ANCHO = 42; // caracteres por renglón en papel de 80 mm (letra A)

const ESC = 0x1b;
const GS = 0x1d;

// Página de códigos 850 (español) para acentos, ñ y signos de apertura
const CP850 = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8, '×': 0x9e, '·': 0xfa,
};

export function codificar(texto) {
  const bytes = [];
  for (const ch of texto) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else bytes.push(CP850[ch] ?? 0x3f); // '?' si la impresora no tiene el carácter
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------- Renglones

export const centrado = (t) => {
  const s = String(t).slice(0, ANCHO);
  return ' '.repeat(Math.max(0, Math.floor((ANCHO - s.length) / 2))) + s;
};
/** Texto a la izquierda y monto a la derecha en el mismo renglón */
export const columnas = (izq, der) => {
  const d = String(der);
  const i = String(izq).slice(0, ANCHO - d.length - 1);
  return i + ' '.repeat(ANCHO - i.length - d.length) + d;
};
export const linea = (c = '-') => c.repeat(ANCHO);
export const pesos = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Trabajo de impresión: renglones de texto + comandos (inicio, código de página, corte) */
export function documento(renglones) {
  return Buffer.concat([
    Buffer.from([ESC, 0x40, ESC, 0x74, 0x02]), // ESC @ (iniciar) · ESC t 2 (página 850)
    codificar(renglones.join('\n')),
    Buffer.from([0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]), // avanzar y cortar (GS V B 0)
  ]);
}

/** Manda el trabajo a la impresora. true = impreso; false = no hay impresora configurada. */
export function imprimir(renglones, { host = config.impresora.host, puerto = config.impresora.puerto } = {}) {
  if (!host) return Promise.resolve(false);
  return new Promise((resolver, rechazar) => {
    const s = net.connect({ host, port: puerto });
    s.setTimeout(4000);
    s.on('connect', () => s.end(documento(renglones)));
    s.on('close', (conError) => (conError ? null : resolver(true)));
    s.on('timeout', () => { s.destroy(); rechazar(new Error(`La impresora (${host}:${puerto}) no responde.`)); });
    s.on('error', (e) => rechazar(new Error(`No se pudo imprimir en ${host}:${puerto}: ${e.message}`)));
  });
}
