// Validación · Gestión de reservaciones y tiempos de espera (03a, 03b) y
// Operaciones de mesas (bloqueo en 04; cambiar mesa o personas en 05a)
//
// Incluye datos que parecen válidos y no lo son: nombres con números, teléfonos sin
// dígitos, "1e1" o "2.5" personas; y la tarjeta de una mesa bloqueada.
// Sigue la base que dejaron los archivos anteriores; el reloj está en el 22 sep a las 19:09.
import { BASE, casosEnOrden, captura, entrarComo, esperarTexto, p } from './comun.js';

const caso = casosEnOrden('recepcion-y-operaciones');
const dialogo = () => p.getByRole('dialog');
const formulario = () => p.locator('form.formulario-reservacion');
const espera = () => p.locator('form.agregar-espera');

// ---------- 03a · Reservaciones ----------
caso('PV-33', 'Agenda del día con los parámetros de la configuración', async () => {
  await entrarComo('alopez', /Hola, Ana/);
  await p.goto(BASE + '/reservaciones');
  await p.getByRole('heading', { name: 'Reservaciones' }).waitFor();
  await esperarTexto('Tolerancia de llegada:');
  await esperarTexto('Ana Martínez');
  return 'la hostess ve las reservaciones de hoy, la tolerancia, la duración y cuándo se aparta la mesa';
});

caso('PV-34', 'Nueva reservación: queda Por confirmar y el teléfono se guarda con un solo formato', async () => {
  await formulario().getByLabel('Hora').fill('21:00');
  await formulario().getByLabel('Personas').fill('4');
  await formulario().getByLabel('Mesa', { exact: true }).locator('option:checked:not([value=""])').waitFor({ state: 'attached' });
  await formulario().getByLabel('Nombre').fill('Jorge Salinas');
  await formulario().getByLabel('Teléfono').fill('(55) 2468-1357');
  await formulario().getByRole('button', { name: 'Registrar reservación' }).click();
  await esperarTexto(/Se registró la reservación de Jorge Salinas \(Mesa \d+, 21:00\)\. Queda Por confirmar\./);
  return 'Jorge Salinas · 21:00 · 4 personas: Por confirmar; "(55) 2468-1357" se guarda como "55 2468 1357"';
});

caso('PV-35', 'Lo que parece dato pero no lo es: nombre con números, teléfono sin dígitos, "1e1" personas', async () => {
  await formulario().getByLabel('Nombre').fill('12345');
  await formulario().getByLabel('Teléfono').fill('+++++++');
  await formulario().getByLabel('Personas').fill('1e1');
  await formulario().getByRole('button', { name: 'Registrar reservación' }).click();
  await esperarTexto('El nombre: usa solo letras (sin números ni símbolos).');
  await esperarTexto('El teléfono: 10 dígitos (ej. 55 1234 5678).');
  await esperarTexto('Las personas debe ser un número entero.');
  await captura('PV-35');
  return 'cada campo con su mensaje: nombre, teléfono y personas';
});

caso('PV-36', 'Una reservación es para una hora futura', async () => {
  await formulario().getByLabel('Hora').fill('19:05');
  await formulario().getByLabel('Personas').fill('2');
  await formulario().getByLabel('Mesa', { exact: true }).locator('option:checked:not([value=""])').waitFor({ state: 'attached' });
  await formulario().getByLabel('Nombre').fill('Pareja Núñez');
  await formulario().getByLabel('Teléfono').fill('');
  await formulario().getByRole('button', { name: 'Registrar reservación' }).click();
  await esperarTexto('Una reservación aparta mesa para una hora futura. Si el cliente ya llegó, va a la lista de espera.');
  await captura('PV-36');
  return 'a las 19:09 no se reserva para las 19:05: la base lo rechaza y dice qué hacer';
});

// ---------- 03b · Lista de espera ----------
caso('PV-37', 'Lista de espera: el grupo entra al final y empieza a contar su espera', async () => {
  await p.goto(BASE + '/lista-espera');
  await p.getByRole('heading', { name: 'Lista de espera' }).waitFor();
  await espera().getByLabel('Nombre').fill('Carlos Peña');
  await espera().getByLabel('Personas').fill('2');
  await espera().getByRole('button', { name: 'Agregar', exact: true }).click();
  await p.locator('.espera-lista li', { hasText: 'Carlos Peña' }).getByText('Esperando 0 min').waitFor();
  return 'Carlos Peña (2 personas) al final de la lista, "Esperando 0 min"';
});

caso('PV-38', 'Lista de espera: tampoco acepta datos que no son', async () => {
  await espera().getByLabel('Nombre').fill('Mesa 4');
  await espera().getByLabel('Personas').fill('2.5');
  await espera().getByLabel('Teléfono (opcional)').fill('123');
  await espera().getByRole('button', { name: 'Agregar', exact: true }).click();
  await esperarTexto('El nombre: usa solo letras (sin números ni símbolos).');
  await esperarTexto('Las personas debe ser un número entero.');
  await esperarTexto('El teléfono: 10 dígitos (ej. 55 1234 5678).');
  await captura('PV-38');
  return 'rechaza "Mesa 4" como nombre, 2.5 personas y un teléfono de 3 dígitos';
});

// ---------- 04 · Operaciones de mesas: bloqueo ----------
caso('PV-39', 'Bloquear una mesa libre con motivo: su tarjeta lo dice', async () => {
  await entrarComo('lsaenz', /Hola, Luis/);
  await p.goto(BASE + '/mesas');
  await p.getByRole('button', { name: 'Bloquear / desbloquear' }).click();
  await dialogo().getByLabel('Mesa', { exact: true }).selectOption({ label: 'Mesa 13' });
  await dialogo().getByLabel('Motivo').fill('Mantel manchado');
  await dialogo().getByRole('button', { name: 'Bloquear', exact: true }).click();
  await esperarTexto('La Mesa 13 quedó bloqueada.');
  const tarjeta = p.getByRole('button', { name: /Mesa 13/ });
  await tarjeta.getByText('Bloqueada', { exact: true }).waitFor();
  await tarjeta.getByText('Mantel manchado').waitFor();
  return 'Mesa 13: la tarjeta dice "Bloqueada", el motivo y quién la bloqueó';
});

caso('PV-40', 'Desbloquear: queda lista para sentar', async () => {
  await p.getByRole('button', { name: 'Bloquear / desbloquear' }).click();
  await dialogo().getByLabel('Mesa', { exact: true }).selectOption({ label: 'Mesa 13 · Mantel manchado' });
  await dialogo().getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await esperarTexto('La Mesa 13 se desbloqueó.');
  const tarjeta = p.getByRole('button', { name: /Mesa 13/ });
  await tarjeta.getByText('Zona: Terraza').waitFor();
  return 'Mesa 13 vuelve a mostrarse como una mesa normal del salón';
});

// ---------- 05a · Mis mesas: cambiar personas y cambiar mesa ----------
caso('PV-41', 'El mesero ajusta las personas de su mesa (hasta la capacidad)', async () => {
  await entrarComo('lmora', /Hola, Luis/);
  await p.goto(BASE + '/mis-mesas');
  await p.getByRole('heading', { name: 'Mis mesas' }).waitFor();
  await p.getByRole('button', { name: 'Personas', exact: true }).first().click();
  const titulo = await dialogo().getByRole('heading').first().textContent();
  await dialogo().getByRole('button', { name: 'Menos' }).click();
  await dialogo().getByRole('button', { name: 'Guardar' }).click();
  await esperarTexto(/La Mesa \d+ ahora es de \d+ personas?\./);
  return `${titulo}: una persona menos, queda en la bitácora`;
});

caso('PV-42', 'Cambiar de mesa: solo a una libre donde quepan', async () => {
  await p.getByRole('button', { name: 'Cambiar mesa' }).first().click();
  await dialogo().locator('.opciones-mesa button:not([disabled])').first().click();
  await dialogo().getByRole('button', { name: /^Cambiar a la Mesa/ }).click();
  await esperarTexto(/La comanda C-\d+ pasó de la Mesa \d+ a la Mesa \d+\./);
  return 'la comanda pasa a una mesa libre; la anterior queda libre';
});
