# Caja: cobro (pantalla 07)

| Se revisa | Tarea del cronograma | Pantallas |
|---|---|---|
| mié 18 nov | **Gestión de pagos y cobro** (13–18 nov) | 07 · Cobro · Cuentas abiertas |

```
07 Cobro ── Caja abierta desde las 12:00 · Turno vespertino · Arqueo de caja
   ├─ Por cobrar (mesas que pidieron la cuenta) · Abiertas (aún no la piden)
   ├─ Cuenta · Mesa 02 ── renglones ("aún en cocina") · subtotal · IVA · propina sugerida (no se suma)
   │     Pre-ticket ── Imprimir pre-ticket · Cancelar pre-ticket (vuelve a Abierta)
   └─ Registrar pago ── Efectivo (recibido → cambio) · Tarjeta / Transferencia (referencia)
         varios pagos = dividir la cuenta; al cubrir el total la comanda se cierra y la mesa queda libre
```

## Rutas de la API

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /api/caja` | cobrar o pre-ticket | Su corte abierto, por cobrar y abiertas |
| `POST /api/caja/abrir` | `caja.corte` | `{ monto_apertura, turno }` → corte Z-0032… |
| `GET /api/caja/cuentas/:id` | cobrar, pre-ticket o tickets | El pre-ticket o ticket generado |
| `POST /api/caja/cuentas/:id/pagos` | `pago.registrar` | `{ metodo, monto, monto_recibido \| referencia }` |
| `POST /api/caja/cuentas/:id/cancelar-pre-ticket` | `ticket.pre_ticket` | La comanda vuelve a Abierta (bitácora) |
| `POST /api/caja/cuentas/:id/imprimir` | pre-ticket o tickets | A la impresora térmica, o los renglones para el navegador |
| `GET /api/caja/arqueo` | caja | Lo que debe haber en el cajón (no cierra el corte) |

## Decisiones (y por qué)

**El ticket no se guarda** (esquema v3): el pre-ticket y el ticket se generan de la comanda y sus pagos
(`v_ticket`, `v_ticket_lineas`, `v_ticket_pagos`). Imprimirlo otra vez da siempre lo mismo porque el precio y el IVA
quedan congelados en la comanda.

**Dividir la cuenta = varios pagos.** La base no deja cobrar de más ni con efectivo que no alcanza, mete el
pago al corte abierto de quien cobra y cierra la comanda sola al cubrir el total (la mesa queda libre). El
cambio se calcula, no se guarda. Los pagos no se modifican ni se borran.

**Un corte abierto por cajera.** Para cobrar hay que abrir caja (fondo inicial); cada pago entra a ese corte.

**Impresión ESC/POS** (pantalla 11). Con `IMPRESORA_HOST` en `backend/.env`, el servidor manda el ticket a
la impresora térmica por la red (puerto 9100): página de códigos 850 (acentos y ñ), 42 columnas y corte de
papel. Sin impresora (o si no responde), la pantalla imprime el mismo texto con el navegador en tamaño de
ticket de 80 mm, así caja nunca se detiene.

*Pregunta probable: "¿y si el cliente pide algo después de pedir la cuenta?"* La cajera cancela el
pre-ticket (si todavía no hay pagos): la comanda vuelve a Abierta, el mesero agrega y vuelve a pedir la
cuenta. Si ya pagó, se abre otra comanda en la misma mesa.

## Pendiente de hablar en la revisión

- **Arqueo de caja**: el diseño tiene el botón pero no la pantalla. Aquí es un conteo de control que no
  cierra el corte.
- **Cuentas abiertas** (menú de la cajera): no tiene pantalla en el diseño; es la lista de comandas de todas
  las mesas, y la que pidió la cuenta abre su cobro.

## Pruebas automáticas (`npm test`)

`backend/test/caja.test.js`: lo que ve caja a las 19:09, el pre-ticket generado, permisos, imprimir sin
impresora y con una impresora de red de prueba (bytes ESC/POS), cancelar pre-ticket, pagos de más o sin
efectivo suficiente, dividir la cuenta (la comanda se cierra y la mesa queda libre) y cobrar sin caja abierta;
al mismo tiempo: la misma cuenta cobrada dos veces (entra un pago) y "Abrir caja" con doble clic.
