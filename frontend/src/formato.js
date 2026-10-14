// Textos que se repiten en varias pantallas (fechas, dinero, iniciales)

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase();

export const hora = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

export const fechaHora = (f) => new Date(f).toLocaleString('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// 02a · Columna "Último acceso" cuando no está En línea
export function cuandoFue(f) {
  if (!f) return 'Nunca';
  const d = new Date(f);
  const dias = Math.floor((Date.now() - d) / 86_400_000);
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

export const sinAcentos = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
