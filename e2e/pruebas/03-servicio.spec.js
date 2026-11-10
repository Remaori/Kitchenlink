// Una mesa de principio a fin, cada quien en su pantalla y al mismo tiempo:
// 05a/05b (mesero) → 06 (cocina) → 07 (caja) → 08 (corte Z).
// Nadie recarga la página: lo que hace uno le aparece al otro por el tiempo real.
import { test, expect } from '@playwright/test';
import { dispositivo, sinFormato } from '../ayudantes.js';

// Más corto que el respaldo de 20 a 30 s de las pantallas: si llega, fue por el aviso en tiempo real
const AL_INSTANTE = { timeout: 5_000 };

test('una mesa de principio a fin: mesero, cocina y caja en sus pantallas, y el corte Z cuadra', async ({ browser }) => {
  test.setTimeout(120_000);
  const cocina = await dispositivo(browser, 'dbenitez');
  await cocina.goto('/cocina');
  await expect(cocina.getByRole('heading', { name: 'Panel de cocina' })).toBeVisible();

  const caja = await dispositivo(browser, 'mdiaz');
  await caja.goto('/cobro');
  await expect(caja.getByRole('heading', { name: 'Por cobrar' })).toBeVisible();

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
  await expect(tarjetaCocina).toBeVisible(AL_INSTANTE);
  await expect(tarjetaCocina.getByText('Nuevo', { exact: true })).toBeVisible();
  await expect(tarjetaCocina).toContainText('Flan napolitano');
  await tarjetaCocina.getByRole('button', { name: 'Empezar a preparar' }).click();
  await tarjetaCocina.getByRole('button', { name: 'Marcar como listo' }).click();
  await expect(tarjetaCocina).toContainText('Se avisó a Carlos Ruiz');

  // El mesero ve que ya está listo, lo entrega y pide la cuenta
  const entregar = mesero.getByRole('button', { name: 'Entregar' });
  await expect(entregar).toBeVisible(AL_INSTANTE);
  await entregar.click();
  await expect(mesero.getByText('Flan napolitano: entregado en la mesa.')).toBeVisible();
  await mesero.getByRole('button', { name: 'Pedir la cuenta' }).click();
  await expect(mesero.getByText('Se pidió la cuenta: caja ya puede imprimir el pre-ticket.')).toBeVisible();

  // 07 · A caja le aparece en "Por cobrar"; cobra en efectivo con cambio
  const porCobrar = caja.locator('.lista-cuentas li button').filter({ hasText: nombreMesa });
  await expect(porCobrar).toBeVisible(AL_INSTANTE);
  await porCobrar.click();
  await expect(caja.getByRole('heading', { name: `Cuenta · ${nombreMesa}` })).toBeVisible();
  await expect(caja.locator('.cuenta .renglones')).toContainText('Flan napolitano');
  await caja.getByLabel('Monto recibido').fill('500');
  await expect(caja.getByText('Cambio a entregar')).toBeVisible();
  await caja.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(caja.getByText(new RegExp(`se cerró: se generó el ticket y la ${nombreMesa} quedó libre\\.`))).toBeVisible();

  // Al mesero se le cierra la comanda en su pantalla, sin recargar
  await expect(mesero.getByText('La comanda está cerrada (ya se cobró)', { exact: false })).toBeVisible(AL_INSTANTE);

  // 08 · Corte Z: lo contado contra lo esperado (fondo + efectivo cobrado)
  await caja.goto('/ventas');
  await caja.getByRole('button', { name: 'Generar corte Z' }).click();
  const dialogo = caja.getByRole('dialog');
  const esperado = sinFormato(await dialogo.locator('dd.total').textContent());
  await dialogo.getByLabel('Efectivo contado').fill(esperado);
  await expect(dialogo.getByText('Cuadra exacto')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cerrar corte' }).click();
  await expect(dialogo).toHaveCount(0);
  await caja.getByRole('tab', { name: 'Cortes Z' }).or(caja.getByRole('button', { name: 'Cortes Z' })).click();
  const fila = caja.locator('tr', { hasText: 'Z-0031' });
  await expect(fila).toContainText('Cerrado');
  await expect(fila.locator('td').nth(10)).toHaveText('$0.00');
});
