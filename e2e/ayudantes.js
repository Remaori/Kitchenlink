// Ayudantes de las pruebas de pantalla
import { expect } from '@playwright/test';
import { WEB } from './direcciones.js';

export const DEMO = 'Kitchen2026';

/**
 * Un dispositivo del restaurante: su propio navegador, con su propia sesión
 * (la tablet del mesero, la pantalla de cocina, la computadora de caja…).
 */
export async function dispositivo(browser, usuario) {
  const contexto = await browser.newContext({
    baseURL: WEB, locale: 'es-MX', timezoneId: 'America/Mexico_City', viewport: { width: 1440, height: 900 },
  });
  const pagina = await contexto.newPage();
  if (usuario) await entrarComo(pagina, usuario);
  return pagina;
}

/** Entra sin el formulario (la cookie de la sesión queda en ese navegador). */
export async function entrarComo(pagina, usuario, contrasena = DEMO) {
  const r = await pagina.request.post('/api/auth/iniciar-sesion', { data: { usuario, contrasena } });
  expect(r.ok(), `${usuario} no pudo entrar`).toBeTruthy();
}

/** "$2,513.60" → "2513.60" */
export const sinFormato = (texto) => texto.replace(/[^\d.]/g, '');
