# Pruebas de pantalla (de punta a punta)

`npm test` revisa la API y la base. Estas pruebas revisan lo que ve cada persona: un navegador real
(Microsoft Edge) usa la aplicación compilada como en el restaurante, con varios dispositivos a la vez.

```bash
npm run e2e                          # desde la raíz del repositorio (la primera vez instala Playwright)
npm run reporte --prefix e2e         # el reporte de la última corrida, con capturas si algo falló
```

## Qué revisan

| Archivo | Recorrido |
|---|---|
| `01-sesion.spec.js` | Entrar con usuario y contraseña; contraseña equivocada; un mesero sin «Usuarios y roles» ve «Sin acceso»; cerrar sesión |
| `02-usuarios.spec.js` | El gerente da de alta a una mesera (02b); ella entra con su temporal, crea su contraseña (01b) y queda Activa |

## Pruebas de validación (con la ventana visible)

```bash
npm run e2e:validacion                     # desde la raíz: Edge se abre y recorre los casos solo
E2E_LENTO=0 npm run e2e:validacion         # a velocidad normal (por omisión espera 450 ms entre acciones)
E2E_OCULTO=1 npm run e2e:validacion        # sin ventana
```

Recorren la aplicación como una persona: escriben, hacen clic y esperan el texto exacto que dice el diseño;
si no aparece en 5 s, el caso falla. Al terminar cada caso guardan su captura en `evidencias/` (`PV-01.jpg`…,
o `PV-xx-falla.jpg`) y lo obtenido en `evidencias/<archivo>.json`. Van en orden: cada archivo sigue la base que
dejó el anterior.

| Archivo | Casos |
|---|---|
| `validacion/01-prueba-temprana.spec.js` | PV-01 a PV-20 · Iniciar sesión y Administrar roles. Es el script de la prueba temprana ([docs/PRUEBA_TEMPRANA_VALIDACION.md](../docs/PRUEBA_TEMPRANA_VALIDACION.md)); PV-03, 05, 08, 09 y 10 no se ven en pantalla y los revisa `backend/test/autenticacion.test.js` |
| `validacion/02-menu-y-mesas.spec.js` | PV-21 a PV-32 · catálogo, producto con precio exacto, precio mal escrito, asignar y quitar 86 con su historial, el menú del mesero, crear mesa, número solo entero, "7" = Mesa 07, capacidad contra una reservación, baja y reactivación |
| `validacion/03-recepcion-y-operaciones.spec.js` | PV-33 a PV-42 · agenda, nueva reservación, datos que no son (nombre con números, teléfono sin dígitos, "1e1" personas), hora que ya pasó, lista de espera, bloquear y desbloquear una mesa, cambiar personas y cambiar mesa |

El resultado y las capturas de PV-21 a PV-42 están en [docs/PRUEBAS_DE_VALIDACION.md](../docs/PRUEBAS_DE_VALIDACION.md).
Usan la misma base, API y app compilada que las demás pruebas de pantalla (`validacion.config.js`). Ayudantes
compartidos (ventana, captura, entrar y salir): `validacion/comun.js`.

## Cómo funcionan

- **Base aparte.** Cada corrida borra e instala `kitchenlink_e2e` con los datos de demostración
  (`preparar-base.mjs`). La base de desarrollo no se toca.
- **Puertos aparte.** La API de las pruebas escucha en `127.0.0.1:3100` y la app compilada en
  `localhost:4180`, así que se pueden correr con `npm run dev` encendido. Playwright las levanta y las apaga.
- **A la hora de las pantallas.** El reloj de la API queda detenido el 22 de septiembre a las 19:09
  (`RELOJ_INICIO`), la hora de los datos de demostración y del diseño.
- **Navegador.** Usa el Edge de Windows, sin descargar nada. En otro equipo: `E2E_NAVEGADOR=chrome`, o
  `npx playwright install chromium` y `E2E_NAVEGADOR=chromium`.
- **En orden.** Un solo navegador a la vez (`workers: 1`): las pruebas comparten la base, como un turno.

Si una prueba falla, `resultados/` guarda la captura de la pantalla y un *trace* para ver paso a paso qué
pasó (`npx playwright show-trace <archivo>`).
