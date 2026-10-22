// Prueba temprana de validación · Iniciar sesión (01, 01b) y Administrar roles (02c)
//
// Es el script con el que Edge ejecutó la prueba del 8 oct (docs/PRUEBA_TEMPRANA_VALIDACION.md),
// pasado a Playwright Test. Recorre en orden los casos que se validan desde la pantalla, como
// una persona (escribe, hace clic, espera el texto que dice el diseño), y guarda una captura por
// caso en e2e/evidencias/ (PV-01.jpg…) y lo obtenido en evidencias/prueba-temprana.json.
// Si el texto esperado no aparece, el caso falla y queda PV-xx-falla.jpg.
//   npm run e2e:validacion          desde la raíz, con la ventana visible (validacion.config.js)
// Ayudantes (ventana, captura, entrar y salir): comun.js
//
// Los casos que no se ven en pantalla (PV-03, 05, 08, 09 y 10) los revisa backend/test/autenticacion.test.js.
import { BASE, DIR, casosEnOrden, entrar, esperarTexto, nuevaPagina, p, salir, usar } from './comun.js';

const caso = casosEnOrden('prueba-temprana');

// ---------- CU Iniciar sesión ----------
caso('PV-02', 'Contraseña incorrecta', async () => {
  await entrar('lsaenz', 'Equivocada1');
  await esperarTexto('Usuario o contraseña incorrectos.');
  if (await p.getByLabel('Contraseña', { exact: true }).inputValue() !== '') throw new Error('no se limpió la contraseña');
  return 'muestra "Usuario o contraseña incorrectos." y limpia la contraseña';
});
caso('PV-04', 'Cuenta dada de baja', async () => {
  await entrar('jvega', 'Kitchen2026');
  await esperarTexto('Tu cuenta está dada de baja. Si es un error, habla con el gerente.');
  return 'no entra y se le explica que está dado de baja';
});
caso('PV-06', 'Primer inicio de un usuario Pendiente (01b)', async () => {
  await entrar('smendez', 'Temporal2026');
  await p.getByRole('heading', { name: 'Crea tu contraseña' }).waitFor();
  await p.getByLabel('Nueva contraseña', { exact: true }).fill('Sofia2026');
  await p.getByLabel('Confirmar nueva contraseña').fill('Sofia2026');
  const cumplidas = await p.locator('.reglas li.cumple').count();
  await p.waitForTimeout(300); await p.screenshot({ path: `${DIR}/PV-06a.jpg`, type: 'jpeg', quality: 80 });
  await p.getByRole('button', { name: 'Guardar y entrar' }).click();
  await p.getByRole('heading', { name: /Hola, Sofía/ }).waitFor();
  return `01b con ${cumplidas}/3 reglas en verde; al guardar entra como Mesero (Activo)`;
});
caso('PV-07', '01b no deja ir a otra pantalla', async () => {
  await salir();
  await entrar('cruiz', 'Kitchen2026');
  await p.getByRole('heading', { name: /Hola, Carlos/ }).waitFor();
  await salir();
  // El gerente restablece la contraseña de Carlos desde 02a y lee la temporal del diálogo
  await entrar('lsaenz', 'Kitchen2026');
  await p.getByRole('heading', { name: /Hola, Luis/ }).waitFor();
  await p.goto(BASE + '/usuarios');
  await p.locator('tr', { hasText: 'Carlos Ruiz' }).getByRole('button', { name: 'Restablecer contraseña' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Restablecer contraseña' }).click();
  const temporal = (await p.locator('.temporal-valor').textContent()).trim();
  await p.getByRole('button', { name: 'Listo' }).click();
  await salir();
  await entrar('cruiz', temporal);
  await p.getByRole('heading', { name: 'Crea tu nueva contraseña' }).waitFor();
  await p.goto(BASE + '/usuarios');
  await p.getByRole('heading', { name: 'Crea tu nueva contraseña' }).waitFor();
  return `con la temporal entra a 01b ("El gerente restableció tu contraseña") y /usuarios lo regresa a 01b`;
});
caso('PV-01', 'Entrada correcta con menú según permisos', async () => {
  await p.getByRole('button', { name: 'Cancelar y volver al inicio de sesión' }).click();
  await entrar('lsaenz', 'Kitchen2026');
  await p.getByRole('heading', { name: /Hola, Luis/ }).waitFor();
  await esperarTexto('17 permisos, según las casillas de tu rol en «Roles y permisos».');
  const menu = await p.getByRole('link', { name: 'Usuarios y roles' }).count();
  return `entra como Gerente con 17 permisos; "Usuarios y roles" en el menú: ${menu ? 'sí' : 'no'}`;
});

// ---------- CU Administrar roles ----------
caso('PV-11', 'Lista de roles y casillas por módulo', async () => {
  await p.getByRole('link', { name: 'Usuarios y roles' }).click();
  await p.getByRole('link', { name: 'Roles y permisos' }).click();
  await p.getByRole('button', { name: /^Mesero/ }).click();
  await p.getByRole('heading', { name: 'Rol: Mesero' }).waitFor();
  const contador = await p.getByText(/de 17 permisos activos/).textContent();
  const roles = await p.locator('.lista-roles li').count();
  return `${roles} roles; Mesero: ${contador}, "${await p.locator('.pastilla').textContent()}"`;
});
caso('PV-17', 'Rol del sistema (Gerente) protegido', async () => {
  await p.getByRole('button', { name: /^Gerente/ }).click();
  await p.getByRole('heading', { name: 'Rol: Gerente' }).waitFor();
  const deshabilitadas = await p.locator('.modulos input:disabled').count();
  const baja = await p.getByRole('button', { name: 'Dar de baja rol' }).isDisabled();
  const nombre = await p.getByLabel('Nombre del rol').isDisabled();
  return `candado "Sistema"; ${deshabilitadas}/17 casillas bloqueadas; nombre bloqueado: ${nombre}; "Dar de baja rol" deshabilitado: ${baja}`;
});
caso('PV-14', 'Marcar y desmarcar casillas y guardar', async () => {
  await p.getByRole('button', { name: /^Hostess/ }).click();
  await p.getByRole('heading', { name: 'Rol: Hostess' }).waitFor();
  await p.getByLabel('Crear y bloquear mesas').uncheck();
  await p.getByLabel('Consultar reportes').check();
  const contador = await p.getByText(/de 17 permisos activos/).textContent();
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await esperarTexto('Se guardaron los cambios del rol Hostess.');
  return `quita "Crear y bloquear mesas", agrega "Consultar reportes": ${contador}; aviso de guardado`;
});
caso('PV-15', 'Cambios sin guardar piden confirmación', async () => {
  await p.getByLabel('Ver el estado de las mesas').uncheck();
  await p.getByRole('button', { name: /^Cajera/ }).click();
  await p.getByRole('dialog').getByText('Tienes cambios sin guardar en el rol Hostess.').waitFor();
  await p.waitForTimeout(300); await p.screenshot({ path: `${DIR}/PV-15.jpg`, type: 'jpeg', quality: 80 });
  await p.getByRole('button', { name: 'Descartar' }).click();
  await p.getByRole('heading', { name: 'Rol: Cajera' }).waitFor();
  await p.getByRole('button', { name: /^Hostess/ }).click();
  const sigue = await p.getByLabel('Ver el estado de las mesas').isChecked();
  return `pregunta antes de cambiar de rol; al descartar, Hostess conserva "Ver el estado de las mesas": ${sigue}`;
});
caso('PV-18', 'No se da de baja un rol con usuarios', async () => {
  await p.getByRole('button', { name: /^Mesero/ }).click();
  await p.getByRole('heading', { name: 'Rol: Mesero' }).waitFor();
  await esperarTexto('No se puede dar de baja este rol mientras tenga usuarios asignados.');
  return `"Dar de baja rol" deshabilitado: ${await p.getByRole('button', { name: 'Dar de baja rol' }).isDisabled()}, con el aviso de la pantalla`;
});
caso('PV-12', 'Nuevo rol', async () => {
  await p.getByRole('button', { name: 'Nuevo rol' }).click();
  await p.getByLabel('Nombre del rol').fill('Supervisor de piso');
  await p.getByLabel('Descripción').fill('Revisa el salón y los reportes del turno');
  await p.getByLabel('Ver el estado de las mesas').check();
  await p.getByLabel('Consultar reportes').check();
  await p.getByRole('button', { name: 'Crear rol' }).click();
  await esperarTexto('Se creó el rol Supervisor de piso. Ya lo puedes asignar en Usuarios.');
  return `"Supervisor de piso" en la lista con ${await p.getByText(/de 17 permisos activos/).textContent()}`;
});
caso('PV-13', 'Nombre de rol repetido', async () => {
  await p.getByRole('button', { name: 'Nuevo rol' }).click();
  await p.getByLabel('Nombre del rol').fill('MESERO');
  await p.getByRole('button', { name: 'Crear rol' }).click();
  await esperarTexto('Ya existe el rol «Mesero».');
  await p.waitForTimeout(300); await p.screenshot({ path: `${DIR}/PV-13.jpg`, type: 'jpeg', quality: 80 });
  await p.getByRole('button', { name: 'Cancelar' }).click();
  await p.getByRole('button', { name: 'Descartar' }).click();
  return 'rechaza "MESERO" con el mensaje bajo el campo';
});
caso('PV-19', 'Dar de baja y reactivar un rol sin usuarios activos', async () => {
  await p.getByRole('button', { name: /^Encargado de barra/ }).click();
  await p.getByRole('heading', { name: 'Rol: Encargado de barra' }).waitFor();
  await p.getByRole('button', { name: 'Dar de baja rol' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Dar de baja rol' }).click();
  await esperarTexto('El rol Encargado de barra quedó dado de baja: ya no se puede asignar.');
  await p.screenshot({ path: `${DIR}/PV-19a.jpg`, type: 'jpeg', quality: 80 });
  await p.goto(BASE + '/usuarios/nuevo');
  await p.getByLabel('Rol').waitFor();
  const opciones = await p.getByLabel('Rol').locator('option').allTextContents();
  if (opciones.includes('Encargado de barra')) throw new Error('el rol dado de baja aparece en 02b');
  await p.goto(BASE + '/roles');
  await p.getByRole('button', { name: /^Encargado de barra/ }).click();
  await p.getByRole('button', { name: 'Reactivar rol' }).click();
  await esperarTexto('El rol Encargado de barra se reactivó.');
  return 'se da de baja (va al final de la lista), no aparece al dar de alta usuarios y se reactiva';
});
caso('PV-16', 'El cambio aplica sin volver a entrar', async () => {
  // Hostess (Ana López) tiene ahora «Consultar reportes» (PV-14): al darle «Administrar roles», su menú lo muestra al navegar
  const otra = await nuevaPagina();
  const g = p;
  usar(otra);
  await entrar('alopez', 'Kitchen2026');
  await p.getByRole('heading', { name: /Hola, Ana/ }).waitFor();
  const antes = await p.getByRole('link', { name: 'Usuarios y roles' }).count();
  usar(g);
  await p.getByRole('button', { name: /^Hostess/ }).click();
  await p.getByLabel('Administrar roles y permisos').check();
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await esperarTexto('Se guardaron los cambios del rol Hostess.');
  usar(otra);
  await p.getByRole('link', { name: 'Inicio' }).click();
  await p.goto(BASE + '/roles');
  await p.getByRole('heading', { name: /^Rol: / }).waitFor();
  const despues = await p.getByRole('link', { name: 'Usuarios y roles' }).count();
  await p.screenshot({ path: `${DIR}/PV-16.jpg`, type: 'jpeg', quality: 80 });
  await otra.close();
  usar(g);
  // Se deja Hostess como estaba
  await p.getByLabel('Administrar roles y permisos').uncheck();
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  await esperarTexto('Se guardaron los cambios del rol Hostess.');
  return `Ana López ya con sesión abierta: "Usuarios y roles" en su menú antes ${antes ? 'sí' : 'no'}, después ${despues ? 'sí' : 'no'} (sin volver a entrar)`;
});
caso('PV-20', 'Un rol sin el permiso no entra a la pantalla', async () => {
  await salir();
  await entrar('lmora', 'Kitchen2026');
  await p.getByRole('heading', { name: /Hola, Luis/ }).waitFor();
  const menu = await p.getByRole('link', { name: 'Usuarios y roles' }).count();
  await p.goto(BASE + '/roles');
  await esperarTexto('Sin acceso');
  return `Mesero: sin "Usuarios y roles" en el menú (${menu}); /roles muestra "Sin acceso"`;
});
