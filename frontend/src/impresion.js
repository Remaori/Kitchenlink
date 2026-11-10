// Imprimir tickets, pre-tickets y cortes Z.
// El servidor manda el trabajo a la impresora térmica de caja (ESC/POS). Si no
// hay impresora configurada, regresa los renglones y aquí se imprimen con el
// navegador, en el ancho de un ticket de 80 mm.
import { api } from './api.js';

export function imprimirEnNavegador(renglones, titulo = 'Ticket') {
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
    <style>@page{size:80mm auto;margin:4mm}body{margin:0}pre{font:12px/1.35 "Consolas","Courier New",monospace;margin:0;white-space:pre}</style>
    </head><body><pre></pre></body></html>`);
  doc.close();
  doc.querySelector('pre').textContent = renglones.join('\n');
  marco.contentWindow.focus();
  marco.contentWindow.print();
  setTimeout(() => marco.remove(), 2000);
}

/**
 * Pide imprimir al servidor: true si salió por la impresora térmica,
 * false si se imprimió con el navegador.
 */
export async function imprimir(ruta, titulo) {
  try {
    const r = await api.post(ruta);
    if (r.impreso) return true;
    imprimirEnNavegador(r.renglones, titulo);
    return false;
  } catch (e) {
    // La impresora no respondió: se imprime en el navegador para no detener la caja
    if (e.codigo === 'IMPRESORA' && e.cuerpo?.renglones) {
      imprimirEnNavegador(e.cuerpo.renglones, titulo);
      return false;
    }
    throw e;
  }
}
