// Antes de levantar la API de las pruebas de pantalla: la base de pruebas, borrada
// y recién instalada con los datos de demostración. Nunca toca la base de desarrollo.
import { BASE } from './direcciones.js';

process.env.DB_NAME ||= BASE;
if (!process.env.DB_NAME.endsWith('_e2e')) {
  throw new Error(`Las pruebas de pantalla borran su base: usa una que termine en _e2e (no "${process.env.DB_NAME}").`);
}
const { instalarBase } = await import('../backend/scripts/lib/instalador.js');
await instalarBase({ nombre: process.env.DB_NAME, recrear: true, demo: true });
console.log(`Base ${process.env.DB_NAME} lista para las pruebas de pantalla`);
