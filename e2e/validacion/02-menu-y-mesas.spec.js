// Validación · Gestionar menú, categorías y productos (09) y Crear mesa (04)
//
// Los casos de la revisión del 21 oct, con lo que se corrigió después de ella: el 86 tiene su
// propia tabla (historial con motivo, fecha y quién) y el número de mesa solo acepta enteros.
// Sigue la base que dejó 01-prueba-temprana (mismos datos de demostración, mismo reloj).
import { BASE, casosEnOrden, captura, entrarComo, esperarTexto, p } from './comun.js';

const caso = casosEnOrden('menu-y-mesas');
const dialogo = () => p.getByRole('dialog');
const enviarDialogo = () => dialogo().locator('button[type="submit"]').click();
const filaProducto = (nombre) => p.locator('tr', { has: p.getByText(nombre, { exact: true }) });

// ---------- 09 · Menú, categorías y productos ----------
caso('PV-21', 'El catálogo: categorías con dónde se preparan y sus productos', async () => {
  await entrarComo('lsaenz', /Hola, Luis/);
  await p.goto(BASE + '/menu');
  await p.getByRole('heading', { name: 'Menú y productos' }).waitFor();
  await p.getByRole('button', { name: /^Bebidas/ }).click();
  await esperarTexto('Limonada natural');
  await esperarTexto('se preparan en barra');
  return 'el gerente ve las 5 categorías; Bebidas se prepara en barra y muestra sus productos';
});

caso('PV-22', 'Nuevo producto: el precio se guarda exacto', async () => {
  await p.getByRole('button', { name: 'Nuevo producto' }).click();
  await dialogo().getByLabel('Nombre').fill('Agua de jamaica');
  await dialogo().getByLabel('Precio').fill('35.50');
  await enviarDialogo();
  await esperarTexto('Agua de jamaica se agregó al menú.');
  await filaProducto('Agua de jamaica').getByText('$35.50').waitFor();
  return '"Agua de jamaica" en Bebidas con $35.50';
});

caso('PV-23', 'Un precio mal escrito no se adivina ("12,50" no es $1,250)', async () => {
  await p.getByRole('button', { name: 'Nuevo producto' }).click();
  await dialogo().getByLabel('Nombre').fill('Horchata');
  await dialogo().getByLabel('Precio').fill('12,50');
  await enviarDialogo();
  await esperarTexto('El precio: escribe una cantidad como 120 o 120.50.');
  await captura('PV-23');
  await dialogo().getByRole('button', { name: 'Cancelar' }).click();
  return 'rechaza "12,50" con el mensaje bajo el campo Precio (no lo guarda como $1,250)';
});

caso('PV-24', 'Asignar 86 con motivo (jefe de cocina)', async () => {
  await entrarComo('dbenitez', /Hola, Diego/);
  await p.goto(BASE + '/menu');
  await p.getByRole('heading', { name: 'Productos 86' }).waitFor();
  await filaProducto('Guacamole').getByRole('button', { name: 'Asignar 86' }).click();
  await dialogo().getByLabel('Motivo').fill('Se acabó el aguacate');
  await enviarDialogo();
  await esperarTexto('Guacamole quedó con 86: ya no se puede capturar.');
  await filaProducto('Guacamole').getByText('Asignado 86').waitFor();
  return 'Guacamole: "Asignado 86"; sigue en el menú';
});

caso('PV-25', 'Historial de 86: cada vez que algo se agotó, con motivo, fecha y quién', async () => {
  await p.getByRole('button', { name: 'Historial de 86' }).click();
  const fila = p.locator('tbody tr').first();
  await fila.getByText('Guacamole').waitFor();
  await fila.getByText('Sigue agotado').waitFor();
  const pay = await p.locator('tbody tr', { hasText: 'Pay de limón' }).count();
  return `arriba Guacamole (Sigue agotado, lo marcó Diego Benítez); el Pay de limón aparece ${pay} veces (ayer y hoy)`;
});

caso('PV-26', 'Quitar 86: vuelve a estar disponible y el registro se cierra, no se borra', async () => {
  await p.getByRole('button', { name: 'Productos', exact: true }).click();
  await p.getByRole('button', { name: /^Entradas/ }).click();
  await filaProducto('Guacamole').getByRole('button', { name: 'Quitar 86' }).click();
  await esperarTexto('Guacamole vuelve a estar disponible.');
  await p.getByRole('button', { name: 'Historial de 86' }).click();
  const fila = p.locator('tbody tr').first();
  await fila.getByText('Guacamole').waitFor();
  if (await fila.getByText('Sigue agotado').count()) throw new Error('el 86 de Guacamole sigue abierto');
  return 'Guacamole disponible; en el historial su 86 ya tiene hora de fin y quién lo regresó';
});

caso('PV-27', 'El mesero solo consulta el menú y ve lo agotado', async () => {
  await entrarComo('lmora', /Hola, Luis/);
  await p.goto(BASE + '/menu');
  await p.getByRole('heading', { name: 'Menú', exact: true }).waitFor();
  await p.getByRole('button', { name: /^Postres/ }).click();
  await filaProducto('Pay de limón').getByText('Asignado 86').waitFor();
  const botones = await p.getByRole('button', { name: /Nuevo producto|Asignar 86|Historial de 86/ }).count();
  return `Mesero: "Menú" sin botones para cambiarlo (${botones}); el Pay de limón dice "Asignado 86"`;
});

// ---------- 04 · Crear mesa ----------
caso('PV-28', 'Crear mesa: nace Libre con número, capacidad y zona', async () => {
  await entrarComo('lsaenz', /Hola, Luis/);
  await p.goto(BASE + '/mesas');
  await p.getByRole('button', { name: 'Crear mesa' }).first().click();
  await dialogo().getByLabel('Número').fill('22');
  await dialogo().getByLabel('Zona').fill('Terraza');
  await enviarDialogo();
  await esperarTexto('Se creó la Mesa 22: ya aparece en el salón como Libre.');
  await p.getByRole('button', { name: /Mesa 22/ }).waitFor();
  return 'Mesa 22 (4 personas, Terraza) aparece en el salón';
});

caso('PV-29', 'El número de mesa solo acepta enteros (revisión del 21 oct)', async () => {
  await p.getByRole('button', { name: 'Crear mesa' }).first().click();
  const rechazados = [];
  for (const numero of ['T1', '-3', '+5', '2.5', '0']) {
    await dialogo().getByLabel('Número').fill(numero);
    await enviarDialogo();
    await dialogo().getByText('El número: solo números enteros del 1 al 999 (ej. 7 o 22).').waitFor();
    rechazados.push(numero);
  }
  await captura('PV-29');
  await dialogo().getByRole('button', { name: 'Cancelar' }).click();
  return `rechaza ${rechazados.map((n) => `"${n}"`).join(', ')} con el mensaje bajo el campo`;
});

caso('PV-30', '"7" es la Mesa 07: el número no se repite', async () => {
  await p.getByRole('button', { name: 'Crear mesa' }).first().click();
  await dialogo().getByLabel('Número').fill('7');
  await enviarDialogo();
  await dialogo().getByText('Ya existe la Mesa 07.').waitFor();
  await captura('PV-30');
  await dialogo().getByRole('button', { name: 'Cancelar' }).click();
  return '"7" se toma como Mesa 07, que ya existe';
});

caso('PV-31', 'La capacidad no baja de una reservación ya hecha', async () => {
  await p.getByRole('button', { name: /Mesa 03/ }).click();
  await dialogo().getByRole('button', { name: 'Editar mesa' }).click();
  for (let i = 0; i < 2; i += 1) await dialogo().getByRole('button', { name: 'Una persona menos' }).click();
  await enviarDialogo();
  await dialogo().getByText('Tiene la reservación de Ana Martínez para 6 personas: cámbiala de mesa primero.').waitFor();
  await captura('PV-31');
  await dialogo().getByRole('button', { name: 'Cancelar' }).click();
  return 'Mesa 03 no baja a 4: tiene la reservación de Ana Martínez para 6';
});

caso('PV-32', 'Dar de baja y reactivar: la mesa no se borra', async () => {
  await p.getByRole('button', { name: /Mesa 22/ }).click();
  await dialogo().getByRole('button', { name: 'Editar mesa' }).click();
  await dialogo().getByRole('button', { name: 'Dar de baja' }).click();
  await dialogo().getByRole('button', { name: 'Sí, dar de baja' }).click();
  await esperarTexto('La Mesa 22 quedó dada de baja.');
  await p.getByRole('heading', { name: 'Mesas dadas de baja' }).waitFor();
  await captura('PV-32a');
  await p.locator('.mesas-baja li', { hasText: 'Mesa 22' }).getByRole('button', { name: 'Reactivar' }).click();
  await esperarTexto('La Mesa 22 regresó al salón.');
  return 'Mesa 22 pasa a "Mesas dadas de baja" y con Reactivar regresa al salón';
});
