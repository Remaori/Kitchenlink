// 02b → 01b · El gerente da de alta a alguien y esa persona entra por primera vez
import { test, expect } from '@playwright/test';
import { dispositivo } from '../ayudantes.js';

test('el gerente da de alta a una mesera; con su temporal entra, crea su contraseña y queda Activa', async ({ browser }) => {
  const gerente = await dispositivo(browser, 'lsaenz');
  await gerente.goto('/usuarios/nuevo');
  await gerente.getByLabel('Nombre completo').fill('Paola Ríos Vega');
  await gerente.getByLabel('Teléfono').fill('55 2233 4455');
  await gerente.getByRole('combobox', { name: 'Rol' }).selectOption({ label: 'Mesero' });
  const temporal = gerente.getByLabel('Contraseña temporal');
  await expect(temporal).toHaveText(/^[A-Za-z]{6}\d{4}$/);
  const [clave, usuario] = [await temporal.textContent(), await gerente.getByLabel('Nombre de usuario').inputValue()];
  await gerente.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(gerente.getByText('Se creó a Paola Ríos Vega como Pendiente.', { exact: false })).toBeVisible();

  // En su propio dispositivo, con la temporal que le entregaron
  const paola = await dispositivo(browser);
  await paola.goto('/iniciar-sesion');
  await paola.getByLabel('Usuario').fill(usuario);
  await paola.getByLabel('Contraseña', { exact: true }).fill(clave);
  await paola.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(paola).toHaveURL(/\/cambiar-contrasena$/);
  await paola.getByLabel('Nueva contraseña', { exact: true }).fill('Paola2026x');
  await paola.getByLabel('Confirmar nueva contraseña', { exact: true }).fill('Paola2026x');
  await paola.getByRole('button', { name: 'Guardar y entrar' }).click();
  await expect(paola.getByRole('heading', { name: 'Hola, Paola' })).toBeVisible();

  await gerente.goto('/usuarios');
  await expect(gerente.locator('tr', { hasText: 'Paola Ríos Vega' })).toContainText('Activo');
});
