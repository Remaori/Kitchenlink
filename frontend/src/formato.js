// Textos que se repiten en varias pantallas (fechas, dinero, iniciales)
import { ahora } from './reloj.js';

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase();

export const hora = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const fechaHora = (f) => new Date(f).toLocaleString('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// "martes 22 de septiembre"
export const fechaLarga = (f) => new Date(f).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
// "22 sep"
export const fechaCorta = (f) => new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
// "22/09/2026"
export const fechaNumerica = (f) => new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** AAAA-MM-DD de una fecha, en la zona horaria del navegador (la del restaurante). */
export function diaISO(f = ahora()) {
  const d = new Date(f);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 02a · Columna "Último acceso" cuando no está En línea
export function cuandoFue(f) {
  if (!f) return 'Nunca';
  const d = new Date(f);
  const dias = Math.floor((ahora() - d) / 86_400_000);
  if (dias < 1) return `Hoy ${hora(d)}`;
  if (dias < 2) return `Ayer ${hora(d)}`;
  if (dias < 14) return `Hace ${dias} días`;
  if (dias < 60) return `Hace ${Math.round(dias / 7)} semanas`;
  return `Hace ${Math.round(dias / 30)} meses`;
}

// "1 usuario" / "4 usuarios"
export const contar = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

// El dinero llega de la API como texto ("1571.80") para no perder centavos
const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', currencySymbol: '$' });
/** "$1,571.80" */
export const dinero = (v) => pesos.format(Number(v ?? 0)).replace('MX$', '$');
/** "$95" en las tarjetas de producto; "$95.50" si tiene centavos */
export const dineroCorto = (v) => (Number(v) % 1 ? dinero(v) : `$${Number(v).toLocaleString('es-MX')}`);

/** "45 min" · "1 h 24 min" */
export function duracion(minutos) {
  if (minutos == null) return '—';
  const m = Math.round(minutos);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

export const sinAcentos = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
