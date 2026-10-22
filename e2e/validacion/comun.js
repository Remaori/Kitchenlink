// Ayudantes de las pruebas de validación: una ventana que pasa de caso en caso, como una
// persona, y una captura por caso en e2e/evidencias/ (PV-xx.jpg, o PV-xx-falla.jpg).
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { WEB } from '../direcciones.js';

export const BASE = WEB;
export const DIR = path.join(import.meta.dirname, '..', 'evidencias');

export let nav;
export let p;
/** Cambia la ventana con la que siguen los casos (ej. otra persona con su propia sesión) */
export const usar = (pagina) => { p = pagina; };
export const nuevaPagina = () => nav.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' });

/**
 * Prepara el archivo: casos en orden (cada uno parte de donde quedó el anterior) y, al final,
 * lo obtenido en evidencias/<nombre>.json. Devuelve `caso(id, nombre, pasos)`: los pasos
 * regresan lo obtenido; si algo no aparece a tiempo, el caso falla.
 */
export function casosEnOrden(nombre) {
  const resultados = [];
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(DIR, { recursive: true });
    nav = browser;
    p = await nuevaPagina();
  });
  test.afterAll(async () => {
    fs.writeFileSync(path.join(DIR, `${nombre}.json`), JSON.stringify(resultados, null, 2));
    console.log(`\n${resultados.filter((r) => r.resultado === 'PASA').length}/${resultados.length} casos pasan · capturas en ${DIR}`);
  });
  return function caso(id, titulo, fn) {
    test(`${id} · ${titulo}`, async () => {
      try {
        const obtenido = await fn();
        await p.waitForTimeout(400); // que terminen las transiciones de CSS
        // Si el caso ya tomó su captura en el momento clave, no se sobrescribe
        if (!fs.existsSync(path.join(DIR, `${id}.jpg`))) await captura(id);
        resultados.push({ id, nombre: titulo, resultado: 'PASA', obtenido });
        console.log(`  ${id} · ${obtenido}`);
      } catch (e) {
        await captura(`${id}-falla`).catch(() => {});
        resultados.push({ id, nombre: titulo, resultado: 'FALLA', obtenido: e.message.split('\n')[0] });
        throw e;
      }
    });
  };
}

export const captura = async (nombre) => {
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(DIR, `${nombre}.jpg`), type: 'jpeg', quality: 80 });
};

export async function entrar(usuario, contrasena = 'Kitchen2026') {
  await p.goto(BASE + '/iniciar-sesion');
  await p.getByLabel('Usuario').fill(usuario);
  await p.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await p.getByRole('button', { name: 'Iniciar sesión' }).click();
}
export async function salir() {
  await p.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await p.getByLabel('Usuario').waitFor();
}
/** Cierra la sesión que haya y entra como `usuario` */
export async function entrarComo(usuario, saludo) {
  if (await p.getByRole('button', { name: 'Cerrar sesión' }).count()) await salir();
  await entrar(usuario);
  await p.getByRole('heading', { name: saludo }).waitFor();
}
export const esperarTexto = (t, timeout = 5000) => p.getByText(t).first().waitFor({ timeout });
