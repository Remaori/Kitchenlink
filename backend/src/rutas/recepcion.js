// /api/reservaciones (03a) y /api/lista-espera (03b) · «Gestionar reservaciones y lista de espera»
import { Router } from 'express';
import { autenticar, exigirPermiso } from '../seguridad/middleware.js';
import * as recepcion from '../servicios/recepcion.js';
import { cambia, id, yo } from './ayudantes.js';

const temas = ['reservaciones', 'espera', 'mesas'];

export const reservaciones = Router();
reservaciones.use(autenticar(), exigirPermiso('reservacion.gestionar'));
const reservacion = id('reservación');

reservaciones.get('/', async (req, res) => res.json(await recepcion.agenda(req.query.fecha)));
reservaciones.get('/mesas', async (req, res) => res.json(await recepcion.mesasParaReservar(req.query)));
reservaciones.post('/', cambia(temas, (req) => recepcion.crear(req.body, yo(req)), 201));
reservaciones.put('/:id', cambia(temas, (req) => recepcion.editar(reservacion(req), req.body, yo(req))));
reservaciones.post('/:id/confirmar', cambia(temas, (req) => recepcion.confirmar(reservacion(req), yo(req))));
reservaciones.post('/:id/llegada', cambia(temas, (req) => recepcion.marcarLlegada(reservacion(req), yo(req))));
reservaciones.post('/:id/cancelar', cambia(temas, (req) => recepcion.cancelar(reservacion(req), yo(req))));
reservaciones.post('/:id/lista-espera', cambia(temas, (req) => recepcion.pasarALista(reservacion(req), req.body, yo(req)), 201));

export const listaEspera = Router();
listaEspera.use(autenticar(), exigirPermiso('reservacion.gestionar'));
const grupo = id('grupo en la lista de espera');

listaEspera.get('/', async (_req, res) => res.json(await recepcion.listaDeEspera()));
listaEspera.post('/', cambia(temas, (req) => recepcion.agregarAEspera(req.body, yo(req)), 201));
listaEspera.post('/:id/asignar', cambia(temas, (req) => recepcion.asignarMesa(grupo(req), req.body, yo(req))));
listaEspera.post('/:id/retirar', cambia(temas, (req) => recepcion.retirar(grupo(req), yo(req))));
