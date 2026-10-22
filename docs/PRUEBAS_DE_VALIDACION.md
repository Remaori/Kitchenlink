# Pruebas de validación · Menú, mesas, recepción y operaciones de mesas

| | |
|---|---|
| Ejecutada | 22 de octubre de 2026 |
| Casos de uso | **Gestionar menú, categorías y productos** (09) · **Crear mesa** (04) · **Gestión de reservaciones y tiempos de espera** (03a, 03b) · **Operaciones de mesas** (04, 05a) |
| Resultado | **22 casos · 22 pasan · 0 fallan** |

La primera prueba de validación (Iniciar sesión y Administrar roles, PV-01 a PV-20) está en
[PRUEBA_TEMPRANA_VALIDACION.md](PRUEBA_TEMPRANA_VALIDACION.md).

## Objetivo

Confirmar que estos casos de uso hacen lo que dicen sus pantallas y las reglas de la pantalla 12 (Flujos de
operación), usando la aplicación completa: navegador → app compilada → API → PostgreSQL. Incluye lo que se
cambió en la revisión del 21 de octubre (el 86 con su propio historial y el número de mesa solo entero) y datos
que parecen válidos pero no lo son.

## Cómo se hizo

**Automática, en pantalla.** Playwright abre Microsoft Edge y recorre los casos como una persona: escribe,
hace clic y espera el texto exacto que dice el diseño. Si ese texto no aparece en 5 segundos, el caso falla.
Al terminar cada caso, el mismo script guarda la captura de ese momento en
[evidencias/validacion-menu-mesas-recepcion](evidencias/validacion-menu-mesas-recepcion/). Los casos están en
`e2e/validacion/02-menu-y-mesas.spec.js` y `e2e/validacion/03-recepcion-y-operaciones.spec.js`, y cada uno
se puede repetir a mano siguiendo la columna "Pasos".

**En la API y la base.** Lo que no se ve en pantalla lo revisan las pruebas automáticas (`npm test`):
`menu.test.js`, `mesas.test.js` y `recepcion.test.js`. Por ejemplo, que la base rechace un segundo 86 abierto
del mismo producto, una mesa con número "T1" o una petición que llega al mismo tiempo que otra.

Entorno: Windows 11 · Node.js 24.21.0 · PostgreSQL 18.6 · Microsoft Edge 155 · ventana de 1440 × 900.
Base `kitchenlink_e2e`, recién instalada con los datos de demostración (172 verificaciones, todo correcto) y
el reloj de la aplicación en el martes 22 de septiembre a las 19:09, la hora de las pantallas del diseño. Los
casos van en orden: cada uno parte de cómo dejó la base el anterior.

## Casos · Menú, categorías y productos (09)

| ID | Caso | Pasos | Resultado esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| PV-21 | Catálogo | `lsaenz` (Gerente) → Menú y productos → Bebidas | Las 5 categorías con dónde se preparan; Bebidas "se preparan en barra" y muestra sus productos | Las 5 categorías; Bebidas en barra con sus productos | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-21.jpg) |
| PV-22 | Nuevo producto con precio exacto | Nuevo producto → "Agua de jamaica", precio `35.50` → Agregar | "Agua de jamaica se agregó al menú." y aparece con $35.50 | "Agua de jamaica" en Bebidas con $35.50 | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-22.jpg) |
| PV-23 | Un precio mal escrito no se adivina | Nuevo producto → "Horchata", precio `12,50` | "El precio: escribe una cantidad como 120 o 120.50." bajo el campo; no se guarda como $1,250 | Rechazado con el mensaje bajo el campo Precio | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-23.jpg) |
| PV-24 | Asignar 86 con motivo | `dbenitez` (Jefe de cocina) → Productos 86 → Guacamole → Asignar 86 → "Se acabó el aguacate" | "Guacamole quedó con 86: ya no se puede capturar." y el producto dice "Asignado 86" | Guacamole: "Asignado 86"; sigue en el menú | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-24.jpg) |
| PV-25 | Historial de 86 | Pestaña Historial de 86 | Arriba Guacamole, "Sigue agotado", con su motivo, hora y quién; también los 86 de días anteriores | Guacamole arriba (lo marcó Diego Benítez); el Pay de limón aparece 2 veces (ayer y hoy) | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-25.jpg) |
| PV-26 | Quitar 86: el registro se cierra, no se borra | Productos → Entradas → Guacamole → Quitar 86 → Historial de 86 | "Guacamole vuelve a estar disponible."; su 86 queda con hora de fin y quién lo regresó | Guacamole disponible; su 86 tiene hora de fin y quién lo regresó | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-26.jpg) |
| PV-27 | El mesero solo consulta | `lmora` (Mesero) → Menú → Postres | "Menú" sin botones para cambiarlo; el Pay de limón dice "Asignado 86" | 0 botones para cambiar el menú; Pay de limón: "Asignado 86" | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-27.jpg) |

## Casos · Crear mesa (04)

| ID | Caso | Pasos | Resultado esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| PV-28 | Crear mesa | `lsaenz` → Mesas → Crear mesa → número `22`, zona Terraza | "Se creó la Mesa 22: ya aparece en el salón como Libre." y su tarjeta | Mesa 22 (4 personas, Terraza) en el salón | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-28.jpg) |
| PV-29 | El número solo acepta enteros | Crear mesa → número `T1`, `-3`, `+5`, `2.5` y `0` | En cada uno: "El número: solo números enteros del 1 al 999 (ej. 7 o 22)." | Los cinco rechazados con el mensaje bajo el campo | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-29.jpg) |
| PV-30 | "7" es la Mesa 07 | Crear mesa → número `7` | "Ya existe la Mesa 07." | "7" se toma como la Mesa 07, que ya existe | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-30.jpg) |
| PV-31 | La capacidad no baja de una reservación | Mesa 03 → Editar mesa → bajar a 4 personas → Guardar | "Tiene la reservación de Ana Martínez para 6 personas: cámbiala de mesa primero." | La Mesa 03 no baja a 4 | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-31.jpg) |
| PV-32 | Dar de baja y reactivar | Mesa 22 → Editar mesa → Dar de baja → Sí; en "Mesas dadas de baja" → Reactivar | Pasa a "Mesas dadas de baja" y con Reactivar regresa al salón; no se borra | Igual que lo esperado | PASA · [baja](evidencias/validacion-menu-mesas-recepcion/PV-32a.jpg) · [reactivada](evidencias/validacion-menu-mesas-recepcion/PV-32.jpg) |

## Casos · Reservaciones y lista de espera (03a, 03b)

| ID | Caso | Pasos | Resultado esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| PV-33 | Agenda del día | `alopez` (Hostess) → Reservaciones | Las reservaciones de hoy, la tolerancia (15 min), la duración (2 h) y cuándo se aparta la mesa (30 min antes) | Igual que lo esperado | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-33.jpg) |
| PV-34 | Nueva reservación | Hora 21:00, 4 personas, la mesa que sugiere, "Jorge Salinas", teléfono `(55) 2468-1357` → Registrar reservación | "Se registró la reservación de Jorge Salinas (Mesa N, 21:00). Queda Por confirmar." | Por confirmar; el teléfono se guarda como "55 2468 1357" | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-34.jpg) |
| PV-35 | Datos que parecen válidos y no lo son | Nombre `12345`, teléfono `+++++++`, personas `1e1` → Registrar reservación | Bajo cada campo: el nombre solo con letras, el teléfono con 10 dígitos y las personas en número entero | Los tres rechazados, cada uno con su mensaje | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-35.jpg) |
| PV-36 | Una reservación es para una hora futura | A las 19:09: hora 19:05, 2 personas, "Pareja Núñez" → Registrar reservación | "Una reservación aparta mesa para una hora futura. Si el cliente ya llegó, va a la lista de espera." | La base lo rechaza y dice qué hacer | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-36.jpg) |
| PV-37 | Lista de espera: agregar | Lista de espera → "Carlos Peña", 2 personas → Agregar | Entra al final de la lista y empieza a contar su espera | Carlos Peña al final, "Esperando 0 min" | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-37.jpg) |
| PV-38 | Lista de espera: datos que no son | Nombre `Mesa 4`, personas `2.5`, teléfono `123` → Agregar | Los tres rechazados con su mensaje | Igual que lo esperado | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-38.jpg) |

## Casos · Operaciones de mesas (04, 05a)

| ID | Caso | Pasos | Resultado esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| PV-39 | Bloquear una mesa libre con motivo | `lsaenz` → Mesas → Bloquear / desbloquear → Mesa 13 → "Mantel manchado" → Bloquear | "La Mesa 13 quedó bloqueada."; la tarjeta dice "Bloqueada", el motivo y quién la bloqueó | Igual que lo esperado | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-39.jpg) |
| PV-40 | Desbloquear | Bloquear / desbloquear → Mesa 13 → Desbloquear | "La Mesa 13 se desbloqueó." y vuelve a mostrarse como una mesa normal | Igual que lo esperado | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-40.jpg) |
| PV-41 | El mesero ajusta las personas | `lmora` (Mesero) → Mis mesas → Personas → una menos → Guardar | "La Mesa N ahora es de N personas."; hasta la capacidad de la mesa | Mesa 09: una persona menos (queda en la bitácora) | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-41.jpg) |
| PV-42 | Cambiar de mesa | Cambiar mesa → una libre donde quepan → Cambiar a la Mesa N | "La comanda C-… pasó de la Mesa … a la Mesa …."; la anterior queda libre | C-1040 pasó de la Mesa 09 a la Mesa 01 | PASA · [captura](evidencias/validacion-menu-mesas-recepcion/PV-42.jpg) |

## Cómo repetirla

```bash
npm run e2e:validacion                     # Edge se abre y recorre todos los casos (PV-01 a PV-42) solo
E2E_OCULTO=1 E2E_LENTO=0 npm run e2e:validacion   # sin ventana y a velocidad normal
npm test                                   # pruebas automáticas de la API y la base
```

Cada corrida instala la base `kitchenlink_e2e` desde cero (la de desarrollo no se toca) y deja las capturas y lo
obtenido de cada caso en `e2e/evidencias/`. Detalles en [e2e/README.md](../e2e/README.md).
