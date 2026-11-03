// Una mesa de principio a fin, cada quien en su pantalla y al mismo tiempo:
// 05a/05b (mesero) → 06 (cocina) → el mesero entrega y pide la cuenta.
// Nadie recarga la página: lo que hace uno le aparece al otro en cuanto su pantalla se refresca.
import { test, expect } from '@playwright/test';
import { dispositivo } from '../ayudantes.js';

// Más que los 5 s en que se refrescan las pantallas de comanda, cocina y Mis mesas
const AL_REFRESCAR = { timeout: 8_000 };

test('una mesa de principio a fin: el mesero envía, cocina prepara y el mesero entrega y pide la cuenta', async ({ browser }) => {
  test.setTimeout(120_000);
  const cocina = await dispositivo(browser, 'dbenitez');
  await cocina.goto('/cocina');
  await expect(cocina.getByRole('heading', { name: 'Panel de cocina' })).toBeVisible();

  // 05a · El mesero abre la comanda de una mesa libre
  const mesero = await dispositivo(browser, 'cruiz');
  const { mesas } = await (await mesero.request.get('/api/mesas')).json();
  const mesa = mesas.find((m) => m.estado === 'libre' && !m.proxima_reservacion);
  const nombreMesa = `Mesa ${mesa.numero}`;
  await mesero.goto('/mis-mesas');
  const tarjetaMesa = mesero.locator('article.tarjeta-mi-mesa').filter({ has: mesero.getByText(nombreMesa, { exact: true }) });
  await tarjetaMesa.getByRole('button', { name: 'Abrir comanda' }).click();
  await mesero.locator('section.abrir-comanda').getByRole('button', { name: 'Abrir comanda' }).click();
  await expect(mesero).toHaveURL(/\/comandas\/\d+$/);

  // 05b · Captura dos flanes y los envía
  await mesero.getByPlaceholder('Buscar producto').fill('flan');
  const flan = mesero.getByRole('button', { name: /Flan napolitano/ });
  await flan.click();
  await flan.click();
  await expect(mesero.getByRole('heading', { name: 'Sin enviar (1)' })).toBeVisible();
  await mesero.getByRole('button', { name: 'Enviar 1 producto nuevo' }).click();
  await expect(mesero.getByText('Se enviaron 1 producto a cocina y barra.')).toBeVisible();

  // 06 · A cocina le llega la tarjeta sola, marcada como nueva
  const tarjetaCocina = cocina.locator('article.tarjeta-envio').filter({ hasText: nombreMesa });
  await expect(tarjetaCocina).toBeVisible(AL_REFRESCAR);
  await expect(tarjetaCocina.getByText('Nuevo', { exact: true })).toBeVisible();
  await expect(tarjetaCocina).toContainText('Flan napolitano');
  await tarjetaCocina.getByRole('button', { name: 'Empezar a preparar' }).click();
  await tarjetaCocina.getByRole('button', { name: 'Marcar como listo' }).click();
  await expect(tarjetaCocina).toContainText('Se avisó a Carlos Ruiz');

  // El mesero ve que ya está listo, lo entrega y pide la cuenta
  const entregar = mesero.getByRole('button', { name: 'Entregar' });
  await expect(entregar).toBeVisible(AL_REFRESCAR);
  await entregar.click();
  await expect(mesero.getByText('Flan napolitano: entregado en la mesa.')).toBeVisible();
  await mesero.getByRole('button', { name: 'Pedir la cuenta' }).click();
  await expect(mesero.getByText('Se pidió la cuenta: caja ya puede imprimir el pre-ticket.')).toBeVisible();
  await expect(mesero.getByText('Por cobrar: caja ya puede cobrarla')).toBeVisible();
});
