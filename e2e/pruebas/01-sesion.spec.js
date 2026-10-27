// 01 · Iniciar sesión, en el navegador
import { test, expect } from '@playwright/test';
import { DEMO, entrarComo } from '../ayudantes.js';

test.describe('01 · Iniciar sesión', () => {
  test('con usuario y contraseña entra a su inicio, con el menú de su rol', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Usuario').fill('lsaenz');
    await page.getByLabel('Contraseña', { exact: true }).fill(DEMO);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuarios y roles' })).toBeVisible();
  });

  test('con la contraseña equivocada avisa sin decir si el usuario existe, y borra lo escrito', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Usuario').fill('lsaenz');
    const contrasena = page.getByLabel('Contraseña', { exact: true });
    await contrasena.fill('Equivocada1');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
    await expect(contrasena).toHaveValue('');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
  });

  test('un mesero no ve «Usuarios y roles»; si abre la dirección, ve «Sin acceso»', async ({ page }) => {
    await entrarComo(page, 'lmora');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Mis mesas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuarios y roles' })).toHaveCount(0);
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: 'Sin acceso' })).toBeVisible();
  });

  test('«Cerrar sesión» regresa al inicio de sesión y esa sesión ya no sirve', async ({ page }) => {
    await entrarComo(page, 'aruiz');
    await page.goto('/');
    // El botón del menú lateral (Inicio tiene otro igual)
    await page.getByRole('complementary').getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    expect((await page.request.get('/api/auth/sesion')).status()).toBe(401);
  });

  test('si la cookie venció, la siguiente acción regresa al inicio de sesión con el aviso', async ({ page }) => {
    await entrarComo(page, 'lsaenz');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hola, Luis' })).toBeVisible();
    // Lo que hace el navegador cuando pasan las SESION_HORAS: ya no manda la cookie
    await page.context().clearCookies();
    await page.getByRole('link', { name: 'Usuarios y roles' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page.getByText('Inicia sesión para continuar.')).toBeVisible();
  });
});
