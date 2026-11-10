// /api/caja · 07 Cobro · /api/ventas · 08 Historial de ventas · /api/reportes · 10 Supervisión y reportes
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as caja from '../servicios/caja.js';
import * as ventas from '../servicios/ventas.js';
import * as reportes from '../servicios/reportes.js';
import { cambia, id, yo } from './ayudantes.js';

const comanda = id('comanda');
const corte = id('corte');
const temas = ['caja', 'comandas', 'mesas'];
const enviarArchivo = (res, { nombre, contenido }) => res
  .set('Content-Type', 'text/csv; charset=utf-8')
  .set('Content-Disposition', `attachment; filename="${nombre}"`)
  .send(contenido);

// ------------------------------------------------------------- 07 · Cobro
export const rutasCaja = Router();
rutasCaja.use(autenticar());
const cobra = exigirPermiso('pago.registrar');
const preTicket = exigirPermiso('ticket.pre_ticket');

rutasCaja.get('/', exigirPermiso('pago.registrar', 'ticket.pre_ticket'), async (req, res) => res.json(await caja.resumen(yo(req))));
rutasCaja.get('/arqueo', exigirPermiso('caja.corte', 'pago.registrar'), async (req, res) => res.json(await caja.arqueo(yo(req))));
rutasCaja.post('/abrir', exigirPermiso('caja.corte'), cambia(['caja'], (req) => caja.abrirCaja(req.body, yo(req)), 201));
rutasCaja.get('/cuentas/:id', exigirPermiso('pago.registrar', 'ticket.pre_ticket', 'ticket.emitir'), async (req, res) => res.json(await caja.ticket(comanda(req))));
rutasCaja.post('/cuentas/:id/pagos', cobra, cambia(temas, (req) => caja.registrarPago(comanda(req), req.body, yo(req)), 201));
rutasCaja.post('/cuentas/:id/cancelar-pre-ticket', preTicket, cambia(temas, (req) => caja.cancelarPreTicket(comanda(req), yo(req))));
rutasCaja.post('/cuentas/:id/imprimir', exigirPermiso('ticket.pre_ticket', 'ticket.emitir'), async (req, res) => res.json(await caja.imprimirTicket(comanda(req))));

// ------------------------------------------------- 08 · Historial de ventas
export const rutasVentas = Router();
rutasVentas.use(autenticar(), exigirPermiso('caja.corte', 'ticket.emitir', 'reporte.ver'));

rutasVentas.get('/', async (req, res) => res.json(await ventas.historial(req.query.fecha)));
rutasVentas.get('/exportar', async (req, res) => enviarArchivo(res, await ventas.exportar(req.query.fecha)));
rutasVentas.get('/tickets/:id', async (req, res) => res.json(await caja.ticket(comanda(req))));
rutasVentas.post('/tickets/:id/imprimir', exigirPermiso('ticket.emitir'), async (req, res) => res.json(await caja.imprimirTicket(comanda(req))));
rutasVentas.get('/cortes/:id', async (req, res) => res.json(await ventas.corte(corte(req))));
rutasVentas.post('/cortes/:id/cerrar', exigirPermiso('caja.corte'), cambia(['caja'], (req) => ventas.cerrarCorte(corte(req), req.body, yo(req))));
rutasVentas.post('/cortes/:id/imprimir', exigirPermiso('caja.corte'), async (req, res) => res.json(await ventas.imprimirCorte(corte(req))));

// ------------------------------------------------ 10 · Supervisión y reportes
export const rutasReportes = Router();
rutasReportes.use(autenticar(), exigirPermiso('reporte.ver'));

rutasReportes.get('/', async (req, res) => res.json(await reportes.reporte(req.query)));
rutasReportes.get('/exportar', async (req, res) => enviarArchivo(res, await reportes.exportar(req.query)));
